//! 服务器探活：请求游戏本体的 `/healthz`，判定标准与游戏自己的 `tools/doctor.mjs` 一致
//! （`{"ok":true,"uptimeSec":N}`）。
//!
//! 只用 `std::net` 手写一个最小 HTTP/1.1 请求，不引入 HTTP 客户端依赖：
//! 探测目标是明文 HTTP 的自家服务器，响应体很小，`Connection: close` 读到 EOF 就够。

use serde::Serialize;
use std::io::{ErrorKind, Read, Write};
use std::net::{SocketAddr, TcpStream, ToSocketAddrs};
use std::time::{Duration, Instant};

pub const CONNECT_TIMEOUT: Duration = Duration::from_millis(1500);
pub const READ_TIMEOUT: Duration = Duration::from_millis(2000);
/// 响应体上限，防止对端一直吐数据。
const MAX_RESPONSE: usize = 64 * 1024;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProbeResult {
    pub ok: bool,
    pub latency_ms: u64,
    pub status: Option<u16>,
    pub uptime_sec: Option<u64>,
    pub error: Option<String>,
}

impl ProbeResult {
    fn failed(started: Instant, error: impl Into<String>) -> Self {
        Self { ok: false, latency_ms: started.elapsed().as_millis() as u64, status: None, uptime_sec: None, error: Some(error.into()) }
    }
}

/// 探测一台服务器，永不 `Err`：失败信息放在 `error` 里。
pub fn probe(host: &str, port: u16) -> ProbeResult {
    let started = Instant::now();
    let addrs = match resolve(host, port) {
        Ok(addrs) => addrs,
        Err(error) => return ProbeResult::failed(started, error),
    };

    let mut last_error = format!("无法连接 {host}:{port}");
    for addr in addrs {
        match TcpStream::connect_timeout(&addr, CONNECT_TIMEOUT) {
            Ok(stream) => match exchange(stream, host, port, started) {
                Ok(result) => return result,
                Err(error) => last_error = error,
            },
            Err(err) => last_error = format!("连接 {addr} 失败：{err}"),
        }
    }
    ProbeResult::failed(started, last_error)
}

fn resolve(host: &str, port: u16) -> Result<Vec<SocketAddr>, String> {
    match (host, port).to_socket_addrs() {
        Ok(iter) => {
            let addrs: Vec<SocketAddr> = iter.collect();
            if addrs.is_empty() {
                Err(format!("无法解析主机名 {host}"))
            } else {
                Ok(addrs)
            }
        }
        Err(err) => Err(format!("无法解析主机名 {host}：{err}")),
    }
}

fn exchange(mut stream: TcpStream, host: &str, port: u16, started: Instant) -> Result<ProbeResult, String> {
    let _ = stream.set_read_timeout(Some(READ_TIMEOUT));
    let _ = stream.set_write_timeout(Some(READ_TIMEOUT));
    let _ = stream.set_nodelay(true);

    // IPv6 字面量在 Host 头里必须加方括号。
    let host_header = if host.contains(':') { format!("[{host}]:{port}") } else { format!("{host}:{port}") };
    let request = format!(
        "GET /healthz HTTP/1.1\r\nHost: {host_header}\r\nAccept: application/json\r\nUser-Agent: ezSPclient/{}\r\nConnection: close\r\n\r\n",
        env!("CARGO_PKG_VERSION")
    );
    stream.write_all(request.as_bytes()).map_err(|e| format!("发送请求失败：{e}"))?;

    let mut raw = Vec::new();
    let mut buf = [0u8; 4096];
    loop {
        match stream.read(&mut buf) {
            Ok(0) => break,
            Ok(n) => {
                raw.extend_from_slice(&buf[..n]);
                if raw.len() >= MAX_RESPONSE {
                    break;
                }
            }
            // 读超时：已经拿到的数据照常解析（服务器可能不给 Connection: close 的机会）。
            Err(err) if matches!(err.kind(), ErrorKind::WouldBlock | ErrorKind::TimedOut) => break,
            Err(err) => {
                if raw.is_empty() {
                    return Err(format!("读取响应失败：{err}"));
                }
                break;
            }
        }
    }

    let latency_ms = started.elapsed().as_millis() as u64;
    let status = status_code(&raw);
    let text = String::from_utf8_lossy(&raw);
    let body = body_of(&text);
    let health = health_json(body);

    let ok = status == Some(200) && health.as_ref().and_then(|v| v.get("ok")).and_then(|v| v.as_bool()) == Some(true);
    let uptime_sec = health.as_ref().and_then(|v| v.get("uptimeSec")).and_then(|v| v.as_u64());

    let error = if ok {
        None
    } else if status.is_none() {
        Some("连接上了但没收到合法 HTTP 响应（可能不是网页服务器）".to_string())
    } else if status != Some(200) {
        Some(format!("有响应但 /healthz 不是 200（HTTP {}），可能不是卫戍协议服务器", status.unwrap_or(0)))
    } else if health.is_none() {
        Some("/healthz 响应不是预期格式".to_string())
    } else {
        Some("服务器报告尚未就绪（ok=false）".to_string())
    };

    Ok(ProbeResult { ok, latency_ms, status, uptime_sec, error })
}

/// 从响应头第一行取出状态码。
fn status_code(raw: &[u8]) -> Option<u16> {
    let head = String::from_utf8_lossy(&raw[..raw.len().min(64)]).to_string();
    let line = head.lines().next()?;
    let mut parts = line.split_whitespace();
    let _http = parts.next()?;
    parts.next()?.parse::<u16>().ok()
}

/// 响应头与响应体分界（`\r\n\r\n`）。
fn body_of(text: &str) -> &str {
    match text.find("\r\n\r\n") {
        Some(index) => &text[index + 4..],
        None => "",
    }
}

/// 从响应体里抠出 JSON 对象。
///
/// 容忍 `Transfer-Encoding: chunked`：Node 对 `/healthz` 这种小响应通常直接给
/// `Content-Length`，但如果分块了，这里取最外层大括号之间的内容正好也能解析。
fn health_json(body: &str) -> Option<serde_json::Value> {
    let start = body.find('{')?;
    let end = body.rfind('}')?;
    if end < start {
        return None;
    }
    serde_json::from_str(&body[start..=end]).ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    const OK_RESPONSE: &str = "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: 29\r\n\r\n{\"ok\":true,\"uptimeSec\":1234}";

    #[test]
    fn parses_healthy_response() {
        assert_eq!(status_code(OK_RESPONSE.as_bytes()), Some(200));
        let body = body_of(OK_RESPONSE);
        let json = health_json(body).unwrap();
        assert_eq!(json.get("ok").and_then(|v| v.as_bool()), Some(true));
        assert_eq!(json.get("uptimeSec").and_then(|v| v.as_u64()), Some(1234));
    }

    #[test]
    fn tolerates_chunked_body() {
        let raw = "HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n1d\r\n{\"ok\":true,\"uptimeSec\":99}\r\n0\r\n\r\n";
        let body = body_of(raw);
        let json = health_json(body).unwrap();
        assert_eq!(json.get("uptimeSec").and_then(|v| v.as_u64()), Some(99));
    }

    #[test]
    fn detects_missing_json() {
        let raw = "HTTP/1.1 404 Not Found\r\nContent-Length: 9\r\n\r\nnot found";
        assert_eq!(status_code(raw.as_bytes()), Some(404));
        assert!(health_json(body_of(raw)).is_none());
    }

    #[test]
    fn status_code_requires_http_prefix() {
        assert_eq!(status_code(b"garbage"), None);
        assert_eq!(status_code(b""), None);
    }

    #[test]
    fn probe_reports_failure_for_closed_port() {
        // 127.0.0.1:1 基本不可能有服务在听；只断言不 panic 且给出错误信息。
        let result = probe("127.0.0.1", 1);
        assert!(!result.ok);
        assert!(result.error.is_some());
    }

    /// 起一个只会回一条固定响应的假服务器，验证完整的请求/解析链路。
    fn serve_once(response: &'static str) -> u16 {
        use std::io::Write;
        use std::net::TcpListener;
        let listener = TcpListener::bind("127.0.0.1:0").expect("绑定本地端口");
        let port = listener.local_addr().unwrap().port();
        std::thread::spawn(move || {
            if let Ok((mut stream, _)) = listener.accept() {
                let _ = stream.write_all(response.as_bytes());
            }
        });
        port
    }

    #[test]
    fn probe_succeeds_against_a_healthy_server() {
        let response = "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: 30\r\nConnection: close\r\n\r\n{\"ok\":true,\"uptimeSec\":4242}";
        let port = serve_once(response);
        let result = probe("127.0.0.1", port);
        assert!(result.ok, "预期探活成功，实际：{:?}", result.error);
        assert_eq!(result.status, Some(200));
        assert_eq!(result.uptime_sec, Some(4242));
        assert!(result.error.is_none());
    }

    #[test]
    fn probe_reports_not_ready_when_ok_is_false() {
        let response = "HTTP/1.1 200 OK\r\nContent-Length: 22\r\nConnection: close\r\n\r\n{\"ok\":false,\"x\":1}";
        let port = serve_once(response);
        let result = probe("127.0.0.1", port);
        assert!(!result.ok);
        assert_eq!(result.status, Some(200));
        assert!(result.error.unwrap().contains("尚未就绪"));
    }
}

#!/usr/bin/env node
// 极简 CDP（Chrome DevTools Protocol）客户端，供本机 WebView2 性能剖析使用。
//
//   node tools/cdp.mjs list
//   node tools/cdp.mjs eval   --target=<url 子串> --expr="表达式"
//   node tools/cdp.mjs await  --target=<url 子串> --expr="表达式" --timeout=30000
//   node tools/cdp.mjs profile --target=<url 子串> --seconds=10 --out=profile.json
//   node tools/cdp.mjs heap    --target=<url 子串> --out=heap.json
//
// 依赖 Node 22+ 自带的全局 WebSocket（无需 npm 依赖）。

const PORT = process.env.CDP_PORT || 9333;

function arg(name, fallback = null) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}

const hasFlag = (name) => process.argv.includes(`--${name}`);

async function targets() {
  const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
  return res.json();
}

async function pickTarget(match) {
  const list = await targets();
  const pages = list.filter((t) => t.type === 'page');
  if (!match) return pages[0];
  const hit = pages.find((t) => (t.url || '').includes(match) || (t.title || '').includes(match));
  if (!hit) {
    throw new Error(`没有匹配 "${match}" 的目标，现有：\n${pages.map((p) => `  ${p.url}  (${p.title})`).join('\n')}`);
  }
  return hit;
}

function connect(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    const pending = new Map();
    let seq = 0;
    const events = [];
    const listeners = new Set();

    ws.addEventListener('open', () => {
      resolve({
        send(method, params = {}, sessionId) {
          const id = ++seq;
          const payload = { id, method, params };
          if (sessionId) payload.sessionId = sessionId;
          ws.send(JSON.stringify(payload));
          return new Promise((res, rej) => {
            pending.set(id, { res, rej, method });
          });
        },
        on(fn) {
          listeners.add(fn);
        },
        events,
        close() {
          try {
            ws.close();
          } catch {}
        },
      });
    });

    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && pending.has(msg.id)) {
        const { res, rej, method } = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) rej(new Error(`${method}: ${msg.error.message}`));
        else res(msg.result);
      } else if (msg.method) {
        events.push(msg);
        for (const fn of listeners) fn(msg);
      }
    });

    ws.addEventListener('error', (e) => reject(new Error(`WebSocket 失败：${e.message || e}`)));
  });
}

async function evaluate(cdp, expression, { awaitPromise = true, returnByValue = true, contextId } = {}) {
  const params = {
    expression,
    awaitPromise,
    returnByValue,
    userGesture: true,
  };
  if (contextId) params.contextId = contextId;
  const result = await cdp.send('Runtime.evaluate', params);
  if (result.exceptionDetails) {
    const d = result.exceptionDetails;
    throw new Error(`求值异常：${d.exception?.description || d.text}`);
  }
  return result.result?.value;
}

async function main() {
  const cmd = process.argv[2] || 'list';

  if (cmd === 'list') {
    const list = await targets();
    for (const t of list) {
      console.log(`${t.type.padEnd(8)} ${t.url}\n         ${t.title}\n         ${t.webSocketDebuggerUrl}`);
    }
    return;
  }

  const target = await pickTarget(arg('target'));
  const cdp = await connect(target.webSocketDebuggerUrl);
  await cdp.send('Runtime.enable').catch(() => {});

  if (cmd === 'contexts') {
    // 列出所有执行上下文（跨域 iframe 在同一个渲染进程里，靠 contextId 访问）
    await new Promise((r) => setTimeout(r, 500));
    for (const ev of cdp.events) {
      if (ev.method !== 'Runtime.executionContextCreated') continue;
      const c = ev.params.context;
      console.log(
        `ctx=${String(c.id).padEnd(3)} frame=${c.auxData?.frameId || '-'} type=${c.auxData?.type || '-'} origin=${c.origin}`,
      );
    }
    cdp.close();
    return;
  }

  try {
    if (cmd === 'eval') {
      const ctx = arg('context');
      const out = await evaluate(cdp, arg('expr', '1'), { contextId: ctx ? Number(ctx) : undefined });
      console.log(typeof out === 'object' ? JSON.stringify(out, null, 2) : String(out));
      return;
    }

    if (cmd === 'nav') {
      const url = arg('url');
      if (!url) throw new Error('需要 --url=');
      await cdp.send('Page.enable');
      const res = await cdp.send('Page.navigate', { url });
      console.log(JSON.stringify(res));
      return;
    }

    if (cmd === 'raw') {
      const method = arg('method');
      if (!method) throw new Error('需要 --method=');
      const params = arg('params') ? JSON.parse(arg('params')) : {};
      const res = await cdp.send(method, params);
      console.log(JSON.stringify(res, null, 2));
      return;
    }

    if (cmd === 'await') {
      // 轮询表达式直到它为真（用于等待页面/游戏就绪）
      const expr = arg('expr', 'true');
      const timeout = Number(arg('timeout', '30000'));
      const started = Date.now();
      let last;
      while (Date.now() - started < timeout) {
        last = await evaluate(cdp, expr).catch((e) => `ERR ${e.message}`);
        if (last === true) {
          console.log(`ready after ${Date.now() - started}ms`);
          return;
        }
        await new Promise((r) => setTimeout(r, 250));
      }
      throw new Error(`等待超时：${expr}（最后值 ${JSON.stringify(last)}）`);
    }

    if (cmd === 'logs') {
      // 采集指定秒数内的 console / 异常日志（排查页面静默失败）
      const seconds = Number(arg('seconds', '5'));
      await cdp.send('Log.enable').catch(() => {});
      const seen = [];
      cdp.on((msg) => {
        if (msg.method === 'Runtime.consoleAPICalled') {
          const txt = (msg.params.args || [])
            .map((a) => a.value ?? a.description ?? a.preview?.description ?? '')
            .join(' ');
          seen.push(`[${msg.params.type}] ${txt}`);
        } else if (msg.method === 'Runtime.exceptionThrown') {
          const d = msg.params.exceptionDetails;
          seen.push(`[exception] ${d.exception?.description || d.text}`);
        } else if (msg.method === 'Log.entryAdded') {
          const e = msg.params.entry;
          seen.push(`[log:${e.level}] ${e.text} ${e.url || ''}`);
        }
      });
      await new Promise((r) => setTimeout(r, seconds * 1000));
      console.log(seen.length ? seen.join('\n') : '(无日志)');
      return;
    }

    if (cmd === 'profile') {
      const seconds = Number(arg('seconds', '10'));
      const out = arg('out', 'profile.cpuprofile');
      await cdp.send('Profiler.enable');
      await cdp.send('Profiler.setSamplingInterval', { interval: 200 });
      await cdp.send('Profiler.start');
      console.log(`采样 ${seconds}s …`);
      await new Promise((r) => setTimeout(r, seconds * 1000));
      const { profile } = await cdp.send('Profiler.stop');
      const fs = await import('node:fs');
      fs.writeFileSync(out, JSON.stringify(profile));
      console.log(`已保存 ${out}（samples=${profile.samples?.length || 0}）`);
      return;
    }

    if (cmd === 'trace') {
      const seconds = Number(arg('seconds', '10'));
      const out = arg('out', 'trace.json');
      const fs = await import('node:fs');
      const stream = fs.createWriteStream(out);
      let chunks = 0;
      cdp.on((msg) => {
        if (msg.method === 'Tracing.dataCollected') {
          chunks += msg.params.value.length;
          stream.write(msg.params.value.map((e) => JSON.stringify(e)).join(',') + ',');
        }
        if (msg.method === 'Tracing.tracingComplete') stream.end();
      });
      stream.write('{"traceEvents":[');
      await cdp.send('Tracing.start', {
        categories: [
          'devtools.timeline',
          'disabled-by-default-devtools.timeline',
          'disabled-by-default-devtools.timeline.frame',
          'blink.user_timing',
          'v8',
          'v8.execute',
          'toplevel',
          'gpu',
          'viz',
          'cc',
        ].join(','),
        transferMode: 'Chunked',
      });
      console.log(`采集 trace ${seconds}s …`);
      await new Promise((r) => setTimeout(r, seconds * 1000));
      await cdp.send('Tracing.end');
      await new Promise((r) => setTimeout(r, 2000));
      stream.write('{}]}');
      await new Promise((r) => stream.end(r));
      console.log(`已保存 ${out}（${chunks} 个事件）`);
      return;
    }

    if (cmd === 'heap') {
      const out = arg('out', 'heap.json');
      await cdp.send('HeapProfiler.enable');
      await cdp.send('HeapProfiler.collectGarbage');
      const { profile } = await cdp.send('HeapProfiler.takeHeapSnapshot', { reportProgress: false });
      const fs = await import('node:fs');
      fs.writeFileSync(out, JSON.stringify(profile || {}));
      console.log(`已保存 ${out}`);
      return;
    }

    if (cmd === 'metrics') {
      await cdp.send('Performance.enable');
      const { metrics } = await cdp.send('Performance.getMetrics');
      for (const m of metrics) console.log(`${m.name}: ${m.value}`);
      return;
    }

    throw new Error(`未知命令 ${cmd}`);
  } finally {
    cdp.close();
  }
}

main().catch((e) => {
  console.error(`错误：${e.message}`);
  process.exitCode = 1;
});

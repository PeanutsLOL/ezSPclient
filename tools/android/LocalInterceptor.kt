package top.rakkasei.ezspclient

import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import java.io.ByteArrayInputStream
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL

/**
 * [ezSPclient] 本地拦截与加速器（源码存放在 `tools/android/`，由 patch-client.py 复制进生成的工程）：
 *
 * 1. 拦截 `simWorker.js`：换成线性消息队列版本，去掉原实现的 Promise 链堆积（V8 微任务 + GC 压力）。
 * 2. 静态二进制资源（字体 / 贴图 / 音频 / Spine）本地落盘直出：游戏服务器对所有资源都是
 *    `Cache-Control: no-cache` + ETag，等于每次启动都要逐条回源做条件请求；命中本地缓存后
 *    直接返回，省掉成百上千次往返与射频唤醒。
 *
 * 缓存只覆盖**二进制**资源，绝不缓存 js/css/json —— 否则游戏更新时客户端会拿到过期代码。
 */
object LocalInterceptor {

    /** 缓存上限，超过后按最后修改时间淘汰（够放一整套素材，又不至于把手机塞满）。 */
    private const val CACHE_LIMIT_BYTES = 256L * 1024 * 1024

    /** 没网/计量网络时不做预热，避免和 WebView 自身的下载重复拉一份（双倍流量）。 */
    @Volatile
    private var prefetchAllowed = true

    private val cacheDirOf: (Context) -> File = { ctx ->
        File(ctx.cacheDir, "ezsp_game_cache").apply { if (!exists()) mkdirs() }
    }

    private val OPTIMIZED_SIM_WORKER = """
        // [ezSPclient Local Interceptor: Optimized simWorker]
        import { createSimWorker } from './simWorkerRuntime.js';

        const dispatch = createSimWorker();
        const msgQueue = [];
        let isProcessing = false;

        async function flushQueue() {
          if (isProcessing) return;
          isProcessing = true;
          while (msgQueue.length > 0) {
            const data = msgQueue.shift();
            try {
              const res = await dispatch(data.method, data.args);
              globalThis.postMessage({ id: data.id, value: res });
            } catch (e) {
              globalThis.postMessage({
                id: data.id,
                error: { code: e.code || 'PLUGIN_WORKER_FAILED', message: String(e.message || e).slice(0, 300) }
              });
            }
          }
          isProcessing = false;
        }

        globalThis.onmessage = ({ data }) => {
          msgQueue.push(data);
          flushQueue();
        };
    """.trimIndent()

    fun intercept(context: Context, request: WebResourceRequest): WebResourceResponse? {
        val url = request.url ?: return null
        val path = url.path ?: ""

        // 1) 战斗仿真 Worker：体积小、热路径，直接替换实现
        if (path.endsWith("/js/battle/simWorker.js")) {
            val bytes = OPTIMIZED_SIM_WORKER.toByteArray(Charsets.UTF_8)
            return WebResourceResponse(
                "application/javascript",
                "utf-8",
                200,
                "OK",
                mapOf(
                    "Access-Control-Allow-Origin" to "*",
                    "Content-Type" to "application/javascript; charset=utf-8",
                    "Cache-Control" to "no-cache",
                ),
                ByteArrayInputStream(bytes),
            )
        }

        // 2) 二进制静态资源：命中即本地直出
        if (!isCacheableBinary(path) || !request.method.equals("GET", ignoreCase = true)) return null

        val cacheDir = cacheDirOf(context)
        val cached = File(cacheDir, cacheName(url.toString()))

        if (cached.isFile && cached.length() > 0) {
            debugLog("cache hit ${cached.name} (${cached.length()}B)")
            return try {
                val headers = mapOf("Cache-Control" to "max-age=604800")
                WebResourceResponse(guessMimeType(path), null, 200, "OK", headers, FileInputStream(cached))
            } catch (_: Exception) {
                null
            }
        }

        debugLog("cache miss ${url.path} prefetch=$prefetchAllowed")

        // 3) 未命中：仅在非计量网络下后台补一份，给下一次启动用（本次仍走正常网络，不阻塞）
        if (prefetchAllowed) {
            Thread {
                try {
                    val conn = URL(url.toString()).openConnection() as HttpURLConnection
                    conn.connectTimeout = 6000
                    conn.readTimeout = 10000
                    if (conn.responseCode == 200) {
                        val tmp = File(cacheDir, cacheName(url.toString()) + ".tmp")
                        conn.inputStream.use { input -> FileOutputStream(tmp).use { output -> input.copyTo(output) } }
                        if (tmp.length() > 0) {
                            tmp.renameTo(cached)
                            pruneIfNeeded(cacheDir)
                        } else {
                            tmp.delete()
                        }
                    }
                } catch (_: Exception) {
                    // 预热失败无所谓：下次启动再试
                }
            }.start()
        }
        return null
    }

    /** 由 MainActivity 在拿到网络状态后调用，决定要不要做后台预热。 */
    fun setPrefetchAllowed(allowed: Boolean) {
        prefetchAllowed = allowed
        debugLog("prefetchAllowed=$allowed")
    }

    /** 诊断日志：只打前 20 条，避免刷屏。 */
    private var logBudget = 20
    private fun debugLog(msg: String) {
        if (logBudget <= 0) return
        logBudget--
        try {
            android.util.Log.i("ezSPclient", "[intercept] $msg")
        } catch (_: Exception) {
        }
    }

    /** 计量网络（蜂窝）或没有网络时不做预热。 */
    fun detectPrefetchAllowed(context: Context): Boolean {
        return try {
            val cm = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
            val caps = cm.getNetworkCapabilities(cm.activeNetwork)
            caps != null && caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) &&
                caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_NOT_METERED)
        } catch (_: Exception) {
            false
        }
    }

    private fun isCacheableBinary(path: String): Boolean {
        val lower = path.lowercase()
        // js/css/json/html 一律不进缓存：游戏更新后必须拿到新代码
        return lower.endsWith(".png") || lower.endsWith(".webp") || lower.endsWith(".jpg") ||
            lower.endsWith(".jpeg") || lower.endsWith(".avif") || lower.endsWith(".mp3") ||
            lower.endsWith(".ogg") || lower.endsWith(".wav") || lower.endsWith(".m4a") ||
            lower.endsWith(".atlas") || lower.endsWith(".skel") || lower.endsWith(".woff2") ||
            lower.endsWith(".woff") || lower.endsWith(".ttf")
    }

    /** 文件名 = URL 的稳定指纹 + 原扩展名：避免长 URL 截断后互相撞车。 */
    private fun cacheName(url: String): String {
        val ext = url.substringAfterLast('.', "").takeIf { it.length in 1..5 && it.all { c -> c.isLetterOrDigit() } } ?: "bin"
        // 32 位 Java hashCode 会撞，这里用两路 hash 拼一下，够用且不需要引入依赖
        val h1 = url.hashCode().toUInt().toString(16)
        val h2 = url.fold(17L) { acc, c -> (acc * 31 + c.code) and 0xFFFFFFFFL }.toString(16)
        return "$h1$h2.$ext"
    }

    /** 超过上限就按 lastModified 由旧到新删，直到降回上限以内。 */
    private fun pruneIfNeeded(cacheDir: File) {
        val files = cacheDir.listFiles() ?: return
        var total = 0L
        for (f in files) total += f.length()
        if (total <= CACHE_LIMIT_BYTES) return
        files.sortBy { it.lastModified() }
        for (f in files) {
            if (total <= CACHE_LIMIT_BYTES) break
            val len = f.length()
            if (f.delete()) total -= len
        }
    }

    private fun guessMimeType(path: String): String = when {
        path.endsWith(".png") -> "image/png"
        path.endsWith(".webp") -> "image/webp"
        path.endsWith(".jpg") || path.endsWith(".jpeg") -> "image/jpeg"
        path.endsWith(".avif") -> "image/avif"
        path.endsWith(".mp3") -> "audio/mpeg"
        path.endsWith(".ogg") -> "audio/ogg"
        path.endsWith(".wav") -> "audio/wav"
        path.endsWith(".m4a") -> "audio/mp4"
        path.endsWith(".woff2") -> "font/woff2"
        path.endsWith(".woff") -> "font/woff"
        path.endsWith(".ttf") -> "font/ttf"
        else -> "application/octet-stream"
    }
}

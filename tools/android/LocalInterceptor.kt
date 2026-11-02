package top.rakkasei.ezspclient

import android.content.Context
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import java.io.ByteArrayInputStream
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL

/**
 * [ezSPclient] 本地 JS 拦截（源码在 `tools/android/`，由 patch-client.py 构建前复制进生成工程）。
 *
 * 只做两件事，**不做资源缓存** —— 游戏自己已经用 CacheStorage（`js/assetCache.js` 的
 * `cache.put(url, response)`）持久化素材，外壳再存一份只会双倍占用、双倍下载，而且
 * CacheStorage 的读取不经过 `shouldInterceptRequest`，那层缓存基本打不中。
 *
 * 1. `simWorker.js` → 线性消息队列实现。原版 `queue = queue.then(...)` 把每条命令串成一个
 *    Promise 链，战斗一热就有上千个节点堆在微任务队列里，V8 的 GC 被打得很碎。
 * 2. `simWorkerRuntime.js` → 只改一处：`Array(n).fill(null)` 换成 `new Array(n)`。
 *    消费方只取 `.length`（`runner.js`: `Array.isArray(b.enemies) ? b.enemies.length : 0`），
 *    原来的写法每个包都要写满 n 个指针，纯浪费。
 */
object LocalInterceptor {

    fun intercept(context: Context, request: WebResourceRequest): WebResourceResponse? {
        val url = request.url ?: return null
        val path = url.path ?: ""
        val absolute = url.toString()
        if (!loggedActive) {
            loggedActive = true
            debugLog("interceptor active")
        }

        // 1) 战斗仿真 Worker：直接换成优化实现
        if (path.endsWith("/js/battle/simWorker.js")) {
            return textResponse(OPTIMIZED_SIM_WORKER, "application/javascript")
        }

        // 2) simWorkerRuntime：首次请求先放原版，同时后台生成改写版；之后一律用改写版
        if (path.endsWith("/js/battle/simWorkerRuntime.js")) {
            val patched = patchedFile(context, absolute)
            if (patched.isFile && patched.length() > 0) return fileResponse(patched)
            background { buildPatchedRuntime(absolute, patched) }
            return null
        }

        return null
    }

    // ---------------------------------------------------------------- simWorkerRuntime 的一次性改写

    private fun patchDir(ctx: Context): File =
        File(ctx.cacheDir, "ezsp_js_patch").apply { if (!exists()) mkdirs() }

    private fun patchedFile(ctx: Context, url: String): File {
        val name = Integer.toHexString(url.hashCode()) + ".js"
        return File(patchDir(ctx), name)
    }

    /**
     * 下载原版 → 应用最小改写 → 落盘。模式找不到或网络出错就什么都不写，
     * 下次继续用原版，绝不返回半成品。
     */
    private fun buildPatchedRuntime(url: String, target: File) {
        try {
            val conn = URL(url).openConnection() as HttpURLConnection
            conn.connectTimeout = 6000
            conn.readTimeout = 15000
            if (conn.responseCode != 200) return
            val source = conn.inputStream.bufferedReader().use { it.readText() }
            val rewritten = source.replace(
                "Array(b.enemies?.length || 0).fill(null)",
                "new Array(b.enemies?.length || 0)",
            )
            if (rewritten == source) {
                debugLog("patch pattern not found in simWorkerRuntime")
                return
            }
            val tmp = File(target.parentFile, target.name + ".tmp")
            tmp.writeText(rewritten)
            if (tmp.renameTo(target)) {
                debugLog("patched simWorkerRuntime ${source.length} -> ${rewritten.length}")
            } else {
                tmp.delete()
            }
        } catch (_: Exception) {
        }
    }

    // ---------------------------------------------------------------- 工具

    private fun textResponse(body: String, mime: String): WebResourceResponse =
        WebResourceResponse(
            mime, "utf-8", 200, "OK",
            mapOf(
                "Access-Control-Allow-Origin" to "*",
                "Content-Type" to "$mime; charset=utf-8",
                "Cache-Control" to "no-cache",
            ),
            ByteArrayInputStream(body.toByteArray(Charsets.UTF_8)),
        )

    private fun fileResponse(file: File): WebResourceResponse =
        WebResourceResponse(
            "application/javascript", "utf-8", 200, "OK",
            mapOf(
                "Access-Control-Allow-Origin" to "*",
                "Content-Type" to "application/javascript; charset=utf-8",
                "Cache-Control" to "no-cache",
            ),
            FileInputStream(file),
        )

    private fun background(block: () -> Unit) {
        Thread(block, "ezsp-io").apply { isDaemon = true }.start()
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
          let i = 0;
          while (i < msgQueue.length) {
            const data = msgQueue[i++];
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
          msgQueue.length = 0;
          isProcessing = false;
        }

        globalThis.onmessage = ({ data }) => {
          msgQueue.push(data);
          flushQueue();
        };
    """.trimIndent()

    /** 诊断日志：限前 10 条。 */
    private var logBudget = 10
    private var loggedActive = false
    private fun debugLog(msg: String) {
        if (logBudget <= 0) return
        logBudget--
        try {
            android.util.Log.i("ezSPclient", "[intercept] $msg")
        } catch (_: Exception) {
        }
    }
}

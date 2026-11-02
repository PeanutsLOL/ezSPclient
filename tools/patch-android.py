#!/usr/bin/env python3
"""把 `tauri android init` 生成的 Android 工程调整成能跑我们这个客户端的样子。

做两件事（都幂等，重复运行不会重复插入）：

1. **打开 release 的明文 HTTP**。模板里 `usesCleartextTraffic` 在 debug 是 true、release 是 false
   （`app/build.gradle.kts` 的 defaultConfig 设 false，只有 debug 覆盖成 true，manifest 用
   `${usesCleartextTraffic}` 占位符）。本项目的游戏服务器一律是明文 HTTP，release 不改会静默连不上。
2. **给 release 加签名配置**（仅当 `src-tauri/gen/android/keystore.properties` 存在）。
   模板没带任何签名配置，不加就只能装 debug 包。

`src-tauri/gen/` 是可再生的（`.gitignore` 忽略），所以这些改动必须可复现：每次
`tauri android init` 之后跑一遍本脚本即可。

用法：
    python tools/patch-android.py            # 就地打补丁
    python tools/patch-android.py --check    # 只检查（CI 用），缺补丁时以非零退出
"""

import argparse
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
ANDROID_DIR = ROOT / "src-tauri" / "gen" / "android"
GRADLE = ANDROID_DIR / "app" / "build.gradle.kts"
KEYSTORE_PROPS = ANDROID_DIR / "keystore.properties"
MANIFEST = ANDROID_DIR / "app" / "src" / "main" / "AndroidManifest.xml"
CLIENT_FILE = ANDROID_DIR / "app" / "src" / "main" / "java" / "top" / "rakkasei" / "ezspclient" / "generated" / "RustWebViewClient.kt"

CLEARTEXT_MARKER = "[ezSPclient] 明文 HTTP"
SIGNING_MARKER = "[ezSPclient] release 签名"
IMMERSIVE_MARKER = "[ezSPclient] 沉浸式全屏"
ORIENTATION_NOTE = "[ezSPclient] 锁横屏"
INTERCEPT_MARKER = "[ezSPclient] 第二步本地劫持与加速"
RELEASE_BLOCK = 'getByName("release") {'

CLEARTEXT_PATCH = f"""{RELEASE_BLOCK}
            // {CLEARTEXT_MARKER}：游戏服务器是明文 HTTP，release 也必须允许（模板默认只给 debug 开）
            manifestPlaceholders["usesCleartextTraffic"] = "true"
"""

SIGNING_CONFIGS = f"""android {{
    // {SIGNING_MARKER}：凭据来自 keystore.properties（和 keystore 一样不要入库）
    // 注意用文件顶部 import 进来的 Properties，不要写 java.util.Properties()
    // —— 那会被解析成 Gradle 的 Project.java 扩展（Unresolved reference 'util'）
    signingConfigs {{
        create("release") {{
            val props = Properties().apply {{
                val f = rootProject.file("keystore.properties")
                if (f.exists()) f.inputStream().use {{ load(it) }}
            }}
            props.getProperty("storeFile")?.let {{ storeFile = rootProject.file(it) }}
            storePassword = props.getProperty("storePassword")
            keyAlias = props.getProperty("keyAlias")
            keyPassword = props.getProperty("keyPassword")
        }}
    }}
"""


def release_block(text: str) -> str:
    """取出 `getByName("release") { … }` 这一段的原文（按大括号配对，避免只看注释标记）。"""
    start = text.find(RELEASE_BLOCK)
    if start < 0:
        return ""
    depth = 0
    for index in range(start + len(RELEASE_BLOCK) - 1, len(text)):
        if text[index] == "{":
            depth += 1
        elif text[index] == "}":
            depth -= 1
            if depth == 0:
                return text[start:index + 1]
    return text[start:]


def patch_cleartext(text: str) -> str:
    if "usesCleartextTraffic" in release_block(text):
        return text
    index = text.find(RELEASE_BLOCK)
    if index < 0:
        raise SystemExit(f"在 {GRADLE.relative_to(ROOT)} 里找不到 `{RELEASE_BLOCK}`，模板可能变了")
    return text[:index] + CLEARTEXT_PATCH + text[index + len(RELEASE_BLOCK):]


def patch_signing(text: str) -> str:
    if "signingConfig" in release_block(text):
        return text
    index = text.find("android {")
    if index < 0:
        raise SystemExit(f"在 {GRADLE.relative_to(ROOT)} 里找不到 `android {{`，模板可能变了")
    with_configs = text[:index] + SIGNING_CONFIGS + text[index + len("android {"):]
    # release 构建类型里挂上这个签名配置
    anchor = f"{RELEASE_BLOCK}\n"
    pos = with_configs.find(anchor)
    if pos < 0:
        raise SystemExit("插入签名配置后找不到 release 块，模板可能变了")
    insert_at = pos + len(anchor)
    return with_configs[:insert_at] + '            signingConfig = signingConfigs.getByName("release")\n' + with_configs[insert_at:]


def find_main_activity() -> pathlib.Path | None:
    """生成的 MainActivity.kt（包名路径跟着 identifier 走，所以按名字找）。"""
    java_dir = ANDROID_DIR / "app" / "src" / "main" / "java"
    if not java_dir.is_dir():
        return None
    found = sorted(java_dir.rglob("MainActivity.kt"))
    return found[0] if found else None


def patch_orientation(text: str) -> str:
    """锁横屏：游戏是横屏的，整机（含启动器）都用 sensorLandscape，省掉运行期切换方向的复杂度。"""
    if "screenOrientation" in text:
        return text
    index = text.find("<activity")
    if index < 0:
        raise SystemExit(f"在 {MANIFEST.relative_to(ROOT)} 里找不到 <activity>")
    end = text.find(">", index)
    if end < 0:
        raise SystemExit(f"{MANIFEST.relative_to(ROOT)} 的 <activity> 标签没有结束")
    attribute = '\n            android:screenOrientation="sensorLandscape"'
    return text[:end] + attribute + text[end:]


def patch_immersive(activity_path: pathlib.Path) -> bool:
    """沉浸式全屏：隐藏状态栏与导航栏（下滑可临时唤出），让游戏占满整屏。"""
    text = activity_path.read_text(encoding="utf-8")
    if IMMERSIVE_MARKER in text:
        return False

    imports = (
        "import android.app.ActivityManager\n"
        "import android.content.Context\n"
        "import android.os.Build\n"
        "import android.webkit.WebView\n"
        "import androidx.activity.OnBackPressedCallback\n"
        "import androidx.core.view.WindowCompat\n"
        "import androidx.core.view.WindowInsetsCompat\n"
        "import androidx.core.view.WindowInsetsControllerCompat\n"
        "import androidx.webkit.WebViewCompat\n"
        "import androidx.webkit.WebViewFeature\n"
        "import java.io.File\n"
        "import org.json.JSONObject\n"
    )
    anchor = "import androidx.activity.enableEdgeToEdge\n"
    if anchor not in text:
        raise SystemExit(f"在 {activity_path.name} 里找不到 `{anchor.strip()}`，模板可能变了")
    text = text.replace(anchor, anchor + imports, 1)

    class_anchor = "class MainActivity : TauriActivity() {"
    if class_anchor not in text:
        raise SystemExit(f"在 {activity_path.name} 里找不到 `{class_anchor}`，模板可能变了")
    text = text.replace(
        class_anchor,
        class_anchor
        + "\n  companion object {\n    @Volatile\n    var isAccelerationEnabled: Boolean = true\n\n    @Volatile\n    var renderScale: String = \"auto\"\n  }\n\n  private var webViewInstance: WebView? = null",
        1,
    )

    body_anchor = "    super.onCreate(savedInstanceState)\n  }"
    if body_anchor not in text:
        raise SystemExit(f"在 {activity_path.name} 里找不到 onCreate 主体的锚点，模板可能变了")
    text = text.replace(
        body_anchor,
        "    super.onCreate(savedInstanceState)\n"
        "    updateAccelerationState()\n"
        "    hideSystemBars()\n"
        "    setupBackNavigation()\n"
        "    limitDisplayRefreshRate()\n"
        "  }\n"
        "\n"
        "  fun updateAccelerationState() {\n"
        "    try {\n"
        "      // Tauri 在 Android 上把配置写在 dataDir 根目录（不是 filesDir）\n"
        "      val file = File(dataDir, \"settings.json\")\n"
        "      if (file.exists()) {\n"
        "        val json = JSONObject(file.readText())\n"
        "        if (json.has(\"performanceAcceleration\")) {\n"
        "          isAccelerationEnabled = json.getBoolean(\"performanceAcceleration\")\n"
        "        }\n"
        "        if (json.has(\"renderScale\")) {\n"
        "          renderScale = json.getString(\"renderScale\")\n"
        "        }\n"
        "      }\n"
        "    } catch (_: Exception) {}\n"
        "  }\n"
        "\n"
        "  /**\n"
        "   * 把设置里的 \"auto\" 解析成具体倍率：低端机（低内存 / 小核数）落到 1.0，其余 1.5。\n"
        "   * 高配机上 auto 与 1.5 完全等价，等于不改变观感。\n"
        "   */\n"
        "  private fun resolveRenderScale(): String {\n"
        "    val raw = renderScale\n"
        "    if (raw != \"auto\") return raw\n"
        "    return try {\n"
        "      val am = getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager\n"
        "      val info = ActivityManager.MemoryInfo()\n"
        "      am.getMemoryInfo(info)\n"
        "      val cores = Runtime.getRuntime().availableProcessors()\n"
        "      val lowRam = am.isLowRamDevice || info.totalMem in 1..(4L * 1024 * 1024 * 1024)\n"
        "      val picked = if (lowRam || cores <= 4) \"1\" else \"1.5\"\n"
        "      android.util.Log.i(\n"
        "        \"ezSPclient\",\n"
        "        \"renderScale auto -> \" + picked + \" (cores=\" + cores + \", ramMB=\" + (info.totalMem / 1024 / 1024) + \", lowRam=\" + lowRam + \")\",\n"
        "      )\n"
        "      picked\n"
        "    } catch (_: Exception) {\n"
        "      \"1.5\"\n"
        "    }\n"
        "  }\n"
        "\n"
        "  override fun onWebViewCreate(webView: WebView) {\n"
        "    super.onWebViewCreate(webView)\n"
        "    webViewInstance = webView\n"
        "    updateAccelerationState()\n"
        "    // 只有非计量网络才做资源预热（避免蜂窝下和 WebView 重复拉一份）\n"
        "    LocalInterceptor.setPrefetchAllowed(LocalInterceptor.detectPrefetchAllowed(this))\n"
        "    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.KITKAT) {\n"
        "      WebView.setWebContentsDebuggingEnabled(true)\n"
        "    }\n"
        "    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {\n"
        "      webView.setRendererPriorityPolicy(WebView.RENDERER_PRIORITY_IMPORTANT, false)\n"
        "    }\n"
        "    if (isAccelerationEnabled && WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) {\n"
        "      val optimizerScript = \"\"\"\n"
        "        (function() {\n"
        "          var scale = '__SCALE__';\n"
        "          if (scale && scale !== 'off') {\n"
        "            var v = parseFloat(scale);\n"
        "            if (v > 0) {\n"
        "              try {\n"
        "                Object.defineProperty(window, 'devicePixelRatio', {\n"
        "                  get: function() { return v; },\n"
        "                  configurable: true\n"
        "                });\n"
        "              } catch (_) {}\n"
        "              if (v <= 1.0) {\n"
        "                try {\n"
        "                  var K = 'sp.pref.settings';\n"
        "                  var raw = localStorage.getItem(K);\n"
        "                  var c = raw ? JSON.parse(raw) : null;\n"
        "                  if (!c || typeof c !== 'object') c = {};\n"
        "                  if (c.quality === undefined) { c.quality = 'low'; localStorage.setItem(K, JSON.stringify(c)); }\n"
        "                } catch (_) {}\n"
        "              }\n"
        "            }\n"
        "          }\n"
        "          try {\n"
        "            var rawRAF = window.requestAnimationFrame;\n"
        "            if (rawRAF) {\n"
        "              var last = 0;\n"
        "              var minDelta = 1000 / 60;\n"
        "              window.requestAnimationFrame = function(cb) {\n"
        "                return rawRAF.call(window, function(t) {\n"
        "                  if (t - last < minDelta - 2) {\n"
        "                    rawRAF.call(window, cb);\n"
        "                  } else {\n"
        "                    last = t;\n"
        "                    cb(t);\n"
        "                  }\n"
        "                });\n"
        "              };\n"
        "            }\n"
        "          } catch (_) {}\n"
        "        })();\n"
        "      \"\"\".trimIndent().replace(\"__SCALE__\", resolveRenderScale())\n"
        "      WebViewCompat.addDocumentStartJavaScript(webView, optimizerScript, setOf(\"*\"))\n"
        "    }\n"
        "  }\n"
        "\n"
        "  // [ezSPclient] 硬件级锁 60Hz 刷新率：将屏幕由 120Hz 降为 60Hz，直接让屏幕和渲染功耗降低 50%\n"
        "  private fun limitDisplayRefreshRate() {\n"
        "    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {\n"
        "      val disp = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {\n"
        "        display\n"
        "      } else {\n"
        "        @Suppress(\"DEPRECATION\")\n"
        "        windowManager.defaultDisplay\n"
        "      }\n"
        "      if (isAccelerationEnabled) {\n"
        "        disp?.supportedModes?.find { it.refreshRate in 58.0f..62.0f }?.let { mode ->\n"
        "          val params = window.attributes\n"
        "          params.preferredDisplayModeId = mode.modeId\n"
        "          window.attributes = params\n"
        "        }\n"
        "      } else {\n"
        "        val params = window.attributes\n"
        "        params.preferredDisplayModeId = 0\n"
        "        window.attributes = params\n"
        "      }\n"
        "    }\n"
        "  }\n"
        "\n"
        "  // [ezSPclient] 后台防发热：切入后台或锁屏时暂停 JS 定时器，切回时恢复\n"
        "  override fun onPause() {\n"
        "    super.onPause()\n"
        "    try {\n"
        "      webViewInstance?.pauseTimers()\n"
        "    } catch (_: Exception) {}\n"
        "  }\n"
        "\n"
        "  override fun onResume() {\n"
        "    super.onResume()\n"
        "    updateAccelerationState()\n"
        "    limitDisplayRefreshRate()\n"
        "    try {\n"
        "      webViewInstance?.resumeTimers()\n"
        "    } catch (_: Exception) {}\n"
        "    hideSystemBars()\n"
        "  }\n"
        "\n"
        "  override fun onWindowFocusChanged(hasFocus: Boolean) {\n"
        "    super.onWindowFocusChanged(hasFocus)\n"
        "    if (hasFocus) {\n"
        "      hideSystemBars()\n"
        "    }\n"
        "  }\n"
        "\n"
        "  // [ezSPclient] 系统返回键拦截：优先退出内嵌游戏/弹窗，避免误触直接杀死应用\n"
        "  private fun setupBackNavigation() {\n"
        "    onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {\n"
        "      override fun handleOnBackPressed() {\n"
        "        val wv = webViewInstance\n"
        "        if (wv != null) {\n"
        "          wv.evaluateJavascript(\n"
        "            \"if (window.__EZSP_BACK_HANDLER && window.__EZSP_BACK_HANDLER()) { 'consumed' } else { 'default' }\"\n"
        "          ) { result ->\n"
        "            if (result != \"\\\"consumed\\\"\") {\n"
        "              isEnabled = false\n"
        "              onBackPressedDispatcher.onBackPressed()\n"
        "              isEnabled = true\n"
        "            }\n"
        "          }\n"
        "        } else {\n"
        "          isEnabled = false\n"
        "          onBackPressedDispatcher.onBackPressed()\n"
        "          isEnabled = true\n"
        "        }\n"
        "      }\n"
        "    })\n"
        "  }\n"
        "\n"
        f"  // {IMMERSIVE_MARKER}：游戏是横屏的，隐藏系统栏占满整屏；下滑可临时唤出\n"
        "  private fun hideSystemBars() {\n"
        "    WindowCompat.setDecorFitsSystemWindows(window, false)\n"
        "    WindowInsetsControllerCompat(window, window.decorView).apply {\n"
        "      hide(WindowInsetsCompat.Type.systemBars())\n"
        "      systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE\n"
        "    }\n"
        "  }",
        1,
    )
    activity_path.write_text(text, encoding="utf-8")
    return True


def run_client_patch() -> bool:
    """调用 patch-client.py：`generated/*.kt` 每次构建都会被重写，补丁单独一个脚本。"""
    import subprocess

    script = ROOT / "tools" / "patch-client.py"
    if not script.is_file():
        return False
    done = subprocess.run([sys.executable, str(script)], cwd=str(ROOT), capture_output=True, text=True)
    if done.returncode != 0:
        print(done.stderr.strip(), file=sys.stderr)
        return False
    print(done.stdout.strip())
    return True


GRADLE_HOOK_MARKER = "[ezSPclient] 编译前补回本地拦截"
GRADLE_HOOK = f"""

// {GRADLE_HOOK_MARKER}
// `tauri android build` 每次都会重新生成 generated/*.kt，把「第二步本地拦截」补丁冲掉；
// 这里注册一个「永远执行」的任务，在 Kotlin 编译前再打一遍（脚本幂等）。
// 注意用文件顶部 import 的 File，不要写 java.io.File —— 会被解析成 Gradle 的 Project.java 扩展。
tasks.register("ezspPatchClient") {{
    val repoRoot = run {{
        var dir: File? = rootDir.canonicalFile
        while (dir != null && !File(dir, "tools/patch-client.py").isFile) dir = dir.parentFile
        dir?.absolutePath ?: ""
    }}
    doLast {{
        if (repoRoot.isEmpty()) return@doLast
        val script = File(repoRoot, "tools/patch-client.py")
        if (!script.isFile) return@doLast
        try {{
            val proc = ProcessBuilder("python", script.absolutePath)
                .directory(File(repoRoot))
                .redirectErrorStream(true)
                .start()
            val out = proc.inputStream.bufferedReader().readText().trim()
            proc.waitFor()
            if (out.isNotEmpty()) println(out)
        }} catch (e: Exception) {{
            println("[ezSPclient] 拦截补丁失败：${{e.message}}")
        }}
    }}
}}

tasks.matching {{ it.name.startsWith("compile") && it.name.endsWith("Kotlin") }}.configureEach {{
    dependsOn("ezspPatchClient")
}}
"""


def patch_gradle_hook(text: str) -> str:
    """在 app/build.gradle.kts 末尾挂上「编译前重新打补丁」的任务。"""
    if GRADLE_HOOK_MARKER in text:
        return text
    if "import java.io.File" not in text:
        anchor = "import java.util.Properties"
        if anchor in text:
            text = text.replace(anchor, "import java.io.File\n" + anchor, 1)
    return text.rstrip() + GRADLE_HOOK


def main() -> int:
    parser = argparse.ArgumentParser(description="给生成的 Android 工程打补丁")
    parser.add_argument("--check", action="store_true", help="只检查，缺补丁时以非零退出")
    args = parser.parse_args()

    if not GRADLE.is_file() or not MANIFEST.is_file():
        print(f"找不到生成的 Android 工程，先运行：pnpm tauri android init", file=sys.stderr)
        return 2

    gradle_text = GRADLE.read_text(encoding="utf-8")
    manifest_text = MANIFEST.read_text(encoding="utf-8")
    activity = find_main_activity()
    client_script = ROOT / "tools" / "patch-client.py"
    client_patched = CLIENT_FILE.is_file() and INTERCEPT_MARKER in CLIENT_FILE.read_text(encoding="utf-8")

    todo = []
    if "usesCleartextTraffic" not in release_block(gradle_text):
        todo.append("release 明文 HTTP")
    if KEYSTORE_PROPS.is_file() and "signingConfig" not in release_block(gradle_text):
        todo.append("release 签名配置")
    if GRADLE_HOOK_MARKER not in gradle_text:
        todo.append("编译前补丁钩子")
    if "screenOrientation" not in manifest_text:
        todo.append("锁横屏（sensorLandscape）")
    if activity and IMMERSIVE_MARKER not in activity.read_text(encoding="utf-8"):
        todo.append("沉浸式全屏")
    if client_script.is_file() and not client_patched:
        todo.append("第二步本地拦截加速")

    if args.check:
        if todo:
            print(f"缺少补丁（{'、'.join(todo)}）", file=sys.stderr)
            return 1
        print(f"补丁已就位：{GRADLE.relative_to(ROOT)}、{MANIFEST.relative_to(ROOT)}")
        return 0

    gradle_text = patch_cleartext(gradle_text)
    if KEYSTORE_PROPS.is_file():
        gradle_text = patch_signing(gradle_text)
    gradle_text = patch_gradle_hook(gradle_text)
    GRADLE.write_text(gradle_text, encoding="utf-8")

    MANIFEST.write_text(patch_orientation(manifest_text), encoding="utf-8")

    if activity:
        patch_immersive(activity)

    run_client_patch()

    if todo:
        print(f"已打补丁（{'、'.join(todo)}）")
    else:
        print(f"补丁已就位：{GRADLE.relative_to(ROOT)}、{MANIFEST.relative_to(ROOT)}")
    if not KEYSTORE_PROPS.is_file():
        print(f"提示：没有 {KEYSTORE_PROPS.relative_to(ROOT)}，release 包不会签名（只能装 debug 包）")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

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

CLEARTEXT_MARKER = "[ezSPclient] 明文 HTTP"
SIGNING_MARKER = "[ezSPclient] release 签名"
IMMERSIVE_MARKER = "[ezSPclient] 沉浸式全屏"
ORIENTATION_NOTE = "[ezSPclient] 锁横屏"
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
        "import androidx.core.view.WindowCompat\n"
        "import androidx.core.view.WindowInsetsCompat\n"
        "import androidx.core.view.WindowInsetsControllerCompat\n"
    )
    anchor = "import androidx.activity.enableEdgeToEdge\n"
    if anchor not in text:
        raise SystemExit(f"在 {activity_path.name} 里找不到 `{anchor.strip()}`，模板可能变了")
    text = text.replace(anchor, anchor + imports, 1)

    body_anchor = "    super.onCreate(savedInstanceState)\n  }"
    if body_anchor not in text:
        raise SystemExit(f"在 {activity_path.name} 里找不到 onCreate 主体的锚点，模板可能变了")
    text = text.replace(
        body_anchor,
        "    super.onCreate(savedInstanceState)\n"
        "    hideSystemBars()\n"
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

    todo = []
    if "usesCleartextTraffic" not in release_block(gradle_text):
        todo.append("release 明文 HTTP")
    if KEYSTORE_PROPS.is_file() and "signingConfig" not in release_block(gradle_text):
        todo.append("release 签名配置")
    if "screenOrientation" not in manifest_text:
        todo.append("锁横屏（sensorLandscape）")
    if activity and IMMERSIVE_MARKER not in activity.read_text(encoding="utf-8"):
        todo.append("沉浸式全屏")

    if not todo:
        print(f"补丁已就位：{GRADLE.relative_to(ROOT)}、{MANIFEST.relative_to(ROOT)}")
        return 0

    if args.check:
        print(f"缺少补丁（{'、'.join(todo)}）", file=sys.stderr)
        return 1

    gradle_text = patch_cleartext(gradle_text)
    if KEYSTORE_PROPS.is_file():
        gradle_text = patch_signing(gradle_text)
    GRADLE.write_text(gradle_text, encoding="utf-8")

    MANIFEST.write_text(patch_orientation(manifest_text), encoding="utf-8")

    if activity:
        patch_immersive(activity)

    print(f"已打补丁（{'、'.join(todo)}）")
    if not KEYSTORE_PROPS.is_file():
        print(f"提示：没有 {KEYSTORE_PROPS.relative_to(ROOT)}，release 包不会签名（只能装 debug 包）")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

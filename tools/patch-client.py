#!/usr/bin/env python3
"""把「第二步本地拦截」补丁打进 `generated/RustWebViewClient.kt`。

为什么单独一个脚本：`tauri android build` 每次都会重新生成 `gen/android/.../generated/*.kt`，
所以这个补丁必须在**每次编译前**重新打一遍。`app/build.gradle.kts` 里挂了一个
compile*Kotlin 的 doFirst 钩子（由 `patch-android.py` 写入），在 Kotlin 编译前调用本脚本。

用法：
    python tools/patch-client.py           # 就地打补丁（幂等）
    python tools/patch-client.py --check   # 只检查，缺补丁时非零退出
"""

import argparse
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
CLIENT = (
    ROOT
    / "src-tauri"
    / "gen"
    / "android"
    / "app"
    / "src"
    / "main"
    / "java"
    / "top"
    / "rakkasei"
    / "ezspclient"
    / "generated"
    / "RustWebViewClient.kt"
)

MARKER = "[ezSPclient] 第二步本地劫持与加速"
ANCHOR = "        lastInterceptedUrl = request.url\n"

SNIPPET = (
    "        lastInterceptedUrl = request.url\n"
    "\n"
    f"        // {MARKER}\n"
    "        if (MainActivity.isAccelerationEnabled) {\n"
    "            val intercepted = LocalInterceptor.intercept(view.context, request)\n"
    "            if (intercepted != null) return intercepted\n"
    "        }\n"
)


def has_patch() -> bool:
    return CLIENT.is_file() and MARKER in CLIENT.read_text(encoding="utf-8")


def apply() -> bool:
    if not CLIENT.is_file():
        return False
    text = CLIENT.read_text(encoding="utf-8")
    if MARKER in text:
        return False
    if ANCHOR not in text:
        print(f"{CLIENT.name}: 找不到 lastInterceptedUrl 锚点，模板可能变了", file=sys.stderr)
        return False
    CLIENT.write_text(text.replace(ANCHOR, SNIPPET, 1), encoding="utf-8")
    return True


def main() -> int:
    parser = argparse.ArgumentParser(description="给生成的 RustWebViewClient 打本地拦截补丁")
    parser.add_argument("--check", action="store_true", help="只检查")
    args = parser.parse_args()

    if args.check:
        if has_patch():
            print(f"补丁已就位：{CLIENT.relative_to(ROOT)}")
            return 0
        print(f"缺少补丁：{CLIENT.relative_to(ROOT)}", file=sys.stderr)
        return 1

    if apply():
        print(f"已打补丁：{CLIENT.relative_to(ROOT)}")
    else:
        print(f"补丁已存在或模板已变：{CLIENT.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

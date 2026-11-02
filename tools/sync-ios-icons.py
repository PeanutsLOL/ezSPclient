#!/usr/bin/env python3
"""把 `tauri icon` 生成的 iOS 图标同步进 `tauri ios init` 生成的 Xcode 资源目录。

`tauri ios init` 铺的是模板自带的 Tauri 占位图标（蓝底徽记），不会读 `tauri.conf.json` 的
`bundle.icon`；而 `src-tauri/gen/` 是可再生的（被 gitignore），所以每次 init 之后都要同步一次，
否则打出来的包用的不是 ezSPclient 的图标。两边文件名一一对应，直接覆盖 png 即可。

用法：
    python3 tools/sync-ios-icons.py            # 在 ios init 之后同步
    python3 tools/sync-ios-icons.py --check    # 只检查（CI 用），图标不一致时非零退出
"""

import argparse
import pathlib
import shutil
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
SRC = ROOT / "src-tauri" / "icons" / "ios"
DST = ROOT / "src-tauri" / "gen" / "apple" / "Assets.xcassets" / "AppIcon.appiconset"


def main() -> int:
    parser = argparse.ArgumentParser(description="同步 iOS App 图标到生成的 Xcode 工程")
    parser.add_argument("--check", action="store_true", help="只检查，不写入")
    args = parser.parse_args()

    if not DST.is_dir():
        print(f"找不到 {DST.relative_to(ROOT)}，先运行 `pnpm tauri ios init`", file=sys.stderr)
        return 2

    sources = sorted(SRC.glob("*.png"))
    if not sources:
        print(f"{SRC.relative_to(ROOT)} 里没有 png，先运行 `pnpm icon`", file=sys.stderr)
        return 2

    stale = [s for s in sources if not (DST / s.name).is_file() or (DST / s.name).read_bytes() != s.read_bytes()]
    if args.check:
        if stale:
            print(f"有 {len(stale)} 个图标没同步（例如 {stale[0].name}），运行 `pnpm ios:icons`", file=sys.stderr)
            return 1
        print(f"图标已同步：{len(sources)} 个")
        return 0

    for source in sources:
        shutil.copy2(source, DST / source.name)
    print(f"已同步 {len(sources)} 个 iOS 图标到 {DST.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

"""抽样校验 upstream 的美术素材是否真的到位（不信「有 public/assets 目录就算有」）。

用法：
  python testserver/check-assets.py [--game testserver/upstream] [--sample 400]

做法：从 data/assets.json 里抽出所有 `/assets/...` 路径，去重后抽样 N 个，
逐个检查 `public/assets/<相对路径>` 是否存在，覆盖率低于 90% 就非零退出。

为什么需要它：release 的 `-lite` 包没有美术，`npm run assets` 失败后也可能留下一个空壳目录。
只测「目录存在」会得到一份看似正常的压力测试数据，但渲染负载其实是占位图。
"""

import argparse
import json
import pathlib
import random
import sys


def collect_paths(node, out):
    if isinstance(node, dict):
        for v in node.values():
            collect_paths(v, out)
    elif isinstance(node, list):
        for v in node:
            collect_paths(v, out)
    elif isinstance(node, str) and node.startswith("/assets/"):
        out.add(node)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--game", default="testserver/upstream")
    ap.add_argument("--sample", type=int, default=400)
    ap.add_argument("--min-ratio", type=float, default=0.9)
    args = ap.parse_args()

    game = pathlib.Path(args.game)
    manifest = game / "data" / "assets.json"
    root = game / "public"

    if not manifest.is_file():
        print(f"找不到 {manifest}", file=sys.stderr)
        return 2

    paths = set()
    collect_paths(json.loads(manifest.read_text(encoding="utf-8")), paths)
    total = len(paths)
    if not total:
        print("manifest 里没有任何 /assets/ 路径", file=sys.stderr)
        return 2

    sample = random.sample(sorted(paths), min(args.sample, total))
    missing = [p for p in sample if not (root / p.lstrip("/")).is_file()]
    ratio = 1 - len(missing) / len(sample)

    print(f"manifest 引用 {total} 个素材路径，抽样 {len(sample)} 个")
    print(f"命中 {len(sample) - len(missing)} 个，覆盖率 {ratio:.1%}")

    if missing:
        print("缺失样例：")
        for p in missing[:5]:
            print("  -", p)

    if ratio < args.min_ratio:
        print(
            f"\n覆盖率低于 {args.min_ratio:.0%}：这份素材不适合做性能对照。\n"
            "  - 本机已有完整素材：powershell -File testserver/setup.ps1 -Assets link -AssetsFrom <游戏目录>\n"
            "  - 从官方客户端提取：  python testserver/upstream/tools/local-extract/extract.py  （见该脚本 --help）\n"
            "  - 直接下载：          powershell -File testserver/setup.ps1 -Assets download",
            file=sys.stderr,
        )
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

"""asset-coverage.py：把「官方本地素材包」也纳入统计。

两份清单：
  data/assets.json       社区 dump 的素材（/assets/...）
  data/local-assets.json 从官方客户端提取的本地素材（/assets/local/...，含 3D 棋盘图集）
第二份缺失时客户端不会启用本地美术，3D 棋盘也不会加载（docs/ASSETS.md:76）。
"""

import collections
import json
import pathlib
import sys


def collect(node, out):
    if isinstance(node, dict):
        p = node.get("path")
        if isinstance(p, str) and p.startswith("/assets/"):
            out.add(p)
        for v in node.values():
            collect(v, out)
    elif isinstance(node, list):
        for v in node:
            collect(v, out)
    elif isinstance(node, str) and node.startswith("/assets/"):
        out.add(node)


def category(p: str) -> str:
    low = p.lower()
    if low.startswith("/assets/local/"):
        return "local/official"
    if low.startswith("/assets/audio/"):
        return "audio/voice" if "/voice/" in low else "audio/sfx"
    if low.endswith((".atlas", ".skel")):
        return "art/spine"
    if low.endswith((".png", ".webp", ".jpg", ".avif")):
        return "art/image"
    if low.endswith((".woff2", ".woff", ".ttf", ".otf")):
        return "font"
    return "other"


def main() -> int:
    game = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else "testserver/upstream")
    root = game / "public"
    paths = set()
    collect(json.loads((game / "data" / "assets.json").read_text(encoding="utf-8")), paths)

    local_manifest = game / "data" / "local-assets.json"
    local_total = 0
    if local_manifest.is_file():
        local = set()
        collect(json.loads(local_manifest.read_text(encoding="utf-8")), local)
        local_total = len(local)
        paths |= local
    else:
        print("⚠️  缺 data/local-assets.json：客户端不会启用官方本地美术，3D 棋盘也不会加载\n")

    stats = collections.defaultdict(lambda: [0, 0])
    for p in paths:
        cat = category(p)
        stats[cat][1] += 1
        if (root / p.lstrip("/")).is_file():
            stats[cat][0] += 1

    print(f"{'类别':<16}{'命中':>8}{'总数':>8}{'覆盖率':>9}")
    for cat in sorted(stats):
        present, total = stats[cat]
        print(f"{cat:<16}{present:>8}{total:>8}{present / total:>8.1%}")

    art_total = sum(stats[c][1] for c in stats if c.startswith("art/"))
    art_hit = sum(stats[c][0] for c in stats if c.startswith("art/"))
    print(f"\n美术合计：{art_hit}/{art_total} = {art_hit / art_total:.1%}" if art_total else "")
    if local_total:
        present, total = stats["local/official"]
        print(f"官方本地包：{present}/{total} = {present / total:.1%}")
    return 0 if art_total and art_hit / art_total >= 0.95 else 1


if __name__ == "__main__":
    raise SystemExit(main())

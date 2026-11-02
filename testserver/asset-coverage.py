"""按类别统计素材覆盖率：美术（贴图/Spine/字体）与音频分开看。

性能测试真正要的是「美术齐」；语音缺失只影响音频，不该据此判定整套素材不可用。
"""

import collections
import json
import pathlib
import sys


def collect(node, out):
    if isinstance(node, dict):
        for v in node.values():
            collect(v, out)
    elif isinstance(node, list):
        for v in node:
            collect(v, out)
    elif isinstance(node, str) and node.startswith("/assets/"):
        out.add(node)


def category(p: str) -> str:
    low = p.lower()
    if low.startswith("/assets/audio/"):
        if "/voice/" in low:
            return "audio/voice"
        return "audio/sfx"
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

    stats = collections.defaultdict(lambda: [0, 0])  # cat -> [present, total]
    for p in paths:
        cat = category(p)
        ok = (root / p.lstrip("/")).is_file()
        stats[cat][1] += 1
        if ok:
            stats[cat][0] += 1

    print(f"{'类别':<14}{'命中':>7}{'总数':>7}{'覆盖率':>9}")
    for cat in sorted(stats):
        present, total = stats[cat]
        print(f"{cat:<14}{present:>7}{total:>7}{present / total:>8.1%}")

    art_total = sum(stats[c][1] for c in stats if c.startswith("art/"))
    art_hit = sum(stats[c][0] for c in stats if c.startswith("art/"))
    print(f"\n美术合计：{art_hit}/{art_total} = {art_hit / art_total:.1%}" if art_total else "")
    return 0 if art_total and art_hit / art_total >= 0.95 else 1


if __name__ == "__main__":
    raise SystemExit(main())

#!/usr/bin/env python3
"""生成应用图标 `src/icon.png`（默认 1024×1024），只用 Python 标准库。

    python tools/make-icon.py [--out src/icon.png] [--size 1024]

设计：深色圆角方块（呼应游戏主题色 #0c0f0e）+ 青绿色菱形棋徽 + 四角棋格。
生成后交给 Tauri 派生各平台图标：

    pnpm icon          # = tauri icon src/icon.png
"""

import argparse
import math
import struct
import zlib

# 主题色
BG_TOP = (11, 15, 14)
BG_BOTTOM = (21, 28, 24)
ACCENT = (53, 208, 165)
TILE = (78, 104, 92)


def coverage(distance: float) -> float:
    """有符号距离 → 覆盖率（1 像素宽的抗锯齿带）。"""
    return min(1.0, max(0.0, 0.5 - distance))


def render(size: int) -> bytearray:
    pixels = bytearray(size * size * 4)
    center = (size - 1) / 2.0
    half = size / 2.0
    corner = size * 0.22
    diamond = size * 0.30
    diamond_width = size * 0.052
    core = size * 0.125
    tile_half = size * 0.042
    tile_offset = size * 0.255

    for y in range(size):
        fy = y - center
        for x in range(size):
            fx = x - center

            # 圆角矩形（整个画布）
            qx = abs(fx) - (half - corner)
            qy = abs(fy) - (half - corner)
            d_rect = math.hypot(max(qx, 0.0), max(qy, 0.0)) + min(max(qx, qy), 0.0) - corner
            alpha_bg = coverage(d_rect)
            if alpha_bg <= 0.0:
                continue

            # 背景竖向渐变
            t = y / (size - 1)
            r = BG_TOP[0] + (BG_BOTTOM[0] - BG_TOP[0]) * t
            g = BG_TOP[1] + (BG_BOTTOM[1] - BG_TOP[1]) * t
            b = BG_TOP[2] + (BG_BOTTOM[2] - BG_TOP[2]) * t

            def over(channel: float, color: tuple, alpha: float) -> float:
                return channel * (1.0 - alpha) + color * alpha

            # 四角棋格
            tile_alpha = 0.0
            for sx in (-1.0, 1.0):
                for sy in (-1.0, 1.0):
                    dx = abs(fx - sx * tile_offset) - tile_half
                    dy = abs(fy - sy * tile_offset) - tile_half
                    d_tile = math.hypot(max(dx, 0.0), max(dy, 0.0)) + min(max(dx, dy), 0.0) - tile_half * 0.45
                    tile_alpha = max(tile_alpha, coverage(d_tile) * 0.8)
            if tile_alpha > 0.0:
                r = over(r, TILE[0], tile_alpha)
                g = over(g, TILE[1], tile_alpha)
                b = over(b, TILE[2], tile_alpha)

            # 菱形外框 + 内芯（菱形就是 L1 球）
            l1 = abs(fx) + abs(fy)
            ring = coverage(abs(l1 - diamond) - diamond_width / 2.0)
            if ring > 0.0:
                r = over(r, ACCENT[0], ring)
                g = over(g, ACCENT[1], ring)
                b = over(b, ACCENT[2], ring)

            fill = coverage(l1 - core)
            if fill > 0.0:
                r = over(r, ACCENT[0], fill * 0.92)
                g = over(g, ACCENT[1], fill * 0.92)
                b = over(b, ACCENT[2], fill * 0.92)

            index = (y * size + x) * 4
            pixels[index] = int(round(min(255.0, max(0.0, r))))
            pixels[index + 1] = int(round(min(255.0, max(0.0, g))))
            pixels[index + 2] = int(round(min(255.0, max(0.0, b))))
            pixels[index + 3] = int(round(alpha_bg * 255))

    return pixels


def write_png(path: str, size: int, pixels: bytearray) -> None:
    stride = size * 4
    raw = bytearray()
    for y in range(size):
        raw.append(0)  # filter type 0 (None)
        raw += pixels[y * stride:(y + 1) * stride]

    def chunk(tag: bytes, data: bytes) -> bytes:
        return (
            struct.pack(">I", len(data))
            + tag
            + data
            + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
        )

    header = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)
    png = (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", header)
        + chunk(b"IDAT", zlib.compress(bytes(raw), 9))
        + chunk(b"IEND", b"")
    )
    with open(path, "wb") as handle:
        handle.write(png)


def main() -> None:
    parser = argparse.ArgumentParser(description="生成 ezSPclient 应用图标")
    parser.add_argument("--out", default="src/icon.png", help="输出路径（默认 src/icon.png）")
    parser.add_argument("--size", type=int, default=1024, help="边长像素（默认 1024）")
    args = parser.parse_args()
    pixels = render(args.size)
    write_png(args.out, args.size, pixels)
    print(f"已生成 {args.out}（{args.size}×{args.size}）")


if __name__ == "__main__":
    main()

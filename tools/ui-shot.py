"""临时脚本：抓取指定标题的窗口截图（用于生成文档截图，不入库）。

    python ui-shot.py --title ezSPclient --out shot.png --width 1100
"""

import argparse
import ctypes
import ctypes.wintypes as wt
import struct
import zlib

parser = argparse.ArgumentParser()
parser.add_argument("--title", default="ezSPclient")
parser.add_argument("--out", default="shot.png")
parser.add_argument("--width", type=int, default=0, help="缩放后的宽度（0 = 不缩放）")
args = parser.parse_args()

user32 = ctypes.windll.user32
gdi32 = ctypes.windll.gdi32

found = []


@ctypes.WINFUNCTYPE(wt.BOOL, wt.HWND, wt.LPARAM)
def enum_proc(hwnd, _):
    length = user32.GetWindowTextLengthW(hwnd)
    if length:
        buf = ctypes.create_unicode_buffer(length + 1)
        user32.GetWindowTextW(hwnd, buf, length + 1)
        if args.title in buf.value and user32.IsWindowVisible(hwnd):
            found.append((hwnd, buf.value))
    return True


user32.EnumWindows(enum_proc, 0)
if not found:
    raise SystemExit(f"没找到标题含 {args.title!r} 的可见窗口")
hwnd, title = found[0]
print(f"窗口: {title!r}")

rect = wt.RECT()
user32.GetWindowRect(hwnd, ctypes.byref(rect))
width, height = rect.right - rect.left, rect.bottom - rect.top


class BITMAPINFOHEADER(ctypes.Structure):
    _fields_ = [
        ("biSize", wt.DWORD), ("biWidth", ctypes.c_long), ("biHeight", ctypes.c_long),
        ("biPlanes", wt.WORD), ("biBitCount", wt.WORD), ("biCompression", wt.DWORD),
        ("biSizeImage", wt.DWORD), ("biXPelsPerMeter", ctypes.c_long),
        ("biYPelsPerMeter", ctypes.c_long), ("biClrUsed", wt.DWORD), ("biClrImportant", wt.DWORD),
    ]


class BITMAPINFO(ctypes.Structure):
    _fields_ = [("bmiHeader", BITMAPINFOHEADER), ("bmiColors", wt.DWORD * 3)]


bmi = BITMAPINFO()
bmi.bmiHeader.biSize = ctypes.sizeof(BITMAPINFOHEADER)
bmi.bmiHeader.biWidth = width
bmi.bmiHeader.biHeight = -height
bmi.bmiHeader.biPlanes = 1
bmi.bmiHeader.biBitCount = 32
bmi.bmiHeader.biCompression = 0

window_dc = user32.GetWindowDC(hwnd)
mem_dc = gdi32.CreateCompatibleDC(window_dc)
bits = ctypes.c_void_p()
bitmap = gdi32.CreateDIBSection(window_dc, ctypes.byref(bmi), 0, ctypes.byref(bits), None, 0)
gdi32.SelectObject(mem_dc, bitmap)
print("PrintWindow ->", user32.PrintWindow(hwnd, mem_dc, 2))

raw = ctypes.string_at(bits, width * height * 4)
gdi32.DeleteObject(bitmap)
gdi32.DeleteDC(mem_dc)
user32.ReleaseDC(hwnd, window_dc)

# 需要缩放就按最近邻抽稀（文档截图够用）
if args.width and args.width < width:
    scale = args.width / width
    new_w, new_h = args.width, int(height * scale)
    rows = bytearray()
    for y in range(new_h):
        sy = int(y / scale)
        row = bytearray()
        base = sy * width * 4
        for x in range(new_w):
            sx = int(x / scale)
            i = base + sx * 4
            row += bytes((raw[i + 2], raw[i + 1], raw[i], raw[i + 3]))  # BGRA -> RGBA
        rows += b"\x00" + row
else:
    new_w, new_h = width, height
    rows = bytearray()
    for y in range(height):
        row = bytearray(raw[y * width * 4:(y + 1) * width * 4])
        for x in range(width):
            i = x * 4
            row[i], row[i + 2] = row[i + 2], row[i]
        rows += b"\x00" + row


def chunk(tag: bytes, data: bytes) -> bytes:
    return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)


png = (
    b"\x89PNG\r\n\x1a\n"
    + chunk(b"IHDR", struct.pack(">IIBBBBB", new_w, new_h, 8, 6, 0, 0, 0))
    + chunk(b"IDAT", zlib.compress(bytes(rows), 9))
    + chunk(b"IEND", b"")
)
with open(args.out, "wb") as handle:
    handle.write(png)
print(f"已写入 {args.out} ({new_w}x{new_h})")

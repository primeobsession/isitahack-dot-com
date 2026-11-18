#!/usr/bin/env python3
"""Build the Page's generated DATA block from /workspace/groundstop/data/*.csv.

Writes data_block.ts (the text that goes between the DATA START / DATA END markers)
and, if page.canvas.tsx exists, splices the block into that local mirror too.
"""
import base64, glob, io, os, re
ROOT = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(ROOT, "data")
ASSETS = os.path.join(ROOT, "assets")
START = "// ==== DATA START (generated from /workspace/groundstop/data/*.csv by build_data.py; do not hand-edit) ===="
END = "// ==== DATA END ===="

def esc(s):
    return s.replace("\\", "\\\\").replace("`", "\\`").replace("${", "\\${")

def byline_image():
    """Small JPEG for the Enniod byline, made from assets/enniod_thumb.jpg."""
    thumb = os.path.join(ASSETS, "enniod_thumb.jpg")
    out = os.path.join(ASSETS, "enniod_byline.jpg")
    try:
        from PIL import Image
        im = Image.open(thumb).convert("RGB")
        w = 160; h = round(im.size[1] * w / im.size[0])
        im.resize((w, h), Image.LANCZOS).save(out, quality=68, optimize=True, progressive=True)
        path = out
    except Exception:
        path = thumb
    return "data:image/jpeg;base64," + base64.b64encode(open(path, "rb").read()).decode()

def build():
    parts = [START, "const DATA: Record<string, string> = {"]
    for f in sorted(glob.glob(os.path.join(DATA, "*.csv"))):
        name = os.path.splitext(os.path.basename(f))[0]
        text = open(f, encoding="utf-8").read().strip("\n")
        parts.append(f"  {name}: `{esc(text)}`,")
    parts.append("};")
    parts.append(f'const ENNIOD_IMG = "{byline_image()}";')
    parts.append(END)
    block = "\n".join(parts) + "\n"
    open(os.path.join(ROOT, "data_block.ts"), "w", encoding="utf-8").write(block)
    page = os.path.join(ROOT, "page.canvas.tsx")
    if os.path.exists(page):
        src = open(page, encoding="utf-8").read()
        i, j = src.find(START), src.find(END)
        if i >= 0 and j > i:
            src = src[:i] + block.rstrip("\n") + src[j + len(END):]
            open(page, "w", encoding="utf-8").write(src)
    print(f"data_block.ts: {len(block)} bytes from {len(glob.glob(os.path.join(DATA, '*.csv')))} CSV files")

if __name__ == "__main__":
    build()

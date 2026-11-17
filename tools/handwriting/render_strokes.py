#!/usr/bin/env python3
"""Render cockpid.pencilkit.strokes v1 to PNG without Apple frameworks or OCR.

Usage: python render_strokes.py input.strokes.json output.png
Requires: Pillow
"""
import json
import math
import sys
from PIL import Image, ImageDraw


def render(source, destination, scale=2):
    with open(source, encoding="utf-8") as fh:
        data = json.load(fh)
    if data.get("schema") != "cockpid.pencilkit.strokes" or data.get("version") != 1:
        raise ValueError("Unsupported stroke schema")
    width = int(math.ceil(float(data["canvasWidth"]) * scale))
    height = int(math.ceil(float(data["canvasHeight"]) * scale))
    if not (0 < width <= 20000 and 0 < height <= 20000):
        raise ValueError("Unexpected canvas size")
    image = Image.new("RGBA", (width, height), "white")
    draw = ImageDraw.Draw(image, "RGBA")
    for stroke in data.get("strokes", []):
        pts = stroke.get("points", [])
        if not pts:
            continue
        color = stroke.get("color", "#000000FF")
        if not isinstance(color, str) or len(color) != 9 or not color.startswith("#"):
            color = "#000000FF"
        rgba = tuple(bytes.fromhex(color[1:]))
        # This is a preview approximation, not pixel-identical PencilKit rendering.
        for a, b in zip(pts, pts[1:]):
            x0, y0 = float(a["x"]) * scale, float(a["y"]) * scale
            x1, y1 = float(b["x"]) * scale, float(b["y"]) * scale
            radius = max(0.5, float(a.get("width", 1)) * scale / 2)
            draw.line([(x0, y0), (x1, y1)], fill=rgba,
                      width=max(1, round(2 * radius)), joint="curve")
            draw.ellipse((x1-radius, y1-radius, x1+radius, y1+radius), fill=rgba)
        if len(pts) == 1:
            p = pts[0]
            x, y = float(p["x"]) * scale, float(p["y"]) * scale
            r = max(0.5, float(p.get("width", 1)) * scale / 2)
            draw.ellipse((x-r, y-r, x+r, y+r), fill=rgba)
    image.convert("RGB").save(destination)


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit("Usage: render_strokes.py input.strokes.json output.png")
    render(sys.argv[1], sys.argv[2])

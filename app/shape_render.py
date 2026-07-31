# Export-side rasterization for the vector shape overlay feature: write_shape_png() draws a
# filled rounded-rect as an RGBA PNG via Pillow (already a dependency, see app/font_metrics.py
# and app/mask_image.py) — fill_color at the given opacity inside the rounded rect, fully
# transparent outside. Consumed by app/ffmpeg_cmd.py's "shape" band (a plain overlay respects
# the PNG's own alpha directly, no alphaextract/alphamerge needed — unlike the edge-mask
# feature's mask PNGs, which composite onto an existing video/image stream that has no alpha
# of its own).
from PIL import Image, ImageDraw

def _hex_to_rgb(hex_color: str) -> tuple[int, int, int]:
    h = hex_color.lstrip("#")
    return int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)

def write_shape_png(path: str, width: int, height: int, fill_color: str, opacity: float,
                    corner_radius: int) -> None:
    """Write a width x height RGBA PNG: a filled rounded-rect in fill_color, alpha =
    round(opacity * 255) inside the rect, 0 outside. corner_radius is clamped to
    min(width, height) / 2 so it can never self-intersect."""
    w, h = int(width), int(height)
    radius = max(0, min(int(corner_radius), int(min(w, h) / 2)))
    alpha = round(max(0.0, min(1.0, opacity)) * 255)
    r, g, b = _hex_to_rgb(fill_color)

    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    ImageDraw.Draw(img).rounded_rectangle([0, 0, w - 1, h - 1], radius=radius, fill=(r, g, b, alpha))
    img.save(path)

# Export-side rasterization for the vector shape overlay feature: write_shape_png() draws a
# filled rounded-rect as an RGBA PNG via Pillow (already a dependency, see app/font_metrics.py) —
# fill_color at the given opacity inside the rounded rect, fully transparent outside. Consumed by
# app/ffmpeg_cmd.py's "shape" band (a plain overlay respects the PNG's own alpha directly).
# write_shape_mask_png() rasterizes the same rounded-rect shape as a shape-as-mask feature's mask
# PNG instead: opaque white (not fill_color) at the given position/opacity within a canvas sized
# to the MASKED TARGET box (not the shape itself) — consumed by app/ffmpeg_cmd.py's "mask_path"
# alphaextract/alphamerge chain, same as the retired box-edge-mask feature's write_mask_png.
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

def write_shape_mask_png(path: str, target_width: int, target_height: int, rel_x: float,
                         rel_y: float, shape_width: float, shape_height: float,
                         opacity: float, corner_radius: int) -> None:
    """Write a target_width x target_height RGBA mask PNG: a filled rounded-rect at
    (rel_x, rel_y, shape_width, shape_height) — the mask shape's rect in the target box's own
    local coordinate space (app.shape_mask.local_rect) — alpha = round(opacity * 255) inside,
    0 outside. Pillow clips drawing to the canvas automatically, so a shape rect that hangs off
    any edge of the target box is safe. corner_radius is clamped to
    min(shape_width, shape_height) / 2 so it can never self-intersect."""
    tw, th = int(target_width), int(target_height)
    radius = max(0, min(int(corner_radius), int(min(shape_width, shape_height) / 2)))
    alpha = round(max(0.0, min(1.0, opacity)) * 255)

    img = Image.new("RGBA", (tw, th), (0, 0, 0, 0))
    x0, y0 = rel_x, rel_y
    x1, y1 = rel_x + shape_width - 1, rel_y + shape_height - 1
    ImageDraw.Draw(img).rounded_rectangle([x0, y0, x1, y1], radius=radius, fill=(255, 255, 255, alpha))
    img.save(path)

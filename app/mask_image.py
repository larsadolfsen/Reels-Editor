# Export-side rasterization of app.box_mask's kept-region polygon: write_mask_png() draws it with
# Pillow (already a dependency, see app/font_metrics.py) as an RGBA PNG — opaque white inside the
# kept region, fully transparent outside — for ffmpeg to alphaextract + alphamerge onto the box.
from PIL import Image, ImageDraw

from app.box_mask import mask_polygon

def write_mask_png(path: str, width: int, height: int, angle: float, offset: float,
                   flip: bool) -> None:
    """Write a width x height RGBA mask PNG for one box's straight-line cut.

    Alpha carries the mask: 255 inside the kept region, 0 outside. An empty polygon (the line
    keeps nothing) writes a fully transparent PNG, which correctly hides the box entirely.
    """
    img = Image.new("RGBA", (int(width), int(height)), (0, 0, 0, 0))
    polygon = mask_polygon(float(width), float(height), angle, offset, flip)
    if polygon:
        ImageDraw.Draw(img).polygon([(x, y) for x, y in polygon], fill=(255, 255, 255, 255))
    img.save(path)

# Tests for app.shape_render.write_shape_png: a filled rounded-rect RGBA PNG for the vector
# shape overlay feature, same rasterization style as app.mask_image.write_mask_png.
from PIL import Image
from app.shape_render import write_shape_png

def test_output_size_and_mode(tmp_path):
    path = tmp_path / "shape.png"
    write_shape_png(str(path), 200, 100, "#FF0000", 1.0, 0)
    img = Image.open(path)
    assert img.size == (200, 100)
    assert img.mode == "RGBA"

def test_full_opacity_center_pixel_is_opaque_fill_color(tmp_path):
    path = tmp_path / "shape.png"
    write_shape_png(str(path), 200, 100, "#FF0000", 1.0, 0)
    img = Image.open(path)
    r, g, b, a = img.getpixel((100, 50))
    assert (r, g, b, a) == (255, 0, 0, 255)

def test_partial_opacity_scales_alpha(tmp_path):
    path = tmp_path / "shape.png"
    write_shape_png(str(path), 100, 100, "#00FF00", 0.5, 0)
    img = Image.open(path)
    _, _, _, a = img.getpixel((50, 50))
    assert a == 128  # round(0.5 * 255) via PIL's rounding, i.e. round(127.5) == 128

def test_zero_opacity_is_fully_transparent(tmp_path):
    path = tmp_path / "shape.png"
    write_shape_png(str(path), 50, 50, "#0000FF", 0.0, 0)
    img = Image.open(path)
    _, _, _, a = img.getpixel((25, 25))
    assert a == 0

def test_corners_transparent_when_corner_radius_set(tmp_path):
    path = tmp_path / "shape.png"
    write_shape_png(str(path), 100, 100, "#FFFFFF", 1.0, 30)
    img = Image.open(path)
    _, _, _, corner_alpha = img.getpixel((1, 1))
    _, _, _, center_alpha = img.getpixel((50, 50))
    assert corner_alpha == 0
    assert center_alpha == 255

def test_corner_radius_clamped_to_half_min_dimension(tmp_path):
    # radius (80) exceeds min(width, height)/2 == 25 for a 50x100 box; must not raise or
    # produce a self-intersecting rounded-rect, and the box's actual center must stay opaque.
    path = tmp_path / "shape.png"
    write_shape_png(str(path), 50, 100, "#FFFFFF", 1.0, 80)
    img = Image.open(path)
    _, _, _, center_alpha = img.getpixel((25, 50))
    assert center_alpha == 255

# Tests for app.mask_image.write_mask_png: the export-side rasterization of app.box_mask's
# kept-region polygon into an RGBA PNG whose alpha channel ffmpeg alphaextracts.
from PIL import Image

from app.mask_image import write_mask_png

def test_png_has_the_requested_size_and_rgba_mode(tmp_path):
    path = tmp_path / "mask.png"
    write_mask_png(str(path), 100, 200, 0.0, 0.0, False)
    with Image.open(path) as img:
        assert img.size == (100, 200)
        assert img.mode == "RGBA"

def test_vertical_cut_is_opaque_left_and_transparent_right(tmp_path):
    path = tmp_path / "mask.png"
    write_mask_png(str(path), 100, 200, 0.0, 0.0, False)
    with Image.open(path) as img:
        assert img.getpixel((10, 100))[3] == 255    # kept side
        assert img.getpixel((90, 100))[3] == 0      # cut side

def test_flip_swaps_which_side_is_opaque(tmp_path):
    path = tmp_path / "mask.png"
    write_mask_png(str(path), 100, 200, 0.0, 0.0, True)
    with Image.open(path) as img:
        assert img.getpixel((10, 100))[3] == 0
        assert img.getpixel((90, 100))[3] == 255

def test_kept_pixels_are_white(tmp_path):
    path = tmp_path / "mask.png"
    write_mask_png(str(path), 100, 200, 0.0, 0.0, False)
    with Image.open(path) as img:
        assert img.getpixel((10, 100)) == (255, 255, 255, 255)

def test_line_missing_the_box_on_the_cut_side_gives_a_fully_transparent_png(tmp_path):
    path = tmp_path / "mask.png"
    write_mask_png(str(path), 100, 200, 0.0, -1000.0, False)
    with Image.open(path) as img:
        assert img.getpixel((10, 100))[3] == 0
        assert img.getpixel((90, 100))[3] == 0

def test_horizontal_cut_is_opaque_on_top(tmp_path):
    path = tmp_path / "mask.png"
    write_mask_png(str(path), 100, 200, 90.0, 0.0, False)
    with Image.open(path) as img:
        assert img.getpixel((50, 20))[3] == 255
        assert img.getpixel((50, 180))[3] == 0

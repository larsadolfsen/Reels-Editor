# Tests for app.box_mask.mask_polygon: the pure straight-line cut geometry shared by the
# stage preview (static/box-mask.js) and the export mask PNG (app/mask_image.py).
from app.box_mask import mask_polygon

W, H = 100.0, 200.0   # a tall box, so vertical and horizontal cuts give distinguishable answers

def test_vertical_cut_keeps_left_half():
    assert mask_polygon(W, H, 0, 0, False) == [(0.0, 0.0), (50.0, 0.0), (50.0, 200.0), (0.0, 200.0)]

def test_flip_keeps_the_other_side():
    assert mask_polygon(W, H, 0, 0, True) == [(50.0, 0.0), (100.0, 0.0), (100.0, 200.0), (50.0, 200.0)]

def test_offset_shifts_the_cut_line_along_its_normal():
    assert mask_polygon(W, H, 0, 25, False) == [(0.0, 0.0), (75.0, 0.0), (75.0, 200.0), (0.0, 200.0)]

def test_ninety_degrees_is_a_horizontal_cut_keeping_the_top():
    assert mask_polygon(W, H, 90, 0, False) == [(0.0, 0.0), (100.0, 0.0), (100.0, 100.0), (0.0, 100.0)]

def test_angled_cut_produces_a_clipped_quad():
    # 45 deg through the center: kept region is x + y <= 150
    assert mask_polygon(W, H, 45, 0, False) == [(0.0, 0.0), (100.0, 0.0), (100.0, 50.0), (0.0, 150.0)]

def test_line_entirely_outside_keeps_the_whole_box():
    assert mask_polygon(W, H, 0, 1000, False) == [(0.0, 0.0), (100.0, 0.0), (100.0, 200.0), (0.0, 200.0)]

def test_line_entirely_outside_the_other_way_keeps_nothing():
    assert mask_polygon(W, H, 0, -1000, False) == []

def test_every_vertex_stays_within_the_box_bounds():
    poly = mask_polygon(W, H, 30, 12.5, True)
    assert poly
    assert all(0.0 <= x <= W and 0.0 <= y <= H for x, y in poly)

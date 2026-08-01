# Tests for app.shape_mask.local_rect: expresses a mask shape's geometry relative to its
# target box's own top-left corner, the coordinate space both the CSS mask-image (preview)
# and the rasterized mask PNG (export) are built in.
from app.shape_mask import local_rect

def test_shape_exactly_covering_target_has_zero_offset():
    rect = local_rect(target_x=100, target_y=200, shape_x=100, shape_y=200,
                       shape_width=300, shape_height=400, opacity=1.0, corner_radius=0)
    assert rect == {"rel_x": 0, "rel_y": 0, "width": 300, "height": 400,
                     "opacity": 1.0, "corner_radius": 0}

def test_shape_offset_from_target_carries_signed_offset():
    rect = local_rect(target_x=100, target_y=200, shape_x=150, shape_y=180,
                       shape_width=50, shape_height=60, opacity=0.5, corner_radius=8)
    assert rect["rel_x"] == 50   # shape is to the right of target's origin
    assert rect["rel_y"] == -20  # shape is above target's origin
    assert rect["width"] == 50 and rect["height"] == 60
    assert rect["opacity"] == 0.5 and rect["corner_radius"] == 8

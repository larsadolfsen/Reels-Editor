# Pure geometry for shape-as-mask: local_rect() expresses a mask ShapeLayer's rect relative to
# its target VideoBoxLayer/ImageBoxLayer's own top-left corner — the coordinate space both the
# CSS mask-image (static/shape-mask.js, live preview) and the rasterized mask PNG
# (app/shape_render.py's write_shape_mask_png, export) are built in.
# Mirrored exactly in static/shape-mask.js — pinned together by tests/test_shape_mask_js.py.

def local_rect(target_x: float, target_y: float, shape_x: float, shape_y: float,
               shape_width: float, shape_height: float, opacity: float,
               corner_radius: float) -> dict:
    """Express a mask shape's rect in the target box's own local coordinate space (target's
    top-left corner = origin). Width/height/opacity/corner_radius pass through unchanged."""
    return {
        "rel_x": shape_x - target_x,
        "rel_y": shape_y - target_y,
        "width": shape_width,
        "height": shape_height,
        "opacity": opacity,
        "corner_radius": corner_radius,
    }

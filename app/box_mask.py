# Pure straight-line mask geometry for video/image boxes: mask_polygon() clips the box rectangle
# by one half-plane and returns the KEPT region as a clockwise polygon in box-local px.
# Mirrored exactly in static/box-mask.js — the two are pinned together by tests/test_box_mask_js.py.
import math

def _clamped(x: float, y: float, width: float, height: float) -> tuple[float, float]:
    """Clamp a vertex into the box and round off float noise so both language mirrors agree."""
    cx = min(max(x, 0.0), width)
    cy = min(max(y, 0.0), height)
    return (round(cx, 6), round(cy, 6))

def mask_polygon(width: float, height: float, angle: float, offset: float,
                 flip: bool) -> list[tuple[float, float]]:
    """Polygon of the KEPT region of a width x height box cut by one straight line.

    Box-local coordinates: origin top-left, x right, y down. The line sits at signed
    perpendicular distance `offset` px from the box's center; `angle` is in degrees, 0 being a
    vertical line and increasing values rotating clockwise on screen. `flip` keeps the other side.

    Returns clockwise vertices clipped to the box: [] when nothing is kept, the full rectangle
    when the line misses the box on the kept side.
    """
    theta = math.radians(angle)
    nx, ny = math.cos(theta), math.sin(theta)
    if flip:
        nx, ny, offset = -nx, -ny, -offset
    cx, cy = width / 2.0, height / 2.0
    rect = [(0.0, 0.0), (float(width), 0.0), (float(width), float(height)), (0.0, float(height))]
    dists = [nx * (px - cx) + ny * (py - cy) - offset for px, py in rect]

    # Sutherland-Hodgman against a single half-plane. Emitting `cur` (rather than `next`) keeps
    # the all-inside case in the rectangle's own vertex order, and preserves clockwise winding.
    out: list[tuple[float, float]] = []
    for i in range(4):
        cur, nxt = rect[i], rect[(i + 1) % 4]
        sc, sn = dists[i], dists[(i + 1) % 4]
        if sc <= 0:
            out.append(_clamped(cur[0], cur[1], width, height))
        if (sc <= 0) != (sn <= 0):
            t = sc / (sc - sn)
            out.append(_clamped(cur[0] + t * (nxt[0] - cur[0]),
                                cur[1] + t * (nxt[1] - cur[1]), width, height))
    return out

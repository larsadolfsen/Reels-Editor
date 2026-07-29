// Pure straight-line mask geometry for video/image boxes: maskPolygon() returns the KEPT region
// of a box as a clockwise polygon in box-local px (exact mirror of app/box_mask.py's
// mask_polygon — keep both in sync), and clipPath() formats it as a CSS clip-path value.
window.BoxMask = (() => {
  function clamped(x, y, width, height) {
    const cx = Math.min(Math.max(x, 0), width);
    const cy = Math.min(Math.max(y, 0), height);
    return [Math.round(cx * 1e6) / 1e6, Math.round(cy * 1e6) / 1e6];
  }

  // Box-local coordinates: origin top-left, x right, y down. The line sits at signed
  // perpendicular distance `offset` px from the box's center; `angle` is in degrees, 0 being a
  // vertical line and increasing values rotating clockwise on screen. `flip` keeps the other side.
  function maskPolygon(width, height, angle, offset, flip) {
    const theta = angle * Math.PI / 180;
    let nx = Math.cos(theta), ny = Math.sin(theta), off = offset;
    if (flip) { nx = -nx; ny = -ny; off = -off; }
    const cx = width / 2, cy = height / 2;
    const rect = [[0, 0], [width, 0], [width, height], [0, height]];
    const dists = rect.map(([px, py]) => nx * (px - cx) + ny * (py - cy) - off);

    // Sutherland-Hodgman against a single half-plane. Emitting `cur` (rather than `next`) keeps
    // the all-inside case in the rectangle's own vertex order, and preserves clockwise winding.
    const out = [];
    for (let i = 0; i < 4; i++) {
      const cur = rect[i], nxt = rect[(i + 1) % 4];
      const sc = dists[i], sn = dists[(i + 1) % 4];
      if (sc <= 0) out.push(clamped(cur[0], cur[1], width, height));
      if ((sc <= 0) !== (sn <= 0)) {
        const t = sc / (sc - sn);
        out.push(clamped(cur[0] + t * (nxt[0] - cur[0]), cur[1] + t * (nxt[1] - cur[1]), width, height));
      }
    }
    return out;
  }

  // CSS clip-path value for a VideoBoxLayer/ImageBoxLayer-shaped object, in percentages so it
  // stays correct at any stage size. "" when the box is unmasked (caller clears the property).
  function clipPath(box) {
    if (!box || !box.mask_enabled) return "";
    const poly = maskPolygon(box.width, box.height,
      box.mask_angle || 0, box.mask_offset || 0, !!box.mask_flip);
    if (!poly.length) return "polygon(0% 0%, 0% 0%, 0% 0%)";   // nothing kept: hide the box
    const pts = poly.map(([x, y]) =>
      `${(x / box.width * 100).toFixed(4)}% ${(y / box.height * 100).toFixed(4)}%`);
    return `polygon(${pts.join(", ")})`;
  }

  return { maskPolygon, clipPath };
})();

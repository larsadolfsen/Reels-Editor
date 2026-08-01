// window.ShapeMask: geometry + CSS mask-image generation for shape-as-mask.
// localRect mirrors app/shape_mask.py's local_rect exactly (pinned by tests/test_shape_mask_js.py).
// cssMaskImage/cssInverseMaskImage build a data-URI SVG mask value: cssMaskImage keeps the shape's
// own rect (used on the masked target itself), cssInverseMaskImage keeps everything EXCEPT the
// shape's rect (used on the rubylith red-tint overlay shown while the mask shape is being edited).
window.ShapeMask = (() => {
  // target/shape are {x, y} for target and {x, y, width, height, opacity, corner_radius} for shape.
  function localRect(target, shape) {
    return {
      relX: shape.x - target.x,
      relY: shape.y - target.y,
      width: shape.width,
      height: shape.height,
      opacity: shape.opacity,
      cornerRadius: shape.corner_radius,
    };
  }

  function clampedRadius(rect) {
    return Math.max(0, Math.min(rect.cornerRadius, Math.min(rect.width, rect.height) / 2));
  }

  function clampedOpacity(rect) {
    return Math.max(0, Math.min(1, rect.opacity));
  }

  // Luminance mask: white = visible, black = hidden. Kept mask: a white rounded-rect at the
  // shape's own position/size on an otherwise black (fully hidden) canvas.
  function cssMaskImage(targetWidth, targetHeight, rect) {
    const radius = clampedRadius(rect);
    const opacity = clampedOpacity(rect);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${targetWidth}" height="${targetHeight}">` +
      `<rect x="${rect.relX}" y="${rect.relY}" width="${rect.width}" height="${rect.height}" ` +
      `rx="${radius}" fill="#fff" fill-opacity="${opacity}"/></svg>`;
    return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
  }

  // Inverse mask: a full-canvas rect (everything visible by default) with the shape's own rect
  // punched out (hidden there) — the complement of cssMaskImage's kept region. A CSS mask-image
  // reads a plain image's ALPHA channel (not its color/luminance) to decide what's masked out —
  // simply drawing a black rect over a white background does NOT create real transparency there,
  // since normal SVG rect compositing never erases a destination pixel's existing opacity, it only
  // paints on top of it. Routing both rects through an SVG <mask> (which IS luminance-based, by
  // spec, purely as an internal SVG compositing step) bakes the intended visible/hidden split into
  // the rendered image's real alpha channel before the browser ever reads it as a CSS mask source —
  // correct regardless of whether the outer CSS mask-image itself reads alpha or luminance.
  function cssInverseMaskImage(targetWidth, targetHeight, rect) {
    const radius = clampedRadius(rect);
    const opacity = clampedOpacity(rect);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${targetWidth}" height="${targetHeight}">` +
      `<mask id="cut"><rect x="0" y="0" width="${targetWidth}" height="${targetHeight}" fill="#fff"/>` +
      `<rect x="${rect.relX}" y="${rect.relY}" width="${rect.width}" height="${rect.height}" ` +
      `rx="${radius}" fill="#000" fill-opacity="${opacity}"/></mask>` +
      `<rect x="0" y="0" width="${targetWidth}" height="${targetHeight}" fill="#fff" mask="url(#cut)"/></svg>`;
    return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
  }

  const api = { localRect, cssMaskImage, cssInverseMaskImage };
  if (typeof window !== "undefined") window.ShapeMask = api;
  if (typeof module !== "undefined") module.exports = api;
  return api;
})();

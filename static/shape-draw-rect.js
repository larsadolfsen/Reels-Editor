// Pure geometry for the Shape stage tool's click-drag creation gesture: normalizes the two
// corner points of a drag into a rect (top-left x/y + non-negative width/height) regardless of
// which direction the user dragged, clamped to the 1080x1920 canvas bounds. Exposes
// window.ShapeDragRect.fromPoints(p1, p2).
(() => {
  const CANVAS_W = 1080;
  const CANVAS_H = 1920;

  function fromPoints(p1, p2) {
    const x1 = Math.max(0, Math.min(CANVAS_W, p1.x));
    const y1 = Math.max(0, Math.min(CANVAS_H, p1.y));
    const x2 = Math.max(0, Math.min(CANVAS_W, p2.x));
    const y2 = Math.max(0, Math.min(CANVAS_H, p2.y));
    return {
      x: Math.min(x1, x2),
      y: Math.min(y1, y2),
      width: Math.abs(x2 - x1),
      height: Math.abs(y2 - y1),
    };
  }

  const api = { fromPoints };
  if (typeof window !== "undefined") window.ShapeDragRect = api;
  if (typeof module !== "undefined") module.exports = api;
})();

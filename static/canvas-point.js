// Pure conversion from a mouse event's client coordinates into the 1080x1920 canvas coordinate
// space used by TextPreset.x/y, ShapeLayer.x/y, etc. Clamped to canvas bounds. Extracted from
// stage-click-router.js's former private canvasPointFromClient so stage-shape-draw.js can reuse
// the same conversion instead of duplicating it. Exposes window.CanvasPoint.fromClient.
(() => {
  function fromClient(clientX, clientY, rect) {
    const x = Math.round((clientX - rect.left) / rect.width * 1080);
    const y = Math.round((clientY - rect.top) / rect.height * 1920);
    return { x: Math.max(0, Math.min(1080, x)), y: Math.max(0, Math.min(1920, y)) };
  }

  const api = { fromClient };
  if (typeof window !== "undefined") window.CanvasPoint = api;
  if (typeof module !== "undefined") module.exports = api;
})();

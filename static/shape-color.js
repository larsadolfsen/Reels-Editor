// Pure hex+opacity -> CSS rgba() conversion for the vector shape overlay feature: a shape's
// fill color and opacity are stored separately (ShapeLayer.fill_color/opacity), but the CSS
// background needs them combined so opacity affects only the fill, not any future border.
// Exposes window.ShapeColor.toRgba(hex, opacity).
(() => {
  function toRgba(hex, opacity) {
    const h = hex.replace("#", "");
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${opacity})`;
  }

  const api = { toRgba };
  if (typeof window !== "undefined") window.ShapeColor = api;
  if (typeof module !== "undefined") module.exports = api;
})();

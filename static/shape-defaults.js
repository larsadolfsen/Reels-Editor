// Pure default values for a newly-created ShapeLayer (vector shape overlay feature): the one
// place these live, so panel-shape.js's create path and its tests stay in sync.
// Exposes window.ShapeDefaults.centeredShape().
(() => {
  const CANVAS_W = 1080;
  const CANVAS_H = 1920;
  const DEFAULT_SIZE = 300;

  function centeredShape() {
    return {
      start: 0,
      duration: 3.0,
      x: Math.round((CANVAS_W - DEFAULT_SIZE) / 2),
      y: Math.round((CANVAS_H - DEFAULT_SIZE) / 2),
      width: DEFAULT_SIZE,
      height: DEFAULT_SIZE,
      fill_color: "#4C6FFF",
      opacity: 1.0,
      corner_radius: 0,
      z_index: -1,
    };
  }

  const api = { centeredShape };
  if (typeof window !== "undefined") window.ShapeDefaults = api;
  if (typeof module !== "undefined") module.exports = api;
})();

// window.maskActiveShapeId(masksVideoBox, masksImageBox, shapeId) (added 2026-08-01, rubylith
// regression fix): pure helper deciding the single shared value VideoBoxPreview/ImageBoxPreview's
// BoxMaskRender-backed setActiveMaskShapeId must both receive — "does this shape mask EITHER a
// video box OR an image box" — since both preview modules now delegate to one shared variable
// (static/box-mask-render.js) rather than two independent ones. Consumed by static/panel-shape.js.
// Guarded dual export (window + module.exports) for node --test, mirrors font-size-scale.js.
(() => {
  function maskActiveShapeId(masksVideoBox, masksImageBox, shapeId) {
    return (masksVideoBox || masksImageBox) ? shapeId : null;
  }

  if (typeof window !== "undefined") window.maskActiveShapeId = maskActiveShapeId;
  if (typeof module !== "undefined") module.exports = { maskActiveShapeId };
})();

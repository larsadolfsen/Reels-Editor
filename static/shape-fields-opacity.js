// Shared "OPACITY" field for a ShapeLayer — extracted 2026-08-01, mask-list-styling, so the
// standalone SHAPE panel's Style tab and the Mask tab's inline mask-shape editor
// (box-panel-mask.js) share one implementation. window.ShapeOpacityField.render(el, shape,
// {onChange, span}) fills `el` in place (el is the row-slot element, same convention as
// ShapeSizePositionFields' per-field labels) — onChange() must only save + re-render the stage
// preview/timeline. `span` (default 4, matching the standalone SHAPE panel where this field sits
// beside Corner Radius in one row) lets a standalone use (box-panel-mask.js, no radius field
// alongside it) take the full row width instead.
window.ShapeOpacityField = window.ShapeOpacityField || {};

window.ShapeOpacityField.render = function render(el, shape, { onChange, span = 4 }) {
  UI.numberField(el, { label: "OPACITY", unit: "%", value: Math.round(shape.opacity * 100), min: 0, max: 100, span,
    onChange: (v) => { shape.opacity = v / 100; onChange(); } });
};

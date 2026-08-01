// Shared "SIZE & POSITION" fields for a ShapeLayer (X/Y/WIDTH/HEIGHT, free-form — no aspect
// lock, unlike box-panel-size-position.js's video/image box version) — extracted 2026-08-01,
// mask-list-styling, so the standalone SHAPE panel's Box tab and the Mask tab's inline
// mask-shape editor (box-panel-mask.js) share one implementation instead of hand-writing
// X/Y/WIDTH/HEIGHT twice. window.ShapeSizePositionFields.render(container, shape, {onChange})
// rebuilds `container` fresh each call — callers invoke it once per shape selection, never from
// inside a field's own onChange (same contract as BoxSizePositionPanel.render); onChange() must
// only save + re-render the stage preview/timeline.
window.ShapeSizePositionFields = window.ShapeSizePositionFields || {};

window.ShapeSizePositionFields.render = function render(container, shape, { onChange }) {
  container.innerHTML = "";

  const eyebrow = document.createElement("div");
  eyebrow.className = "section-label-spacer text-eyebrow";
  eyebrow.textContent = "SIZE & POSITION";
  container.appendChild(eyebrow);

  const group = document.createElement("div");
  group.className = "style-group";
  container.appendChild(group);

  function styleRow() {
    const row = document.createElement("div");
    row.className = "style-row";
    group.appendChild(row);
    return row;
  }

  const posRow = styleRow();
  const xEl = document.createElement("label");
  const yEl = document.createElement("label");
  posRow.append(xEl, yEl);

  const sizeRow = styleRow();
  const widthEl = document.createElement("label");
  const heightEl = document.createElement("label");
  sizeRow.append(widthEl, heightEl);

  UI.numberField(xEl, { label: "X", unit: "PX", value: shape.x, min: 0, max: 1080, span: 4,
    onChange: (v) => { shape.x = v; onChange(); } });
  UI.numberField(yEl, { label: "Y", unit: "PX", value: shape.y, min: 0, max: 1920, span: 4,
    onChange: (v) => { shape.y = v; onChange(); } });
  UI.numberField(widthEl, { label: "WIDTH", unit: "PX", value: shape.width, min: 1, max: 1080, span: 4,
    onChange: (v) => { shape.width = v; onChange(); } });
  UI.numberField(heightEl, { label: "HEIGHT", unit: "PX", value: shape.height, min: 1, max: 1920, span: 4,
    onChange: (v) => { shape.height = v; onChange(); } });
};

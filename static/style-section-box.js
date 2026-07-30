// Shared Box-tab section: WIDTH/HEIGHT for a text block or caption box — one file serving both
// the TEXT and CAPTIONS panels. Sizing mode (fit vs. fixed) is driven automatically elsewhere
// (panel-text.js auto-freezes a TEXT block from fit to fixed once it has content), not by a
// user-facing toggle here. Background and border are NOT built here: they already have their
// own settings-row + drill-down UI (text-panel-background.js/text-panel-border.js and the
// CAPTIONS equivalents), rendered as siblings of this section inside the same Box tab body —
// this section must not duplicate or replace that UI. Builds its own markup once in the
// factory; render() only pushes current values back through the setters the UI.* primitives
// returned. Every write here is whole-preset (setPresetField): no box field is FormatRun-capable.
window.StyleSection = window.StyleSection || {};

// options.sizeModes
//   true  -> TEXT: hides WIDTH/HEIGHT while the block is still auto-sizing to its content
//            (box_width_mode === "fit").
//   false -> CAPTIONS: WIDTH/HEIGHT are unconditionally visible — a caption box is always a
//            fixed size. This is an option, never a check on target.kind — a section must not
//            know which panel it is in.
window.StyleSection.box = function box(container, target, options) {
  const opts = options || {};
  const sizeModes = !!opts.sizeModes;

  container.innerHTML = "";

  function styleGroup(child) {
    const g = document.createElement("div");
    g.className = "style-group";
    g.appendChild(child);
    container.appendChild(g);
  }
  function styleRow(children) {
    const r = document.createElement("div");
    r.className = "style-row";
    children.forEach((c) => r.appendChild(c));
    return r;
  }

  const preset0 = target.getPreset();

  // ---- markup, built once -------------------------------------------------------------
  const widthEl = document.createElement("label");
  const heightEl = document.createElement("label");
  styleGroup(styleRow([widthEl, heightEl]));

  // ---- controls, built once; render() drives the setters they return --------------------
  const setWidth = UI.numberField(widthEl,
    { label: "WIDTH", unit: "PX", value: preset0.box_width, min: 1, max: 1080, span: 4,
      onChange: (v) => target.setPresetField("box_width", v) });

  const setHeight = UI.numberField(heightEl,
    { label: "HEIGHT", unit: "PX", value: preset0.box_height, min: 1, max: 1920, span: 4,
      onChange: (v) => target.setPresetField("box_height", v) });

  function render() {
    const preset = target.getPreset();
    // WIDTH/HEIGHT serve FREE (manual fixed size) — only FIT sizes the box to its content and
    // has no use for them. A block auto-freezes from FIT to FIXED once it has content (see
    // panel-text.js's onEditEnd/handleBoxResizeEnd), so this is never user-toggled; with
    // sizeModes off (CAPTIONS) there is no FIT to be in, so they always show.
    const sizeFieldsHidden = sizeModes && preset.box_width_mode === "fit";
    widthEl.hidden = sizeFieldsHidden;
    heightEl.hidden = sizeFieldsHidden;
    setWidth(preset.box_width);
    setHeight(preset.box_height);
  }

  render();
  return { render };
};

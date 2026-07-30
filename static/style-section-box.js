// Shared Box-tab section: SIZE mode (FIT/FREE/FILL) and WIDTH/HEIGHT — one file serving both the
// TEXT and CAPTIONS panels. Background and border are NOT built here: they already have their own
// settings-row + drill-down UI (text-panel-background.js/text-panel-border.js and the CAPTIONS
// equivalents), rendered as siblings of this section inside the same Box tab body — this section
// must not duplicate or replace that UI. Builds its own markup once in the factory; render() only
// pushes current values back through the setters the UI.* primitives returned. Every write here is
// whole-preset (setPresetField): no box field is FormatRun-capable.
window.StyleSection = window.StyleSection || {};

// options.sizeModes
//   true  -> TEXT: renders the SIZE label + FIT/FREE/FILL group, and hides WIDTH/HEIGHT in FIT.
//   false -> CAPTIONS: no SIZE label and no group at all; a caption box is always a fixed size,
//            so WIDTH/HEIGHT are unconditionally visible. This is an option, never a check on
//            target.kind — a section must not know which panel it is in.
window.StyleSection.box = function box(container, target, options) {
  const opts = options || {};
  const sizeModes = !!opts.sizeModes;

  container.innerHTML = "";

  function groupLabel(text) {
    const el = document.createElement("div");
    el.className = "section-label-spacer";
    UI.text(el, { variant: "eyebrow", content: text });
    container.appendChild(el);
  }
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
  let sizeModeEl = null;
  if (sizeModes) {
    groupLabel("SIZE");
    sizeModeEl = document.createElement("div");
    styleGroup(sizeModeEl);
  }

  const widthEl = document.createElement("label");
  const heightEl = document.createElement("label");
  styleGroup(styleRow([widthEl, heightEl]));

  // ---- controls, built once; render() drives the setters they return --------------------
  let setSizeMode = null;
  if (sizeModes) {
    setSizeMode = UI.buttonGroup(sizeModeEl,
      [{ value: "fit", label: "FIT", span: 3 },
       { value: "fixed", label: "FREE", span: 2 },
       { value: "fill", label: "FILL", span: 3 }],
      preset0.box_width_mode,
      (value) => {
        // One click writes two paired fields, and FILL refits size_px during the preview render
        // — which has to happen BEFORE the save, or the fitted size is not what gets persisted
        // (the same ordering handleBoxResizeEnd() in panel-text.js documents). setPresetField
        // saves before it re-renders the preview and has no paired form, so: write the pair,
        // render the preview so FILL refits, then let one setPresetField call do the save. The
        // re-write of box_width_mode is idempotent. Calling setPresetField twice instead would
        // push two undo entries for one click.
        const preset = target.getPreset();
        preset.box_width_mode = value;
        preset.box_height_mode = value;
        target.rerenderPreview();
        target.setPresetField("box_width_mode", value);
        render();
      });
  }

  const setWidth = UI.numberField(widthEl,
    { label: "WIDTH", unit: "PX", value: preset0.box_width, min: 1, max: 1080, span: 4,
      onChange: (v) => target.setPresetField("box_width", v) });

  const setHeight = UI.numberField(heightEl,
    { label: "HEIGHT", unit: "PX", value: preset0.box_height, min: 1, max: 1920, span: 4,
      onChange: (v) => target.setPresetField("box_height", v) });

  function render() {
    const preset = target.getPreset();
    if (setSizeMode) setSizeMode(preset.box_width_mode);
    // WIDTH/HEIGHT serve both FREE (manual fixed size) and FILL (fixed size that auto-fits the
    // text) — only FIT sizes the box to its content and has no use for them. With sizeModes off
    // there is no FIT to be in, so they always show.
    const sizeFieldsHidden = sizeModes && preset.box_width_mode === "fit";
    widthEl.hidden = sizeFieldsHidden;
    heightEl.hidden = sizeFieldsHidden;
    setWidth(preset.box_width);
    setHeight(preset.box_height);
  }

  render();
  return { render };
};

// Shared Outline style section for the TEXT and CAPTIONS Design tabs: a settings row
// (colour swatch + "Npx") in the panel's main view plus a drill-down subpage holding the
// outline colour and width fields. Both fields are FormatRun-capable, so they write via
// target.setField and display via target.getFieldValue. options.colorField/widthField (defaults
// "outline_color"/"outline_px") let a caller point this at different preset fields — e.g. the
// CAPTIONS Spotlight subpage reuses this file for "spotlight_outline_color"/"spotlight_outline_px".
window.StyleSection = window.StyleSection || {};

window.StyleSection.outline = function outlineSection(container, target, options) {
  const host = options.host;
  const colorField = options.colorField || "outline_color";
  const widthField = options.widthField || "outline_px";

  // Built once, in the factory. render() only ever calls the setValue updater captured below.
  const group = document.createElement("div");
  group.className = "style-group";
  const rowEl = document.createElement("div");
  rowEl.className = "col-8";
  group.appendChild(rowEl);
  container.appendChild(group);

  // getFieldValue, not getPreset()[...]: with a stage text selection active these must show
  // that selection's FormatRun override, not the block's base preset.
  function widthText() { return `${target.getFieldValue(widthField)}px`; }
  function colorValue() { return target.getFieldValue(colorField); }

  // Construction-time value/swatchColor are placeholders, not widthText()/colorValue(): this
  // factory runs once at panel load, before any text block/caption track necessarily exists —
  // target.getFieldValue() throws in that state (style-section-size.js's fix, same reason
  // applies here). render() supplies the real value immediately after, once a block/track
  // exists (each panel's own empty-state guard).
  const setRowValue = UI.settingsRow(rowEl, {
    label: "Outline",
    value: "",
    swatchColor: "",
    onClick: () => page.open(),
  });

  // target.exists() guards the closeAll()-triggered call: closeAll() fires this subpage's
  // onClose even when the panel is about to show its own empty state (e.g. the block was
  // just deleted while this subpage was open) — nothing to refresh in that case.
  function refreshRow() {
    if (!target.exists()) return;
    setRowValue(widthText(), null, colorValue());
  }

  // SubpanelHost rebuilds the body on every open(), so building the fields here — rather
  // than in render() — is what keeps the subpage in step with the current preset.
  const page = host.page("Outline", (bodyEl) => {
    const colorGroup = document.createElement("div");
    colorGroup.className = "style-group";
    const colorField_ = document.createElement("label");
    colorGroup.appendChild(colorField_);

    const widthGroup = document.createElement("div");
    widthGroup.className = "style-group";
    const widthField_ = document.createElement("label");
    widthGroup.appendChild(widthField_);

    bodyEl.append(colorGroup, widthGroup);

    UI.colorSwatch(colorField_, {
      label: "Outline", value: colorValue(), span: 8,
      onChange: (v) => target.setField(colorField, v),
    });

    UI.numberField(widthField_, {
      label: "WIDTH", unit: "PX", value: target.getFieldValue(widthField),
      min: 0, max: 20, span: 8,
      onChange: (v) => target.setField(widthField, v),
    });
  }, { onClose: refreshRow });

  return { render: refreshRow };
};

// Shared Outline style section for the TEXT and CAPTIONS Design tabs: a settings row
// (colour swatch + "Npx") in the panel's main view plus a drill-down subpage holding the
// outline colour and width fields. Both fields are FormatRun-capable, so they write via
// target.setField and display via target.getFieldValue.
window.StyleSection = window.StyleSection || {};

window.StyleSection.outline = function outlineSection(container, target, options) {
  const host = options.host;

  // Built once, in the factory. render() only ever calls the setValue updater captured below.
  const group = document.createElement("div");
  group.className = "style-group";
  const rowEl = document.createElement("div");
  rowEl.className = "col-8";
  group.appendChild(rowEl);
  container.appendChild(group);

  // getFieldValue, not getPreset()[...]: with a stage text selection active these must show
  // that selection's FormatRun override, not the block's base preset.
  function widthText() { return `${target.getFieldValue("outline_px")}px`; }
  function colorValue() { return target.getFieldValue("outline_color"); }

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

  function refreshRow() { setRowValue(widthText(), null, colorValue()); }

  // StylePanelHost rebuilds the body on every open(), so building the fields here — rather
  // than in render() — is what keeps the subpage in step with the current preset.
  const page = host.page("Outline", (bodyEl) => {
    const colorGroup = document.createElement("div");
    colorGroup.className = "style-group";
    const colorField = document.createElement("label");
    colorGroup.appendChild(colorField);

    const widthGroup = document.createElement("div");
    widthGroup.className = "style-group";
    const widthField = document.createElement("label");
    widthGroup.appendChild(widthField);

    bodyEl.append(colorGroup, widthGroup);

    UI.colorSwatch(colorField, {
      label: "Outline", value: colorValue(), span: 8,
      onChange: (v) => target.setField("outline_color", v),
    });

    UI.numberField(widthField, {
      label: "WIDTH", unit: "PX", value: target.getFieldValue("outline_px"),
      min: 0, max: 20, span: 8,
      onChange: (v) => target.setField("outline_px", v),
    });
  }, { onClose: refreshRow });

  return { render: refreshRow };
};

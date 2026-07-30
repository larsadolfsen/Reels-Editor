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

  const group = document.createElement("div");
  group.className = "style-group";
  const rowEl = document.createElement("div");
  rowEl.className = "col-8";
  group.appendChild(rowEl);
  container.appendChild(group);

  function widthText() { return `${target.getFieldValue(widthField)}px`; }
  function colorValue() { return target.getFieldValue(colorField); }

  const setRowValue = UI.settingsRow(rowEl, {
    label: "Outline",
    value: "",
    swatchColor: "",
    onClick: () => page.open(),
  });

  function refreshRow() {
    if (!target.exists()) return;
    setRowValue(widthText(), null, colorValue());
  }

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

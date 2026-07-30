// Shared Color control for the TEXT and CAPTIONS Design tabs: a settings row showing the current
// colour as a swatch + hex, opening a drill-down subpage that holds the colour picker itself.
// Builds its own markup; colour is FormatRun-capable, so it writes through target.setField.
// options.field (default "color") lets a caller point this at a different preset field — e.g.
// the CAPTIONS Spotlight subpage reuses this file for "spotlight_color" instead of a new file.
window.StyleSection = window.StyleSection || {};

window.StyleSection.color = function color(container, target, options) {
  const field = options.field || "color";

  const group = document.createElement("div");
  group.className = "style-group";
  const rowEl = document.createElement("div");
  rowEl.className = "col-8";
  group.appendChild(rowEl);
  container.appendChild(group);

  const page = options.host.page("Color", (body) => {
    const bodyGroup = document.createElement("div");
    bodyGroup.className = "style-group";
    const swatchEl = document.createElement("label");
    bodyGroup.appendChild(swatchEl);
    body.appendChild(bodyGroup);

    UI.colorSwatch(swatchEl, {
      label: "Color", value: target.getFieldValue(field), span: 8,
      onChange: (v) => {
        target.setField(field, v);
        setRowValue(v, null, v);
      },
    });
  });

  const setRowValue = UI.settingsRow(rowEl, {
    label: "Color",
    value: "",
    swatchColor: "",
    onClick: () => page.open(),
  });

  return {
    render() {
      const v = target.getFieldValue(field);
      setRowValue(v, null, v);
    },
  };
};

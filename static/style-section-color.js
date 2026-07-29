// Shared Color control for the TEXT and CAPTIONS Design tabs: a settings row showing the current
// colour as a swatch + hex, opening a drill-down subpage that holds the colour picker itself.
// Builds its own markup; colour is FormatRun-capable, so it writes through target.setField.
window.StyleSection = window.StyleSection || {};

// options: { host } — the panel's StylePanelHost, which owns the drill-down subpage.
window.StyleSection.color = function color(container, target, options) {
  const group = document.createElement("div");
  group.className = "style-group";
  const rowEl = document.createElement("div");
  rowEl.className = "col-8";
  group.appendChild(rowEl);
  container.appendChild(group);

  // The host rebuilds a subpage's body on every open(), by design, so the swatch is created
  // here rather than in the factory. That is the host's contract — not a per-render rebuild.
  const page = options.host.page("Color", (body) => {
    const bodyGroup = document.createElement("div");
    bodyGroup.className = "style-group";
    const swatchEl = document.createElement("label");
    bodyGroup.appendChild(swatchEl);
    body.appendChild(bodyGroup);

    UI.colorSwatch(swatchEl, {
      label: "Color", value: target.getFieldValue("color"), span: 8,
      onChange: (v) => {
        target.setField("color", v);   // FormatRun-capable
        // Keep the row behind the subpage in sync; the old code re-ran the whole
        // renderFontStyle() for this one swatch.
        setRowValue(v, null, v);
      },
    });
  });

  // Built ONCE — UI.settingsRow wipes its container, and render() uses the returned setter.
  const setRowValue = UI.settingsRow(rowEl, {
    label: "Color",
    value: target.getFieldValue("color"),
    swatchColor: target.getFieldValue("color"),
    onClick: () => page.open(),
  });

  return {
    render() {
      const v = target.getFieldValue("color");
      setRowValue(v, null, v);
    },
  };
};

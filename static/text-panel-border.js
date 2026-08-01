// TEXT panel Box tab: Border row + drill-down subpanel (on/off toggle + width/radius/color),
// same row+subpanel pattern as text-panel-background.js. There is no box_border boolean —
// box_border_width === 0 IS "no border", so the toggle writes the width (off -> 0, on -> 2 when
// currently 0). Exposes window.TextPanel.renderBorder(). As of 2026-08-01 (subpanel-host
// convergence) the drill-down is registered against the shared `textStyleHost`
// (static/panel-text.js) instead of hand-rolled hidden/hidden toggling over static index.html
// markup — the subpage body is built fresh into a plain div on every open(). The page is
// registered lazily (on first renderBorder() call, not at module load) since this file's
// <script> tag loads before panel-text.js's, which is where `textStyleHost` is defined.
// Reaches into editor.js's globals (currentTextBlock, ensureTextPreset, saveProject, renderTextPreview)
// and panel-text.js's textStyleHost.
window.TextPanel = window.TextPanel || {};

(() => {
  const DEFAULT_BORDER_WIDTH = 2;
  let borderRowSetValue = null;
  let borderPage = null;

  function refreshBorderRow(preset) {
    const on = preset.box_border_width > 0;
    const value = SettingsRowValue.orNone(on, `${preset.box_border_width}px`);
    const swatch = on ? preset.box_border_color : null;

    if (borderRowSetValue) {
      borderRowSetValue(value, null, swatch);
    } else {
      borderRowSetValue = UI.settingsRow(document.getElementById("text-box-border-row"), {
        label: "Border", value, swatchColor: swatch,
        onClick: () => borderPage.open(),
      });
    }
  }

  // SubpanelHost rebuilds bodyEl fresh on every open(), so building the fields here — rather
  // than once at module load — keeps the subpage in step with the current preset/block.
  function ensureBorderPage() {
    if (borderPage) return borderPage;

    borderPage = textStyleHost.page("Border", (bodyEl) => {
      const preset = ensureTextPreset(currentTextBlock().preset_id);
      const on = preset.box_border_width > 0;

      const toggleGroup = document.createElement("div");
      toggleGroup.className = "style-group";
      const toggleMount = document.createElement("div");
      toggleGroup.appendChild(toggleMount);

      const sizeGroup = document.createElement("div");
      sizeGroup.className = "style-group";
      const sizeRow = document.createElement("div");
      sizeRow.className = "style-row";
      const widthField = document.createElement("label");
      const radiusField = document.createElement("label");
      sizeRow.append(widthField, radiusField);
      sizeGroup.appendChild(sizeRow);

      const colorGroup = document.createElement("div");
      colorGroup.className = "style-group";
      const colorField = document.createElement("label");
      colorGroup.appendChild(colorField);

      bodyEl.append(toggleGroup, sizeGroup, colorGroup);

      widthField.hidden = !on;
      radiusField.hidden = !on;
      colorField.hidden = !on;

      UI.buttonGroup(toggleMount,
        [{ value: "off", label: "OFF", span: 4 }, { value: "on", label: "ON", span: 4 }],
        on ? "on" : "off",
        (v) => {
          if (v === "on") {
            if (preset.box_border_width === 0) preset.box_border_width = DEFAULT_BORDER_WIDTH;
          } else {
            preset.box_border_width = 0;
          }
          saveProject();
          renderTextPreview();
          borderPage.open();
        });

      UI.numberField(widthField,
        { label: "WIDTH", unit: "PX", value: preset.box_border_width, min: 0, max: 40, span: 4,
          onChange: (v) => { preset.box_border_width = v; saveProject(); renderTextPreview(); refreshBorderRow(preset); } });

      UI.numberField(radiusField,
        { label: "RADIUS", unit: "PX", value: preset.box_border_radius, min: 0, max: 200, span: 4,
          onChange: (v) => { preset.box_border_radius = v; saveProject(); renderTextPreview(); } });

      UI.colorSwatch(colorField,
        { label: "Border", value: preset.box_border_color, span: 8,
          onChange: (v) => { preset.box_border_color = v; saveProject(); renderTextPreview(); refreshBorderRow(preset); } });
    }, { onClose: () => {
      // closeAll() (renderTextPanel's reset) can fire this before the empty-state guard runs —
      // e.g. right after the selected block was deleted while this subpage was open.
      const block = currentTextBlock();
      if (block) refreshBorderRow(ensureTextPreset(block.preset_id));
    } });

    return borderPage;
  }

  window.TextPanel.renderBorder = function renderBorder() {
    ensureBorderPage();
    const preset = ensureTextPreset(currentTextBlock().preset_id);
    refreshBorderRow(preset);
  };
})();

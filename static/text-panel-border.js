// TEXT panel Box tab: Border row + drill-down subpanel (on/off toggle + width/radius/color),
// same row+subpanel pattern as text-panel-background.js. There is no box_border boolean —
// box_border_width === 0 IS "no border", so the toggle writes the width (off -> 0, on -> 2 when
// currently 0). Exposes window.TextPanel.renderBorder().
// Reaches into editor.js's globals (currentTextBlock, ensureTextPreset, saveProject, renderTextPreview).
window.TextPanel = window.TextPanel || {};

(() => {
  const DEFAULT_BORDER_WIDTH = 2;
  let borderRowSetValue = null;

  function openBorderPanel() {
    document.getElementById("panel-text-main").hidden = true;
    document.getElementById("panel-text-border").hidden = false;
  }

  function closeBorderPanel() {
    document.getElementById("panel-text-border").hidden = true;
    document.getElementById("panel-text-main").hidden = false;
  }

  UI.subPanelHeader(document.getElementById("text-border-subpanel-header"), { title: "Border", onBack: closeBorderPanel });

  function refreshBorderRow(preset) {
    const on = preset.box_border_width > 0;
    const value = SettingsRowValue.orNone(on, `${preset.box_border_width}px`);
    const swatch = on ? preset.box_border_color : null;

    if (borderRowSetValue) {
      borderRowSetValue(value, null, swatch);
    } else {
      borderRowSetValue = UI.settingsRow(document.getElementById("text-box-border-row"), {
        label: "Border", value, swatchColor: swatch,
        onClick: openBorderPanel,
      });
    }
  }

  window.TextPanel.renderBorder = function renderBorder() {
    const preset = ensureTextPreset(currentTextBlock().preset_id);

    const on = preset.box_border_width > 0;

    refreshBorderRow(preset);

    document.getElementById("text-box-border-width-field").hidden = !on;
    document.getElementById("text-box-border-radius-field").hidden = !on;
    document.getElementById("text-box-border-color-field").hidden = !on;

    UI.buttonGroup(document.getElementById("text-box-border-toggle-group"),
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
        renderBorder();
      });

    UI.numberField(document.getElementById("text-box-border-width-field"),
      { label: "WIDTH", unit: "PX", value: preset.box_border_width, min: 0, max: 40, span: 4,
        onChange: (v) => { preset.box_border_width = v; saveProject(); renderTextPreview(); refreshBorderRow(preset); } });

    UI.numberField(document.getElementById("text-box-border-radius-field"),
      { label: "RADIUS", unit: "PX", value: preset.box_border_radius, min: 0, max: 200, span: 4,
        onChange: (v) => { preset.box_border_radius = v; saveProject(); renderTextPreview(); } });

    UI.colorSwatch(document.getElementById("text-box-border-color-field"),
      { label: "Border", value: preset.box_border_color, span: 8,
        onChange: (v) => { preset.box_border_color = v; saveProject(); renderTextPreview(); renderBorder(); } });
  };
})();

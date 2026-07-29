// CAPTIONS panel Box tab: Border row + drill-down subpanel (on/off toggle + width/radius/color),
// same pattern as text-panel-border.js but against the caption track's preset. box_border_width
// === 0 IS "no border" — there is no box_border boolean. Exposes window.CaptionPanel.renderBorder().
window.CaptionPanel = window.CaptionPanel || {};

(() => {
  const DEFAULT_BORDER_WIDTH = 2;
  let borderRowSetValue = null;

  function openBorderPanel() {
    // Typing in WIDTH only refreshes the row (a full render would destroy the input being
    // typed in — see ui-number-field.js), so the subpanel's toggle/field visibility can be
    // stale by the time it is reopened. Re-render on open, when nothing has focus.
    window.CaptionPanel.renderBorder();
    document.getElementById("panel-captions-main").hidden = true;
    document.getElementById("panel-captions-border").hidden = false;
  }

  function closeBorderPanel() {
    document.getElementById("panel-captions-border").hidden = true;
    document.getElementById("panel-captions-main").hidden = false;
  }

  UI.subPanelHeader(document.getElementById("caption-border-subpanel-header"), { title: "Border", onBack: closeBorderPanel });

  function refreshBorderRow(preset) {
    const on = preset.box_border_width > 0;
    const value = SettingsRowValue.orNone(on, `${preset.box_border_width}px`);
    const swatch = on ? preset.box_border_color : null;

    if (borderRowSetValue) {
      borderRowSetValue(value, null, swatch);
    } else {
      borderRowSetValue = UI.settingsRow(document.getElementById("caption-box-border-row"), {
        label: "Border", value, swatchColor: swatch,
        onClick: openBorderPanel,
      });
    }
  }

  window.CaptionPanel.renderBorder = function renderBorder() {
    const preset = ensureCaptionPreset(ensureCaptionTrack().preset_id);

    const on = preset.box_border_width > 0;

    refreshBorderRow(preset);

    document.getElementById("caption-box-border-width-field").hidden = !on;
    document.getElementById("caption-box-border-radius-field").hidden = !on;
    document.getElementById("caption-box-border-color-field").hidden = !on;

    UI.buttonGroup(document.getElementById("caption-box-border-toggle-group"),
      [{ value: "off", label: "OFF", span: 4 }, { value: "on", label: "ON", span: 4 }],
      on ? "on" : "off",
      (v) => {
        if (v === "on") {
          if (preset.box_border_width === 0) preset.box_border_width = DEFAULT_BORDER_WIDTH;
        } else {
          preset.box_border_width = 0;
        }
        saveProject();
        renderCaptionPreview();
        renderBorder();
      });

    UI.numberField(document.getElementById("caption-box-border-width-field"),
      { label: "WIDTH", unit: "PX", value: preset.box_border_width, min: 0, max: 40, span: 4,
        onChange: (v) => { preset.box_border_width = v; saveProject(); renderCaptionPreview(); refreshBorderRow(preset); } });

    UI.numberField(document.getElementById("caption-box-border-radius-field"),
      { label: "RADIUS", unit: "PX", value: preset.box_border_radius, min: 0, max: 200, span: 4,
        onChange: (v) => { preset.box_border_radius = v; saveProject(); renderCaptionPreview(); } });

    UI.colorSwatch(document.getElementById("caption-box-border-color-field"),
      { label: "Border", value: preset.box_border_color, span: 8,
        onChange: (v) => { preset.box_border_color = v; saveProject(); renderCaptionPreview(); renderBorder(); } });
  };
})();

// TEXT panel Box tab: Background row + drill-down subpanel (on/off toggle + color + opacity),
// same row+subpanel pattern as text-panel-shadow.js. Whole-block preset only — no per-range
// FormatRun override. Exposes window.TextPanel.renderBackground().
// Reaches into editor.js's globals (currentTextBlock, ensureTextPreset, saveProject, renderTextPreview).
window.TextPanel = window.TextPanel || {};

(() => {
  let backgroundRowSetValue = null;

  function openBackgroundPanel() {
    document.getElementById("panel-text-main").hidden = true;
    document.getElementById("panel-text-background").hidden = false;
  }

  function closeBackgroundPanel() {
    document.getElementById("panel-text-background").hidden = true;
    document.getElementById("panel-text-main").hidden = false;
  }

  UI.subPanelHeader(document.getElementById("text-background-subpanel-header"), { title: "Background", onBack: closeBackgroundPanel });

  function refreshBackgroundRow(preset) {
    const value = SettingsRowValue.orNone(preset.box_background, `${preset.box_background_opacity}%`);
    const swatch = preset.box_background ? preset.box_background_color : null;

    if (backgroundRowSetValue) {
      backgroundRowSetValue(value, null, swatch);
    } else {
      backgroundRowSetValue = UI.settingsRow(document.getElementById("text-box-background-row"), {
        label: "Background", value, swatchColor: swatch,
        onClick: openBackgroundPanel,
      });
    }
  }

  window.TextPanel.renderBackground = function renderBackground() {
    const preset = ensureTextPreset(currentTextBlock().preset_id);

    refreshBackgroundRow(preset);

    const fieldsHidden = !preset.box_background;
    document.getElementById("text-box-background-color-field").hidden = fieldsHidden;
    document.getElementById("text-box-background-opacity-field").hidden = fieldsHidden;

    UI.buttonGroup(document.getElementById("text-box-background-toggle-group"),
      [{ value: "off", label: "OFF", span: 4 }, { value: "on", label: "ON", span: 4 }],
      preset.box_background ? "on" : "off",
      (v) => {
        preset.box_background = v === "on";
        saveProject();
        renderTextPreview();
        renderBackground();
      });

    UI.colorSwatch(document.getElementById("text-box-background-color-field"),
      { label: "Background", value: preset.box_background_color, span: 8,
        onChange: (v) => { preset.box_background_color = v; saveProject(); renderTextPreview(); refreshBackgroundRow(preset); } });

    UI.numberField(document.getElementById("text-box-background-opacity-field"),
      { label: "OPACITY", unit: "%", value: preset.box_background_opacity, min: 0, max: 100, span: 8,
        onChange: (v) => { preset.box_background_opacity = v; saveProject(); renderTextPreview(); refreshBackgroundRow(preset); } });
  };
})();

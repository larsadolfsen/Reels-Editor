// CAPTIONS panel Box tab: Background row + drill-down subpanel (on/off toggle + color +
// opacity), same pattern as text-panel-background.js but against the caption track's preset.
// Exposes window.CaptionPanel.renderBackground().
window.CaptionPanel = window.CaptionPanel || {};

(() => {
  let backgroundRowSetValue = null;

  function openBackgroundPanel() {
    document.getElementById("panel-captions-main").hidden = true;
    document.getElementById("panel-captions-background").hidden = false;
  }

  function closeBackgroundPanel() {
    document.getElementById("panel-captions-background").hidden = true;
    document.getElementById("panel-captions-main").hidden = false;
  }

  UI.subPanelHeader(document.getElementById("caption-background-subpanel-header"), { title: "Background", onBack: closeBackgroundPanel });

  function refreshBackgroundRow(preset) {
    const value = SettingsRowValue.orNone(preset.box_background, `${preset.box_background_opacity}%`);
    const swatch = preset.box_background ? preset.box_background_color : null;

    if (backgroundRowSetValue) {
      backgroundRowSetValue(value, null, swatch);
    } else {
      backgroundRowSetValue = UI.settingsRow(document.getElementById("caption-box-background-row"), {
        label: "Background", value, swatchColor: swatch,
        onClick: openBackgroundPanel,
      });
    }
  }

  window.CaptionPanel.renderBackground = function renderBackground() {
    const preset = ensureCaptionPreset(ensureCaptionTrack().preset_id);

    refreshBackgroundRow(preset);

    const fieldsHidden = !preset.box_background;
    document.getElementById("caption-box-background-color-field").hidden = fieldsHidden;
    document.getElementById("caption-box-background-opacity-field").hidden = fieldsHidden;

    UI.buttonGroup(document.getElementById("caption-box-background-toggle-group"),
      [{ value: "off", label: "OFF", span: 4 }, { value: "on", label: "ON", span: 4 }],
      preset.box_background ? "on" : "off",
      (v) => {
        preset.box_background = v === "on";
        saveProject();
        renderCaptionPreview();
        renderBackground();
      });

    UI.colorSwatch(document.getElementById("caption-box-background-color-field"),
      { label: "Background", value: preset.box_background_color, span: 8,
        onChange: (v) => { preset.box_background_color = v; saveProject(); renderCaptionPreview(); renderBackground(); } });

    UI.numberField(document.getElementById("caption-box-background-opacity-field"),
      { label: "OPACITY", unit: "%", value: preset.box_background_opacity, min: 0, max: 100, span: 8,
        onChange: (v) => { preset.box_background_opacity = v; saveProject(); renderCaptionPreview(); refreshBackgroundRow(preset); } });
  };
})();

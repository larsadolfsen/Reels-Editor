// CAPTIONS panel Box tab: Background row + drill-down subpanel (on/off toggle + color +
// opacity), same pattern as text-panel-background.js but against the caption track's preset.
// Exposes window.CaptionPanel.renderBackground(). Drill-down is registered against the shared
// captionStyleHost (panel-captions.js), converged 2026-08-01 (subpanel-host-convergence).
window.CaptionPanel = window.CaptionPanel || {};

(() => {
  let backgroundRowSetValue = null;

  function buildBackgroundBody(bodyEl) {
    const preset = ensureCaptionPreset(ensureCaptionTrack().preset_id);

    const toggleGroup = document.createElement("div");
    const toggleWrap = document.createElement("div");
    toggleWrap.className = "style-group";
    toggleWrap.appendChild(toggleGroup);
    bodyEl.appendChild(toggleWrap);

    const colorField = document.createElement("label");
    const colorWrap = document.createElement("div");
    colorWrap.className = "style-group";
    colorWrap.appendChild(colorField);
    bodyEl.appendChild(colorWrap);

    const opacityField = document.createElement("label");
    const opacityWrap = document.createElement("div");
    opacityWrap.className = "style-group";
    opacityWrap.appendChild(opacityField);
    bodyEl.appendChild(opacityWrap);

    function syncFields() {
      colorField.hidden = !preset.box_background;
      opacityField.hidden = !preset.box_background;
    }

    UI.buttonGroup(toggleGroup,
      [{ value: "off", label: "OFF", span: 4 }, { value: "on", label: "ON", span: 4 }],
      preset.box_background ? "on" : "off",
      (v) => {
        preset.box_background = v === "on";
        saveProject();
        renderCaptionPreview();
        syncFields();
        refreshBackgroundRow(preset);
      });

    UI.colorSwatch(colorField,
      { label: "Background", value: preset.box_background_color, span: 8,
        onChange: (v) => { preset.box_background_color = v; saveProject(); renderCaptionPreview(); refreshBackgroundRow(preset); } });

    UI.numberField(opacityField,
      { label: "OPACITY", unit: "%", value: preset.box_background_opacity, min: 0, max: 100, span: 8,
        onChange: (v) => { preset.box_background_opacity = v; saveProject(); renderCaptionPreview(); refreshBackgroundRow(preset); } });

    syncFields();
  }

  // captionStyleHost (panel-captions.js) isn't defined yet when this script tag runs (it loads
  // before panel-captions.js) — so the page is registered lazily, on first open, rather than at
  // module-load time the way an already-converged style-section-*.js file (loaded after its
  // panel's own script) can afford to.
  let backgroundPage = null;
  function getBackgroundPage() {
    if (!backgroundPage) backgroundPage = captionStyleHost.page("Background", buildBackgroundBody);
    return backgroundPage;
  }

  function refreshBackgroundRow(preset) {
    const value = SettingsRowValue.orNone(preset.box_background, `${preset.box_background_opacity}%`);
    const swatch = preset.box_background ? preset.box_background_color : null;

    if (backgroundRowSetValue) {
      backgroundRowSetValue(value, null, swatch);
    } else {
      backgroundRowSetValue = UI.settingsRow(document.getElementById("caption-box-background-row"), {
        label: "Background", value, swatchColor: swatch,
        onClick: () => getBackgroundPage().open(),
      });
    }
  }

  window.CaptionPanel.renderBackground = function renderBackground() {
    const preset = ensureCaptionPreset(ensureCaptionTrack().preset_id);

    refreshBackgroundRow(preset);
  };
})();

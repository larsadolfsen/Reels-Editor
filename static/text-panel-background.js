// TEXT panel Box tab: Background row + drill-down subpanel (on/off toggle + color + opacity),
// same row+subpanel pattern as text-panel-shadow.js used to. Whole-block preset only — no
// per-range FormatRun override. Exposes window.TextPanel.renderBackground().
// Reaches into editor.js's globals (currentTextBlock, ensureTextPreset, saveProject,
// renderTextPreview) and panel-text.js's textStyleHost (a top-level const visible across
// <script> tags on the same page — this file's own <script> tag loads after panel-text.js's
// in index.html so textStyleHost already exists by the time this module body runs).
window.TextPanel = window.TextPanel || {};

(() => {
  let backgroundRowSetValue = null;

  function isOn() { return !!ensureTextPreset(currentTextBlock().preset_id).box_background; }

  function refreshBackgroundRow(preset) {
    const value = SettingsRowValue.orNone(preset.box_background, `${preset.box_background_opacity}%`);
    const swatch = preset.box_background ? preset.box_background_color : null;

    if (backgroundRowSetValue) {
      backgroundRowSetValue(value, null, swatch);
    } else {
      backgroundRowSetValue = UI.settingsRow(document.getElementById("text-box-background-row"), {
        label: "Background", value, swatchColor: swatch,
        onClick: () => backgroundPage.open(),
      });
    }
  }

  const backgroundPage = textStyleHost.page("Background", (bodyEl) => {
    const preset = ensureTextPreset(currentTextBlock().preset_id);

    const toggleGroup = document.createElement("div");
    toggleGroup.className = "style-group";
    const toggleEl = document.createElement("div");
    toggleGroup.appendChild(toggleEl);

    const colorGroup = document.createElement("div");
    colorGroup.className = "style-group";
    const colorField = document.createElement("label");
    colorGroup.appendChild(colorField);

    const opacityGroup = document.createElement("div");
    opacityGroup.className = "style-group";
    const opacityField = document.createElement("label");
    opacityGroup.appendChild(opacityField);

    bodyEl.append(toggleGroup, colorGroup, opacityGroup);

    function syncFields() {
      const hidden = !isOn();
      colorField.hidden = hidden;
      opacityField.hidden = hidden;
    }

    UI.buttonGroup(toggleEl,
      [{ value: "off", label: "OFF", span: 4 }, { value: "on", label: "ON", span: 4 }],
      preset.box_background ? "on" : "off",
      (v) => {
        preset.box_background = v === "on";
        saveProject();
        renderTextPreview();
        syncFields();
        refreshBackgroundRow(preset);
      });

    UI.colorSwatch(colorField,
      { label: "Background", value: preset.box_background_color, span: 8,
        onChange: (v) => { preset.box_background_color = v; saveProject(); renderTextPreview(); refreshBackgroundRow(preset); } });

    UI.numberField(opacityField,
      { label: "OPACITY", unit: "%", value: preset.box_background_opacity, min: 0, max: 100, span: 8,
        onChange: (v) => { preset.box_background_opacity = v; saveProject(); renderTextPreview(); refreshBackgroundRow(preset); } });

    syncFields();
  });

  window.TextPanel.renderBackground = function renderBackground() {
    const preset = ensureTextPreset(currentTextBlock().preset_id);
    refreshBackgroundRow(preset);
  };
})();

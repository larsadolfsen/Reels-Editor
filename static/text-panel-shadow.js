// TEXT panel Design tab: Shadow row + drill-down subpanel (on/off toggle + color/offset-x/
// offset-y/blur), same row+subpanel pattern as text-panel-outline.js. Whole-preset setting —
// no per-range FormatRun override (unlike Outline). Exposes window.TextPanel.renderShadow().
// Reaches into editor.js's globals (currentTextBlock, ensureTextPreset, saveProject, renderTextPreview).
window.TextPanel = window.TextPanel || {};

(() => {
  let shadowRowSetValue = null;

  function openShadowPanel() {
    document.getElementById("panel-text-main").hidden = true;
    document.getElementById("panel-text-shadow").hidden = false;
  }

  function closeShadowPanel() {
    document.getElementById("panel-text-shadow").hidden = true;
    document.getElementById("panel-text-main").hidden = false;
  }

  UI.subPanelHeader(document.getElementById("text-shadow-subpanel-header"), { title: "Shadow", onBack: closeShadowPanel });

  window.TextPanel.renderShadow = function renderShadow() {
    const preset = ensureTextPreset(currentTextBlock().preset_id);

    if (shadowRowSetValue) {
      shadowRowSetValue(preset.shadow ? "ON" : "OFF", null, preset.shadow ? preset.shadow_color : null);
    } else {
      shadowRowSetValue = UI.settingsRow(document.getElementById("text-shadow-row"), {
        label: "Shadow", value: preset.shadow ? "ON" : "OFF", swatchColor: preset.shadow ? preset.shadow_color : null,
        onClick: openShadowPanel,
      });
    }

    const shadowFieldsHidden = !preset.shadow;
    document.getElementById("text-shadow-color-field").hidden = shadowFieldsHidden;
    document.getElementById("text-shadow-offset-x-field").hidden = shadowFieldsHidden;
    document.getElementById("text-shadow-offset-y-field").hidden = shadowFieldsHidden;
    document.getElementById("text-shadow-blur-field").hidden = shadowFieldsHidden;

    UI.buttonGroup(document.getElementById("text-shadow-toggle-group"),
      [{ value: "off", label: "OFF", span: 4 }, { value: "on", label: "ON", span: 4 }],
      preset.shadow ? "on" : "off",
      (value) => {
        preset.shadow = value === "on";
        saveProject();
        renderTextPreview();
        renderShadow();
      });

    UI.colorSwatch(document.getElementById("text-shadow-color-field"),
      { label: "Shadow", value: preset.shadow_color, span: 8,
        onChange: (v) => { preset.shadow_color = v; saveProject(); renderTextPreview(); renderShadow(); } });

    UI.numberField(document.getElementById("text-shadow-offset-x-field"),
      { label: "OFFSET X", unit: "PX", value: preset.shadow_offset_x, min: -40, max: 40, span: 4,
        onChange: (v) => { preset.shadow_offset_x = v; saveProject(); renderTextPreview(); } });

    UI.numberField(document.getElementById("text-shadow-offset-y-field"),
      { label: "OFFSET Y", unit: "PX", value: preset.shadow_offset_y, min: -40, max: 40, span: 4,
        onChange: (v) => { preset.shadow_offset_y = v; saveProject(); renderTextPreview(); } });

    UI.numberField(document.getElementById("text-shadow-blur-field"),
      { label: "BLUR", unit: "PX", value: preset.shadow_blur, min: 0, max: 40, span: 8,
        onChange: (v) => { preset.shadow_blur = v; saveProject(); renderTextPreview(); } });
  };
})();

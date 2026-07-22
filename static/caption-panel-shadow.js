// CAPTIONS panel Design tab: Shadow row + drill-down subpanel (on/off toggle + color/offset-x/
// offset-y/blur), same row+subpanel pattern as caption-panel-outline.js. Pure UI over the
// caption track's TextPreset.shadow* fields. Exposes window.CaptionPanel.renderShadow().
window.CaptionPanel = window.CaptionPanel || {};

(() => {
  let shadowRowSetValue = null;

  function openShadowPanel() {
    document.getElementById("panel-captions-main").hidden = true;
    document.getElementById("panel-captions-shadow").hidden = false;
  }

  function closeShadowPanel() {
    document.getElementById("panel-captions-shadow").hidden = true;
    document.getElementById("panel-captions-main").hidden = false;
  }

  UI.subPanelHeader(document.getElementById("caption-shadow-subpanel-header"), { title: "Shadow", onBack: closeShadowPanel });

  window.CaptionPanel.renderShadow = function renderShadow() {
    const preset = ensureCaptionPreset(ensureCaptionTrack().preset_id);

    if (shadowRowSetValue) {
      shadowRowSetValue(preset.shadow ? "ON" : "OFF", null, preset.shadow ? preset.shadow_color : null);
    } else {
      shadowRowSetValue = UI.settingsRow(document.getElementById("caption-shadow-row"), {
        label: "Shadow", value: preset.shadow ? "ON" : "OFF", swatchColor: preset.shadow ? preset.shadow_color : null,
        onClick: openShadowPanel,
      });
    }

    const shadowFieldsHidden = !preset.shadow;
    document.getElementById("caption-shadow-color-field").hidden = shadowFieldsHidden;
    document.getElementById("caption-shadow-offset-x-field").hidden = shadowFieldsHidden;
    document.getElementById("caption-shadow-offset-y-field").hidden = shadowFieldsHidden;
    document.getElementById("caption-shadow-blur-field").hidden = shadowFieldsHidden;

    UI.buttonGroup(document.getElementById("caption-shadow-toggle-group"),
      [{ value: "off", label: "OFF", span: 4 }, { value: "on", label: "ON", span: 4 }],
      preset.shadow ? "on" : "off",
      (value) => {
        preset.shadow = value === "on";
        saveProject();
        renderCaptionPreview();
        renderShadow();
      });

    UI.colorSwatch(document.getElementById("caption-shadow-color-field"),
      { label: "Shadow", value: preset.shadow_color, span: 8,
        onChange: (v) => { preset.shadow_color = v; saveProject(); renderCaptionPreview(); renderShadow(); } });

    UI.numberField(document.getElementById("caption-shadow-offset-x-field"),
      { label: "OFFSET X", unit: "PX", value: preset.shadow_offset_x, min: -40, max: 40, span: 4,
        onChange: (v) => { preset.shadow_offset_x = v; saveProject(); renderCaptionPreview(); } });

    UI.numberField(document.getElementById("caption-shadow-offset-y-field"),
      { label: "OFFSET Y", unit: "PX", value: preset.shadow_offset_y, min: -40, max: 40, span: 4,
        onChange: (v) => { preset.shadow_offset_y = v; saveProject(); renderCaptionPreview(); } });

    UI.numberField(document.getElementById("caption-shadow-blur-field"),
      { label: "BLUR", unit: "PX", value: preset.shadow_blur, min: 0, max: 40, span: 8,
        onChange: (v) => { preset.shadow_blur = v; saveProject(); renderCaptionPreview(); } });
  };
})();

// CAPTIONS panel Design tab: SIZE/Italic/Underline/Color/Outline controls, whole-track
// caption styling. Exposes window.CaptionPanel.renderFontStyle().
window.CaptionPanel = window.CaptionPanel || {};

(() => {
  function wireToggle(id, prop) {
    const btn = document.getElementById(id);
    btn.addEventListener("click", async () => {
      const preset = ensureCaptionPreset(ensureCaptionTrack().preset_id);
      preset[prop] = !preset[prop];
      btn.setAttribute("aria-pressed", String(preset[prop]));
      await saveProject();
      renderCaptionPreview();
    });
  }
  wireToggle("caption-italic", "italic");
  wireToggle("caption-underline", "underline");

  const FONT_SIZE_PRESETS = [12, 14, 16, 18, 21, 24, 36, 45, 56, 72, 96];

  function stepFontSizePreset(currentSize, direction) {
    if (direction < 0) {
      const lower = FONT_SIZE_PRESETS.filter((p) => p < currentSize);
      return lower.length ? lower[lower.length - 1] : FONT_SIZE_PRESETS[0];
    }
    const higher = FONT_SIZE_PRESETS.filter((p) => p > currentSize);
    return higher.length ? higher[0] : FONT_SIZE_PRESETS[FONT_SIZE_PRESETS.length - 1];
  }

  let currentSizeFieldSetValue = null;

  document.getElementById("caption-size-step-down").addEventListener("click", () => {
    const preset = ensureCaptionPreset(ensureCaptionTrack().preset_id);
    preset.size_px = stepFontSizePreset(preset.size_px, -1);
    saveProject();
    renderCaptionPreview();
    if (currentSizeFieldSetValue) currentSizeFieldSetValue(preset.size_px);
  });

  document.getElementById("caption-size-step-up").addEventListener("click", () => {
    const preset = ensureCaptionPreset(ensureCaptionTrack().preset_id);
    preset.size_px = stepFontSizePreset(preset.size_px, 1);
    saveProject();
    renderCaptionPreview();
    if (currentSizeFieldSetValue) currentSizeFieldSetValue(preset.size_px);
  });

  window.CaptionPanel.renderFontStyle = function renderFontStyle() {
    const preset = ensureCaptionPreset(ensureCaptionTrack().preset_id);
    const sizeFieldDisabled = preset.box_width_mode === "fill";

    document.getElementById("caption-italic").setAttribute("aria-pressed", String(preset.italic));
    document.getElementById("caption-underline").setAttribute("aria-pressed", String(preset.underline));
    document.getElementById("caption-size-step-down").disabled = sizeFieldDisabled;
    document.getElementById("caption-size-step-up").disabled = sizeFieldDisabled;

    currentSizeFieldSetValue = UI.numberField(document.getElementById("caption-size-field"),
      { label: "SIZE", unit: "PX", value: preset.size_px, min: 24, max: 200, disabled: sizeFieldDisabled, span: 6,
        onChange: (v) => { preset.size_px = v; saveProject(); renderCaptionPreview(); } });

    UI.colorSwatch(document.getElementById("caption-color-field"),
      { label: "Color", value: preset.color, span: 8,
        onChange: (v) => { preset.color = v; saveProject(); renderCaptionPreview(); } });

    UI.colorSwatch(document.getElementById("caption-outline-color-field"),
      { label: "Outline", value: preset.outline_color, span: 8,
        onChange: (v) => { preset.outline_color = v; saveProject(); renderCaptionPreview(); } });

    UI.numberField(document.getElementById("caption-outline-px-field"),
      { label: "WIDTH", unit: "PX", value: preset.outline_px, min: 0, max: 20, span: 8,
        onChange: (v) => { preset.outline_px = v; saveProject(); renderCaptionPreview(); } });

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
        window.CaptionPanel.renderFontStyle();
      });

    UI.colorSwatch(document.getElementById("caption-shadow-color-field"),
      { label: "Shadow", value: preset.shadow_color, span: 8,
        onChange: (v) => { preset.shadow_color = v; saveProject(); renderCaptionPreview(); } });

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

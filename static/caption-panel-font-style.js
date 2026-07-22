// CAPTIONS panel Design tab: SIZE/Italic/Underline/Color controls, whole-track
// caption styling (Outline lives in its own caption-panel-outline.js subpage,
// same pattern as font family/weight). Exposes window.CaptionPanel.renderFontStyle().
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

  };
})();

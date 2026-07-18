// TEXT panel FONT accordion: SIZE/Bold/Italic/Underline/Color/Outline controls, whole-block
// text styling. Exposes window.TextPanel.renderFontStyle(). Reaches into editor.js's globals
// (ensureTextBlock, ensureTextPreset, saveProject, renderTextPreview), same pattern as renderBoxPanel().
window.TextPanel = window.TextPanel || {};

(() => {
  function wireTextStyleToggle(id, prop) {
    const btn = document.getElementById(id);
    btn.addEventListener("click", async () => {
      const preset = ensureTextPreset(ensureTextBlock().preset_id);
      preset[prop] = !preset[prop];
      btn.setAttribute("aria-pressed", String(preset[prop]));
      await saveProject();
      renderTextPreview();
    });
  }
  wireTextStyleToggle("text-bold", "bold");
  wireTextStyleToggle("text-italic", "italic");
  wireTextStyleToggle("text-underline", "underline");

  const FONT_SIZE_PRESETS = [12, 14, 16, 18, 21, 24, 36, 45, 56];

  function stepFontSizePreset(currentSize, direction) {
    // direction: -1 = down, +1 = up. Snaps to the nearest preset in that
    // direction first if currentSize isn't exactly on the scale, then clamps
    // at the ends instead of wrapping or going out of range.
    if (direction < 0) {
      const lower = FONT_SIZE_PRESETS.filter((p) => p < currentSize);
      return lower.length ? lower[lower.length - 1] : FONT_SIZE_PRESETS[0];
    }
    const higher = FONT_SIZE_PRESETS.filter((p) => p > currentSize);
    return higher.length ? higher[0] : FONT_SIZE_PRESETS[FONT_SIZE_PRESETS.length - 1];
  }

  let currentSizeFieldSetValue = null;

  document.getElementById("text-size-step-down").addEventListener("click", () => {
    const preset = ensureTextPreset(ensureTextBlock().preset_id);
    preset.size_px = stepFontSizePreset(preset.size_px, -1);
    saveProject();
    renderTextPreview();
    if (currentSizeFieldSetValue) currentSizeFieldSetValue(preset.size_px);
  });

  document.getElementById("text-size-step-up").addEventListener("click", () => {
    const preset = ensureTextPreset(ensureTextBlock().preset_id);
    preset.size_px = stepFontSizePreset(preset.size_px, 1);
    saveProject();
    renderTextPreview();
    if (currentSizeFieldSetValue) currentSizeFieldSetValue(preset.size_px);
  });

  window.TextPanel.renderFontStyle = function renderFontStyle() {
    const preset = ensureTextPreset(ensureTextBlock().preset_id);

    document.getElementById("text-bold").setAttribute("aria-pressed", String(preset.bold));
    document.getElementById("text-italic").setAttribute("aria-pressed", String(preset.italic));
    document.getElementById("text-underline").setAttribute("aria-pressed", String(preset.underline));

    currentSizeFieldSetValue = UI.numberField(document.getElementById("text-size-field"),
      { label: "SIZE", unit: "PX", value: preset.size_px, min: 24, max: 200,
        onChange: (v) => { preset.size_px = v; saveProject(); renderTextPreview(); } });

    UI.colorSwatch(document.getElementById("text-color-field"),
      { label: "Color", value: preset.color,
        onChange: (v) => { preset.color = v; saveProject(); renderTextPreview(); } });

    UI.colorSwatch(document.getElementById("text-outline-color-field"),
      { label: "Outline", value: preset.outline_color,
        onChange: (v) => { preset.outline_color = v; saveProject(); renderTextPreview(); } });

    UI.numberField(document.getElementById("text-outline-px-field"),
      { label: "WIDTH", unit: "PX", value: preset.outline_px, min: 0, max: 20,
        onChange: (v) => { preset.outline_px = v; saveProject(); renderTextPreview(); } });
  };
})();

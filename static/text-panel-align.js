// TEXT panel POSITION accordion: TEXT ALIGN button group. Exposes window.TextPanel.renderAlign().
window.TextPanel = window.TextPanel || {};

window.TextPanel.renderAlign = function renderAlign() {
  const preset = ensureTextPreset(ensureTextBlock().preset_id);

  UI.buttonGroup(document.getElementById("text-align-group"),
    [{ value: "left", label: "LEFT" }, { value: "center", label: "CENTER" }, { value: "right", label: "RIGHT" }],
    preset.align, (value) => { preset.align = value; saveProject(); renderTextPreview(); });
};

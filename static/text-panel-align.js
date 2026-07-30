// TEXT panel Box tab: TEXT ALIGN button group. Exposes window.TextPanel.renderAlign().
window.TextPanel = window.TextPanel || {};

window.TextPanel.renderAlign = function renderAlign() {
  const preset = ensureTextPreset(currentTextBlock().preset_id);

  UI.buttonGroup(document.getElementById("text-align-group"),
    [
      {
        value: "left", label: "LEFT", span: 1,
        icon: UI.icon("align-left", { size: 16 }),
      },
      {
        value: "center", label: "CENTER", span: 1,
        icon: UI.icon("align-center", { size: 16 }),
      },
      {
        value: "right", label: "RIGHT", span: 1,
        icon: UI.icon("align-right", { size: 16 }),
      },
    ],
    preset.align, (value) => { preset.align = value; saveProject(); renderTextPreview(); });
};

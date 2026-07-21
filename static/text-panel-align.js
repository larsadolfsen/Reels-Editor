// TEXT panel POSITION accordion: TEXT ALIGN button group. Exposes window.TextPanel.renderAlign().
window.TextPanel = window.TextPanel || {};

window.TextPanel.renderAlign = function renderAlign() {
  const preset = ensureTextPreset(currentTextBlock().preset_id);

  UI.buttonGroup(document.getElementById("text-align-group"),
    [
      {
        value: "left", label: "LEFT", span: 1,
        icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 5H3" /><path d="M15 12H3" /><path d="M17 19H3" /></svg>',
      },
      {
        value: "center", label: "CENTER", span: 1,
        icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 5H3" /><path d="M17 12H7" /><path d="M19 19H5" /></svg>',
      },
      {
        value: "right", label: "RIGHT", span: 1,
        icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 5H3" /><path d="M21 12H9" /><path d="M21 19H7" /></svg>',
      },
    ],
    preset.align, (value) => { preset.align = value; saveProject(); renderTextPreview(); });
};

// CAPTIONS panel HIGHLIGHT accordion: karaoke mode toggle, highlight color, max words per
// line — captions-only controls with no TEXT-panel equivalent. Exposes
// window.CaptionPanel.renderHighlight().
window.CaptionPanel = window.CaptionPanel || {};

window.CaptionPanel.renderHighlight = function renderHighlight() {
  const preset = ensureCaptionPreset(ensureCaptionTrack().preset_id);

  UI.buttonGroup(document.getElementById("caption-highlight-mode-group"),
    [{ value: "current_word", label: "Current word", span: 4 }, { value: "progressive_fill", label: "Progressive fill", span: 4 }],
    preset.highlight_mode,
    (value) => { preset.highlight_mode = value; saveProject(); renderCaptionPreview(); });

  UI.colorSwatch(document.getElementById("caption-highlight-color-field"),
    { label: "Highlight color", value: preset.highlight_color, span: 8,
      onChange: (v) => { preset.highlight_color = v; saveProject(); renderCaptionPreview(); } });

  UI.numberField(document.getElementById("caption-max-words-field"),
    { label: "MAX WORDS PER LINE", value: preset.max_words_per_line, step: 1, min: 1, max: 12, span: 8,
      onChange: (v) => { preset.max_words_per_line = Math.round(v); saveProject(); renderCaptionPreview(); } });
};

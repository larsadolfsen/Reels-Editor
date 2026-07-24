// CAPTIONS panel Design tab (HIGHLIGHT group): karaoke mode toggle + highlight color —
// captions-only controls with no TEXT-panel equivalent. Word-per-line/line-per-page counts are
// no longer manual (see the Box tab's fixed WIDTH/HEIGHT + app/caption_layout.py's
// paginate_words). Exposes window.CaptionPanel.renderHighlight().
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
};

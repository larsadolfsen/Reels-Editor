// CAPTIONS panel Design tab (HIGHLIGHT group): an always-on MARKER toggle (background color +
// border radius behind all caption text, added 2026-07-25 for parity with TEXT's
// text-panel-highlight.js) plus the karaoke MODE toggle (current word / progressive fill /
// background). MARKER and MODE's "Background" option share the same highlight_color/
// highlight_border_radius fields (rendered once, below both groups) — captions-only controls
// with no TEXT-panel equivalent beyond that field sharing. Word/line counts are automatic via
// the Box tab's fixed WIDTH/HEIGHT + app/caption_layout.py's paginate_words.
// Exposes window.CaptionPanel.renderHighlight().
window.CaptionPanel = window.CaptionPanel || {};

window.CaptionPanel.renderHighlight = function renderHighlight() {
  const preset = ensureCaptionPreset(ensureCaptionTrack().preset_id);

  UI.buttonGroup(document.getElementById("caption-highlight-marker-group"),
    [{ value: "off", label: "OFF", span: 4 }, { value: "on", label: "ON", span: 4 }],
    preset.highlight ? "on" : "off",
    (value) => { preset.highlight = value === "on"; saveProject(); renderCaptionPreview(); renderHighlight(); });

  UI.buttonGroup(document.getElementById("caption-highlight-mode-group"),
    [{ value: "current_word", label: "Current word", span: 4 },
     { value: "progressive_fill", label: "Progressive fill", span: 4 },
     { value: "background", label: "Background", span: 8 }],
    preset.highlight_mode,
    (value) => { preset.highlight_mode = value; saveProject(); renderCaptionPreview(); renderHighlight(); });

  UI.colorSwatch(document.getElementById("caption-highlight-color-field"),
    { label: "Highlight color", value: preset.highlight_color, span: 8,
      onChange: (v) => { preset.highlight_color = v; saveProject(); renderCaptionPreview(); } });

  document.getElementById("caption-highlight-border-radius-field").hidden =
    preset.highlight_mode !== "background" && !preset.highlight;

  UI.numberField(document.getElementById("caption-highlight-border-radius-field"),
    { label: "RADIUS", unit: "PX", value: preset.highlight_border_radius, min: 0, max: 40, span: 8,
      onChange: (v) => { preset.highlight_border_radius = v; saveProject(); renderCaptionPreview(); } });
};

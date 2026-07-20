// TEXT panel TIME accordion: block start/end seconds. Exposes window.TextPanel.renderTime().
window.TextPanel = window.TextPanel || {};

window.TextPanel.renderTime = function renderTime() {
  const block = ensureTextBlock();

  UI.numberField(document.getElementById("text-start-field"),
    { label: "START", unit: "SEC", value: block.start, step: 0.1, decimals: 1, span: 4,
      onChange: (v) => { block.start = v; saveProject(); renderTextPreview(); } });

  UI.numberField(document.getElementById("text-end-field"),
    { label: "END", unit: "SEC", value: block.end, step: 0.1, decimals: 1, span: 4,
      onChange: (v) => { block.end = v; saveProject(); renderTextPreview(); } });
};

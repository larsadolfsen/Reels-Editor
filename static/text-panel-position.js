// TEXT panel Box tab: absolute HORIZONTAL/VERTICAL pixel fields (TextPreset.x/y) +
// a stateless 3x3 anchor-grid shortcut. Exposes window.TextPanel.renderPosition(). Reaches into
// editor.js's globals (currentTextBlock, ensureTextPreset, saveProject, renderTextPreview,
// renderTextPanel, anchorPositionX, anchorPositionY, Preview.getTextBoxSize).
window.TextPanel = window.TextPanel || {};

window.TextPanel.renderPosition = function renderPosition() {
  const block = currentTextBlock();
  const preset = ensureTextPreset(block.preset_id);

  UI.numberField(document.getElementById("text-offset-x-field"),
    { label: "HORIZONTAL", unit: "PX", value: preset.x, step: 1, min: 1, max: 1080, span: 4,
      onChange: (v) => { preset.x = Math.round(v); saveProject(); renderTextPreview(); } });

  UI.numberField(document.getElementById("text-offset-y-field"),
    { label: "VERTICAL", unit: "PX", value: preset.y, step: 1, min: 1, max: 1920, span: 4,
      onChange: (v) => { preset.y = Math.round(v); saveProject(); renderTextPreview(); } });

  // Stateless shortcut — no persisted anchor selection, so no button stays "active"; clicking
  // a cell just writes a computed absolute pixel value straight into x/y and re-renders the
  // panel so the HORIZONTAL/VERTICAL fields above reflect the new value.
  UI.buttonGroup(document.getElementById("position-row-group"),
    [{ value: "top", label: "TOP", span: 3 }, { value: "mid", label: "MID", span: 2 }, { value: "btm", label: "BTM", span: 3 }],
    null, (value) => {
      const size = Preview.getTextBoxSize(block.id);
      preset.y = Math.round(anchorPositionY(value, size && size.height));
      saveProject(); renderTextPanel();
    });

  UI.buttonGroup(document.getElementById("position-col-group"),
    [{ value: "left", label: "LEFT", span: 3 }, { value: "mid", label: "MID", span: 2 }, { value: "right", label: "RIGHT", span: 3 }],
    null, (value) => {
      const size = Preview.getTextBoxSize(block.id);
      preset.x = Math.round(anchorPositionX(value, size && size.width, preset.align));
      saveProject(); renderTextPanel();
    });
};

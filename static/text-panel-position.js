// TEXT panel POSITION accordion: absolute HORIZONTAL/VERTICAL pixel fields (TextPreset.x/y) +
// a stateless 3x3 anchor-grid shortcut. Exposes window.TextPanel.renderPosition(). Reaches into
// editor.js's globals (ensureTextBlock, ensureTextPreset, saveProject, renderTextPreview,
// renderTextPanel, POSITION_ANCHORS_X, POSITION_ANCHORS_Y).
window.TextPanel = window.TextPanel || {};

window.TextPanel.renderPosition = function renderPosition() {
  const preset = ensureTextPreset(ensureTextBlock().preset_id);

  UI.numberField(document.getElementById("text-offset-x-field"),
    { label: "HORIZONTAL", unit: "PX", value: preset.x, step: 1, min: 1, max: 1080,
      onChange: (v) => { preset.x = Math.round(v); saveProject(); renderTextPreview(); } });

  UI.numberField(document.getElementById("text-offset-y-field"),
    { label: "VERTICAL", unit: "PX", value: preset.y, step: 1, min: 1, max: 1920,
      onChange: (v) => { preset.y = Math.round(v); saveProject(); renderTextPreview(); } });

  // Stateless shortcut — no persisted anchor selection, so no button stays "active"; clicking
  // a cell just writes a computed absolute pixel value straight into x/y and re-renders the
  // panel so the HORIZONTAL/VERTICAL fields above reflect the new value.
  UI.buttonGroup(document.getElementById("position-row-group"),
    [{ value: "top", label: "TOP" }, { value: "mid", label: "MID" }, { value: "btm", label: "BTM" }],
    null, (value) => { preset.y = POSITION_ANCHORS_Y[value]; saveProject(); renderTextPanel(); });

  UI.buttonGroup(document.getElementById("position-col-group"),
    [{ value: "left", label: "LEFT" }, { value: "mid", label: "MID" }, { value: "right", label: "RIGHT" }],
    null, (value) => { preset.x = POSITION_ANCHORS_X[value]; saveProject(); renderTextPanel(); });
};

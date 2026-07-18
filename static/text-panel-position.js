// TEXT panel POSITION accordion: anchor grid (row/col thirds of the canvas) + pixel offset.
// Exposes window.TextPanel.renderPosition(). Reaches into editor.js's globals (ensureTextBlock,
// ensureTextPreset, saveProject, renderTextPreview, computeXY).
window.TextPanel = window.TextPanel || {};

window.TextPanel.renderPosition = function renderPosition() {
  const preset = ensureTextPreset(ensureTextBlock().preset_id);

  UI.numberField(document.getElementById("text-offset-x-field"),
    { label: "OFFSET H", unit: "PX", value: preset.offset_x, step: 1,
      onChange: (v) => { preset.offset_x = v; computeXY(preset); saveProject(); renderTextPreview(); } });

  UI.numberField(document.getElementById("text-offset-y-field"),
    { label: "OFFSET V", unit: "PX", value: preset.offset_y, step: 1,
      onChange: (v) => { preset.offset_y = v; computeXY(preset); saveProject(); renderTextPreview(); } });

  UI.buttonGroup(document.getElementById("position-row-group"),
    [{ value: "top", label: "TOP" }, { value: "mid", label: "MID" }, { value: "btm", label: "BTM" }],
    preset.pos_row, (value) => { preset.pos_row = value; computeXY(preset); saveProject(); renderTextPreview(); });

  UI.buttonGroup(document.getElementById("position-col-group"),
    [{ value: "left", label: "LEFT" }, { value: "mid", label: "MID" }, { value: "right", label: "RIGHT" }],
    preset.pos_col, (value) => { preset.pos_col = value; computeXY(preset); saveProject(); renderTextPreview(); });
};

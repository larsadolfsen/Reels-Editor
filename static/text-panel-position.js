// TEXT panel Box tab: absolute HORIZONTAL/VERTICAL pixel fields (TextPreset.x/y) +
// a stateless single-row icon anchor shortcut. Exposes window.TextPanel.renderPosition(). Reaches into
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
  // an icon just writes a computed absolute pixel value straight into x/y and re-renders the
  // panel so the HORIZONTAL/VERTICAL fields above reflect the new value. The vertical anchors
  // (top/mid-v/btm) and horizontal ones (left/mid-h/right) share one row, so the two centering
  // buttons need distinct values; each maps back to the plain "mid" the anchor helpers expect.
  UI.buttonGroup(document.getElementById("position-group"),
    [
      {
        value: "top", label: "TOP", span: 1,
        icon: UI.icon("arrow-up-to-line", { size: 16 }),
      },
      {
        value: "mid-h", label: "MID HORIZONTAL", span: 1,
        icon: UI.icon("align-horizontal-justify-center", { size: 16 }),
      },
      {
        value: "btm", label: "BTM", span: 1,
        icon: UI.icon("arrow-down-to-line", { size: 16 }),
      },
      {
        value: "left", label: "LEFT", span: 1,
        icon: UI.icon("arrow-left-to-line", { size: 16 }),
      },
      {
        value: "mid-v", label: "MID VERTICAL", span: 1,
        icon: UI.icon("align-vertical-justify-center", { size: 16 }),
      },
      {
        value: "right", label: "RIGHT", span: 1,
        icon: UI.icon("arrow-right-to-line", { size: 16 }),
      },
    ],
    null, (value) => {
      const size = Preview.getTextBoxSize(block.id);
      if (value === "top" || value === "mid-v" || value === "btm") {
        preset.y = Math.round(anchorPositionY(value === "mid-v" ? "mid" : value, size && size.height));
      } else {
        preset.x = Math.round(anchorPositionX(value === "mid-h" ? "mid" : value, size && size.width, preset.align));
      }
      saveProject(); renderTextPanel();
    });
};

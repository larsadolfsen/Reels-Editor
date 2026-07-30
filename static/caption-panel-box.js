// CAPTIONS panel Box tab: fixed WIDTH/HEIGHT, TEXT ALIGN and absolute POSITION fields — same
// shape as panel-text.js's renderBoxPanel() + text-panel-align.js + text-panel-position.js
// combined, pointed at the caption track's preset. Background and Border are their own
// row+subpage files (caption-panel-background.js / caption-panel-border.js). The box is always a
// fixed size for captions (word-wrap/pagination adapts to it — see preview-captions.js /
// app/ass_render.py), unlike TEXT blocks which keep FIT/FREE/FILL. The POSITION single-row icon
// anchor shortcut shares
// panel-text.js's anchorPositionX/Y helpers + Preview.getCaptionBoxSize().
window.CaptionPanel = window.CaptionPanel || {};

window.CaptionPanel.renderBox = function renderBox() {
  const preset = ensureCaptionPreset(ensureCaptionTrack().preset_id);

  UI.numberField(document.getElementById("caption-box-width-field"),
    { label: "WIDTH", unit: "PX", value: preset.box_width, min: 1, max: 1080, span: 4,
      onChange: (v) => { preset.box_width = v; renderCaptionPreview(); saveProject(); } });

  UI.numberField(document.getElementById("caption-box-height-field"),
    { label: "HEIGHT", unit: "PX", value: preset.box_height, min: 1, max: 1920, span: 4,
      onChange: (v) => { preset.box_height = v; renderCaptionPreview(); saveProject(); } });

  UI.buttonGroup(document.getElementById("caption-align-group"),
    [
      { value: "left", label: "LEFT", span: 1,
        icon: UI.icon("align-left", { size: 16 }) },
      { value: "center", label: "CENTER", span: 1,
        icon: UI.icon("align-center", { size: 16 }) },
      { value: "right", label: "RIGHT", span: 1,
        icon: UI.icon("align-right", { size: 16 }) },
    ],
    preset.align, (value) => { preset.align = value; saveProject(); renderCaptionPreview(); });

  UI.numberField(document.getElementById("caption-offset-x-field"),
    { label: "HORIZONTAL", unit: "PX", value: preset.x, step: 1, min: 1, max: 1080, span: 4,
      onChange: (v) => { preset.x = Math.round(v); saveProject(); renderCaptionPreview(); } });

  UI.numberField(document.getElementById("caption-offset-y-field"),
    { label: "VERTICAL", unit: "PX", value: preset.y, step: 1, min: 1, max: 1920, span: 4,
      onChange: (v) => { preset.y = Math.round(v); saveProject(); renderCaptionPreview(); } });

  // Stateless one-row icon shortcut — vertical (top/mid-v/btm) and horizontal (left/mid-h/right)
  // anchors share one group, so the two centering buttons need distinct values; each maps back
  // to the plain "mid" the anchor helpers expect. Nothing stays pressed.
  UI.buttonGroup(document.getElementById("caption-position-group"),
    [
      {
        value: "top", label: "TOP", span: 1,
        icon: UI.icon("arrow-up-to-line", { size: 16 }),
      },
      {
        value: "mid-v", label: "MID VERTICAL", span: 1,
        icon: UI.icon("align-center-vertical", { size: 16 }),
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
        value: "mid-h", label: "MID HORIZONTAL", span: 1,
        icon: UI.icon("align-center-horizontal", { size: 16 }),
      },
      {
        value: "right", label: "RIGHT", span: 1,
        icon: UI.icon("arrow-right-to-line", { size: 16 }),
      },
    ],
    null, (value) => {
      const size = Preview.getCaptionBoxSize();
      if (value === "top" || value === "mid-v" || value === "btm") {
        preset.y = Math.round(anchorPositionY(value === "mid-v" ? "mid" : value, size && size.height));
      } else {
        preset.x = Math.round(anchorPositionX(value === "mid-h" ? "mid" : value, size && size.width, preset.align));
      }
      saveProject(); renderCaptionPanel();
    });
};

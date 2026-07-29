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
        icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 5H3" /><path d="M15 12H3" /><path d="M17 19H3" /></svg>' },
      { value: "center", label: "CENTER", span: 1,
        icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 5H3" /><path d="M17 12H7" /><path d="M19 19H5" /></svg>' },
      { value: "right", label: "RIGHT", span: 1,
        icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 5H3" /><path d="M21 12H9" /><path d="M21 19H7" /></svg>' },
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
        icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 3h14" /><path d="m18 13-6-6-6 6" /><path d="M12 7v14" /></svg>',
      },
      {
        value: "mid-v", label: "MID VERTICAL", span: 1,
        icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v20" /><path d="M8 10H4a2 2 0 0 1-2-2V6c0-1.1.9-2 2-2h4" /><path d="M16 10h4a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-4" /><path d="M8 20H7a2 2 0 0 1-2-2v-2c0-1.1.9-2 2-2h1" /><path d="M16 14h1a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2h-1" /></svg>',
      },
      {
        value: "btm", label: "BTM", span: 1,
        icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 17V3" /><path d="m6 11 6 6 6-6" /><path d="M19 21H5" /></svg>',
      },
      {
        value: "left", label: "LEFT", span: 1,
        icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 19V5" /><path d="m13 6-6 6 6 6" /><path d="M21 12H7" /></svg>',
      },
      {
        value: "mid-h", label: "MID HORIZONTAL", span: 1,
        icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12h20" /><path d="M10 16v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-4" /><path d="M10 8V4a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v4" /><path d="M20 16v1a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2v-1" /><path d="M14 8V7c0-1.1.9-2 2-2h2a2 2 0 0 1 2 2v1" /></svg>',
      },
      {
        value: "right", label: "RIGHT", span: 1,
        icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 12H3" /><path d="m11 18 6-6-6-6" /><path d="M21 5v14" /></svg>',
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

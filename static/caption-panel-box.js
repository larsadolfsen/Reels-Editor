// CAPTIONS panel Box tab: width/height SIZE mode, background/border, TEXT ALIGN, and
// absolute POSITION fields — same shape as editor.js's renderBoxPanel() + text-panel-align.js
// + text-panel-position.js combined, pointed at the caption track's preset. POSITION anchor grid
// shares panel-text.js's anchorPositionX/Y helpers + Preview.getCaptionBoxSize() (edge-flush
// against the caption block's actual on-stage rendered size).
window.CaptionPanel = window.CaptionPanel || {};

window.CaptionPanel.renderBox = function renderBox() {
  const preset = ensureCaptionPreset(ensureCaptionTrack().preset_id);

  UI.buttonGroup(document.getElementById("caption-box-size-mode-group"),
    [{ value: "fit", label: "FIT", span: 3 }, { value: "fixed", label: "FREE", span: 2 }, { value: "fill", label: "FILL", span: 3 }],
    preset.box_width_mode,
    (value) => {
      preset.box_width_mode = value;
      preset.box_height_mode = value;
      renderCaptionPreview(); saveProject(); CaptionPanel.renderBox();
    });

  const boxSizeFieldsHidden = preset.box_width_mode === "fit";
  document.getElementById("caption-box-width-field").hidden = boxSizeFieldsHidden;
  document.getElementById("caption-box-height-field").hidden = boxSizeFieldsHidden;

  UI.numberField(document.getElementById("caption-box-width-field"),
    { label: "WIDTH", unit: "PX", value: preset.box_width, min: 1, max: 1080, span: 4,
      onChange: (v) => { preset.box_width = v; renderCaptionPreview(); saveProject(); } });

  UI.numberField(document.getElementById("caption-box-height-field"),
    { label: "HEIGHT", unit: "PX", value: preset.box_height, min: 1, max: 1920, span: 4,
      onChange: (v) => { preset.box_height = v; renderCaptionPreview(); saveProject(); } });

  UI.colorSwatch(document.getElementById("caption-box-background-color-field"),
    { label: "Background", showLabel: false, value: preset.box_background_color, span: 1,
      onChange: (v) => { preset.box_background_color = v; preset.box_background = true; saveProject(); renderCaptionPreview(); } });

  UI.numberField(document.getElementById("caption-box-background-opacity-field"),
    { label: "OPACITY", unit: "%", value: preset.box_background_opacity, min: 0, max: 100, span: 7,
      onChange: (v) => { preset.box_background_opacity = v; saveProject(); renderCaptionPreview(); } });

  UI.numberField(document.getElementById("caption-box-border-width-field"),
    { label: "BORDER", unit: "PX", value: preset.box_border_width, min: 0, max: 40, span: 4,
      onChange: (v) => { preset.box_border_width = v; saveProject(); renderCaptionPreview(); } });

  UI.numberField(document.getElementById("caption-box-border-radius-field"),
    { label: "RADIUS", unit: "PX", value: preset.box_border_radius, min: 0, max: 200, span: 3,
      onChange: (v) => { preset.box_border_radius = v; saveProject(); renderCaptionPreview(); } });

  UI.colorSwatch(document.getElementById("caption-box-border-color-field"),
    { label: "Border Color", showLabel: false, value: preset.box_border_color, span: 1,
      onChange: (v) => { preset.box_border_color = v; saveProject(); renderCaptionPreview(); } });

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

  UI.buttonGroup(document.getElementById("caption-position-row-group"),
    [{ value: "top", label: "TOP", span: 3 }, { value: "mid", label: "MID", span: 2 }, { value: "btm", label: "BTM", span: 3 }],
    null, (value) => {
      const size = Preview.getCaptionBoxSize();
      preset.y = Math.round(anchorPositionY(value, size && size.height));
      saveProject(); renderCaptionPanel();
    });

  UI.buttonGroup(document.getElementById("caption-position-col-group"),
    [{ value: "left", label: "LEFT", span: 3 }, { value: "mid", label: "MID", span: 2 }, { value: "right", label: "RIGHT", span: 3 }],
    null, (value) => {
      const size = Preview.getCaptionBoxSize();
      preset.x = Math.round(anchorPositionX(value, size && size.width, preset.align));
      saveProject(); renderCaptionPanel();
    });
};

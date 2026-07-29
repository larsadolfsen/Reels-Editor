// CAPTIONS panel Design tab: Outline row + drill-down subpanel (on/off toggle + color + width),
// same pattern as caption-panel-border.js. There is no outline boolean — outline_px === 0 IS "no
// outline", so the toggle writes the width (off -> 0, on -> DEFAULT_OUTLINE_WIDTH when currently
// 0), same convention as Border. Pure UI over the caption track's TextPreset.outline_color/
// outline_px. Exposes window.CaptionPanel.renderOutline().
window.CaptionPanel = window.CaptionPanel || {};

(() => {
  const DEFAULT_OUTLINE_WIDTH = 4;
  let outlineRowSetValue = null;

  function openOutlinePanel() {
    document.getElementById("panel-captions-main").hidden = true;
    document.getElementById("panel-captions-outline").hidden = false;
  }

  function closeOutlinePanel() {
    document.getElementById("panel-captions-outline").hidden = true;
    document.getElementById("panel-captions-main").hidden = false;
  }

  UI.subPanelHeader(document.getElementById("caption-outline-subpanel-header"), { title: "Outline", onBack: closeOutlinePanel });

  function refreshOutlineRow(preset) {
    const outlineOn = preset.outline_px > 0;
    const outlineValue = SettingsRowValue.orNone(outlineOn, `${preset.outline_px}px`);
    const outlineSwatch = outlineOn ? preset.outline_color : null;

    if (outlineRowSetValue) {
      outlineRowSetValue(outlineValue, null, outlineSwatch);
    } else {
      outlineRowSetValue = UI.settingsRow(document.getElementById("caption-outline-row"), {
        label: "Outline", value: outlineValue, swatchColor: outlineSwatch,
        onClick: openOutlinePanel,
      });
    }
  }

  window.CaptionPanel.renderOutline = function renderOutline() {
    const preset = ensureCaptionPreset(ensureCaptionTrack().preset_id);
    const on = preset.outline_px > 0;

    refreshOutlineRow(preset);

    document.getElementById("caption-outline-color-field").hidden = !on;
    document.getElementById("caption-outline-px-field").hidden = !on;

    UI.buttonGroup(document.getElementById("caption-outline-toggle-group"),
      [{ value: "off", label: "OFF", span: 4 }, { value: "on", label: "ON", span: 4 }],
      on ? "on" : "off",
      (v) => {
        if (v === "on") {
          if (preset.outline_px === 0) preset.outline_px = DEFAULT_OUTLINE_WIDTH;
        } else {
          preset.outline_px = 0;
        }
        saveProject();
        renderCaptionPreview();
        window.CaptionPanel.renderOutline();
      });

    UI.colorSwatch(document.getElementById("caption-outline-color-field"),
      { label: "Outline", value: preset.outline_color, span: 8,
        onChange: (v) => { preset.outline_color = v; saveProject(); renderCaptionPreview(); refreshOutlineRow(preset); } });

    UI.numberField(document.getElementById("caption-outline-px-field"),
      { label: "WIDTH", unit: "PX", value: preset.outline_px, min: 0, max: 20, span: 8,
        onChange: (v) => { preset.outline_px = v; saveProject(); renderCaptionPreview(); refreshOutlineRow(preset); } });
  };
})();

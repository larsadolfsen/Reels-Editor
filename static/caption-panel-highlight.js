// CAPTIONS panel Design tab: Highlight row + drill-down subpanel (MARKER on/off, karaoke MODE,
// highlight color + border radius), same row+subpanel pattern as caption-panel-shadow.js.
// Captions-only — TEXT's highlight is its own text-panel-highlight.js. The row is never "None":
// a karaoke mode is always set, so the row shows the mode label and the MARKER toggle does not
// drive it. MARKER and MODE's "Background" option share highlight_color/highlight_border_radius.
// Exposes window.CaptionPanel.renderHighlight().
window.CaptionPanel = window.CaptionPanel || {};

(() => {
  const MODES = [
    { value: "current_word", label: "Current word", span: 4 },
    { value: "progressive_fill", label: "Progressive fill", span: 4 },
    { value: "background", label: "Background", span: 8 },
  ];

  let highlightRowSetValue = null;

  function modeLabel(mode) {
    const found = MODES.find((m) => m.value === mode);
    return found ? found.label : MODES[0].label;
  }

  function openHighlightPanel() {
    document.getElementById("panel-captions-main").hidden = true;
    document.getElementById("panel-captions-highlight").hidden = false;
  }

  function closeHighlightPanel() {
    document.getElementById("panel-captions-highlight").hidden = true;
    document.getElementById("panel-captions-main").hidden = false;
  }

  UI.subPanelHeader(document.getElementById("caption-highlight-subpanel-header"), { title: "Highlight", onBack: closeHighlightPanel });

  function refreshHighlightRow(preset) {
    const value = modeLabel(preset.highlight_mode);
    if (highlightRowSetValue) {
      highlightRowSetValue(value, null, preset.highlight_color);
    } else {
      highlightRowSetValue = UI.settingsRow(document.getElementById("caption-highlight-row"), {
        label: "Highlight", value, swatchColor: preset.highlight_color,
        onClick: openHighlightPanel,
      });
    }
  }

  window.CaptionPanel.renderHighlight = function renderHighlight() {
    const preset = ensureCaptionPreset(ensureCaptionTrack().preset_id);

    refreshHighlightRow(preset);

    UI.buttonGroup(document.getElementById("caption-highlight-marker-group"),
      [{ value: "off", label: "OFF", span: 4 }, { value: "on", label: "ON", span: 4 }],
      preset.highlight ? "on" : "off",
      (v) => { preset.highlight = v === "on"; saveProject(); renderCaptionPreview(); renderHighlight(); });

    UI.buttonGroup(document.getElementById("caption-highlight-mode-group"), MODES,
      preset.highlight_mode,
      (v) => { preset.highlight_mode = v; saveProject(); renderCaptionPreview(); renderHighlight(); });

    UI.colorSwatch(document.getElementById("caption-highlight-color-field"),
      { label: "Highlight color", value: preset.highlight_color, span: 8,
        onChange: (v) => { preset.highlight_color = v; saveProject(); renderCaptionPreview(); renderHighlight(); } });

    document.getElementById("caption-highlight-border-radius-field").hidden =
      preset.highlight_mode !== "background" && !preset.highlight;

    UI.numberField(document.getElementById("caption-highlight-border-radius-field"),
      { label: "RADIUS", unit: "PX", value: preset.highlight_border_radius, min: 0, max: 40, span: 8,
        onChange: (v) => { preset.highlight_border_radius = v; saveProject(); renderCaptionPreview(); } });
  };
})();

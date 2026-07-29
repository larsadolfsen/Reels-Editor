// TEXT panel Design tab: Highlight row + drill-down subpanel (on/off toggle + color + border
// radius), same row+subpanel pattern as text-panel-shadow.js. Whole-preset setting only — no
// per-range FormatRun override. Exposes window.TextPanel.renderHighlight().
// Reaches into editor.js's globals (currentTextBlock, ensureTextPreset, saveProject, renderTextPreview).
window.TextPanel = window.TextPanel || {};

(() => {
  let highlightRowSetValue = null;

  function openHighlightPanel() {
    document.getElementById("panel-text-main").hidden = true;
    document.getElementById("panel-text-highlight").hidden = false;
  }

  function closeHighlightPanel() {
    document.getElementById("panel-text-highlight").hidden = true;
    document.getElementById("panel-text-main").hidden = false;
  }

  UI.subPanelHeader(document.getElementById("text-highlight-subpanel-header"), { title: "Highlight", onBack: closeHighlightPanel });

  window.TextPanel.renderHighlight = function renderHighlight() {
    const preset = ensureTextPreset(currentTextBlock().preset_id);

    if (highlightRowSetValue) {
      highlightRowSetValue(preset.highlight ? "ON" : "OFF", null, preset.highlight ? preset.highlight_color : null);
    } else {
      highlightRowSetValue = UI.settingsRow(document.getElementById("text-highlight-row"), {
        label: "Highlight", value: preset.highlight ? "ON" : "OFF", swatchColor: preset.highlight ? preset.highlight_color : null,
        onClick: openHighlightPanel,
      });
    }

    const highlightFieldsHidden = !preset.highlight;
    document.getElementById("text-highlight-color-field").hidden = highlightFieldsHidden;
    document.getElementById("text-highlight-radius-field").hidden = highlightFieldsHidden;

    UI.buttonGroup(document.getElementById("text-highlight-toggle-group"),
      [{ value: "off", label: "OFF", span: 4 }, { value: "on", label: "ON", span: 4 }],
      preset.highlight ? "on" : "off",
      (value) => {
        preset.highlight = value === "on";
        saveProject();
        renderTextPreview();
        renderHighlight();
      });

    UI.colorSwatch(document.getElementById("text-highlight-color-field"),
      { label: "Highlight", value: preset.highlight_color, span: 8,
        onChange: (v) => { preset.highlight_color = v; saveProject(); renderTextPreview(); renderHighlight(); } });

    UI.numberField(document.getElementById("text-highlight-radius-field"),
      { label: "RADIUS", unit: "PX", value: preset.highlight_border_radius, min: 0, max: 40, span: 8,
        onChange: (v) => { preset.highlight_border_radius = v; saveProject(); renderTextPreview(); } });
  };
})();

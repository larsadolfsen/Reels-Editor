// TEXT panel Design tab: Outline row + drill-down subpanel (on/off toggle + color + width), same
// pattern as text-panel-border.js. There is no outline boolean — outline_px === 0 IS "no
// outline", so the toggle writes the width (off -> 0, on -> DEFAULT_OUTLINE_WIDTH when currently
// 0), same convention as Border. When a stage text selection is active
// (Preview.getActiveFormatSelection()), the color/width fields write/update a per-range
// FormatRun on the block instead of the whole-block base preset (upsertFormatRun); otherwise
// they fall back to the old whole-block behavior. Exposes window.TextPanel.renderOutline().
// Reaches into editor.js's globals (currentTextBlock, ensureTextPreset, saveProject, renderTextPreview),
// same pattern as text-panel-font-style.js.
window.TextPanel = window.TextPanel || {};

(() => {
  const DEFAULT_OUTLINE_WIDTH = 4;
  let outlineRowSetValue = null;

  function openOutlinePanel() {
    document.getElementById("panel-text-main").hidden = true;
    document.getElementById("panel-text-outline").hidden = false;
  }

  function closeOutlinePanel() {
    document.getElementById("panel-text-outline").hidden = true;
    document.getElementById("panel-text-main").hidden = false;
  }

  // Mirrors text-panel-font-style.js's upsertFormatRun: runs never overlap, so an exact-range
  // re-edit updates the existing run in place instead of pushing a duplicate.
  function upsertFormatRun(block, start, end, field, value) {
    block.formatting_runs = block.formatting_runs || [];
    let run = block.formatting_runs.find((r) => r.start === start && r.end === end);
    if (!run) {
      run = { start, end };
      block.formatting_runs.push(run);
    }
    run[field] = value;
  }

  UI.subPanelHeader(document.getElementById("text-outline-subpanel-header"), { title: "Outline", onBack: closeOutlinePanel });

  function refreshOutlineRow(preset) {
    const outlineOn = preset.outline_px > 0;
    const outlineValue = SettingsRowValue.orNone(outlineOn, `${preset.outline_px}px`);
    const outlineSwatch = outlineOn ? preset.outline_color : null;

    if (outlineRowSetValue) {
      outlineRowSetValue(outlineValue, null, outlineSwatch);
    } else {
      outlineRowSetValue = UI.settingsRow(document.getElementById("text-outline-row"), {
        label: "Outline", value: outlineValue, swatchColor: outlineSwatch,
        onClick: openOutlinePanel,
      });
    }
  }

  window.TextPanel.renderOutline = function renderOutline() {
    const preset = ensureTextPreset(currentTextBlock().preset_id);
    const on = preset.outline_px > 0;

    refreshOutlineRow(preset);

    document.getElementById("text-outline-color-field").hidden = !on;
    document.getElementById("text-outline-px-field").hidden = !on;

    UI.buttonGroup(document.getElementById("text-outline-toggle-group"),
      [{ value: "off", label: "OFF", span: 4 }, { value: "on", label: "ON", span: 4 }],
      on ? "on" : "off",
      (v) => {
        if (v === "on") {
          if (preset.outline_px === 0) preset.outline_px = DEFAULT_OUTLINE_WIDTH;
        } else {
          preset.outline_px = 0;
        }
        saveProject();
        renderTextPreview();
        window.TextPanel.renderOutline();
      });

    UI.colorSwatch(document.getElementById("text-outline-color-field"),
      { label: "Outline", value: preset.outline_color, span: 8,
        onChange: (v) => {
          const block = currentTextBlock();
          const sel = Preview.getActiveFormatSelection();
          if (sel && sel.blockId === block.id) {
            upsertFormatRun(block, sel.start, sel.end, "outline_color", v);
          } else {
            preset.outline_color = v;
          }
          saveProject();
          renderTextPreview();
          refreshOutlineRow(preset);
        } });

    UI.numberField(document.getElementById("text-outline-px-field"),
      { label: "WIDTH", unit: "PX", value: preset.outline_px, min: 0, max: 20, span: 8,
        onChange: (v) => {
          const block = currentTextBlock();
          const sel = Preview.getActiveFormatSelection();
          if (sel && sel.blockId === block.id) {
            upsertFormatRun(block, sel.start, sel.end, "outline_px", v);
          } else {
            preset.outline_px = v;
          }
          saveProject();
          renderTextPreview();
          refreshOutlineRow(preset);
        } });
  };
})();

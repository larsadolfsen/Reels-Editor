// TEXT panel Design tab: Outline row + drill-down subpanel (color + width), same pattern as
// text-panel-font-weight.js. When a stage text selection is active
// (Preview.getActiveFormatSelection()), the color/width fields write/update a per-range
// FormatRun on the block instead of the whole-block base preset (upsertFormatRun); otherwise
// they fall back to the old whole-block behavior. Exposes window.TextPanel.renderOutline().
// Reaches into editor.js's globals (currentTextBlock, ensureTextPreset, saveProject, renderTextPreview),
// same pattern as text-panel-font-style.js.
window.TextPanel = window.TextPanel || {};

(() => {
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

  window.TextPanel.renderOutline = function renderOutline() {
    const preset = ensureTextPreset(currentTextBlock().preset_id);

    if (outlineRowSetValue) {
      outlineRowSetValue(`${preset.outline_px}px`, null, preset.outline_color);
    } else {
      outlineRowSetValue = UI.settingsRow(document.getElementById("text-outline-row"), {
        label: "Outline", value: `${preset.outline_px}px`, swatchColor: preset.outline_color,
        onClick: openOutlinePanel,
      });
    }

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
          renderOutline();
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
          renderOutline();
        } });
  };
})();

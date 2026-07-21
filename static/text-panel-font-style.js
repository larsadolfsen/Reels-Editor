// TEXT panel Design tab: SIZE/Bold/Italic/Underline/Color/Outline controls. When a stage text
// selection is active (Preview.getActiveFormatSelection()), each control writes/updates a
// per-range FormatRun on the block instead of the whole-block base preset (upsertFormatRun);
// otherwise it falls back to the old whole-block behavior. Exposes window.TextPanel.renderFontStyle().
// Reaches into editor.js's globals (currentTextBlock, ensureTextPreset, saveProject, renderTextPreview),
// same pattern as renderBoxPanel().
window.TextPanel = window.TextPanel || {};

(() => {
  // Runs never overlap: this splits/merges as needed by first removing any existing run whose
  // range exactly matches [start, end) (the common case: re-editing the same selection), then
  // pushing a fresh run for it. Overlapping-but-not-identical ranges are out of scope for v1 —
  // the UI only ever selects fresh ranges via the browser's native Selection API, so exact-range
  // re-edits are the only overlap case that occurs in practice.
  function upsertFormatRun(block, start, end, field, value) {
    block.formatting_runs = block.formatting_runs || [];
    let run = block.formatting_runs.find((r) => r.start === start && r.end === end);
    if (!run) {
      run = { start, end };
      block.formatting_runs.push(run);
    }
    run[field] = value;
  }

  function wireTextStyleToggle(id, prop) {
    const btn = document.getElementById(id);
    btn.addEventListener("click", async () => {
      const block = currentTextBlock();
      const preset = ensureTextPreset(block.preset_id);
      const sel = Preview.getActiveFormatSelection();
      if (sel && sel.blockId === block.id) {
        // A freshly created block (currentTextBlock()'s plain object literal) has no
        // formatting_runs key at all until upsertFormatRun first populates it, or until the
        // project round-trips through the backend (Pydantic fills in the []  default) — guard
        // the same way upsertFormatRun itself does, or this throws on the very first
        // selection-based toggle.
        block.formatting_runs = block.formatting_runs || [];
        const current = block.formatting_runs.find((r) => r.start === sel.start && r.end === sel.end);
        const currentValue = (current && current[prop] != null) ? current[prop] : preset[prop];
        upsertFormatRun(block, sel.start, sel.end, prop, !currentValue);
      } else {
        preset[prop] = !preset[prop];
        btn.setAttribute("aria-pressed", String(preset[prop]));
      }
      await saveProject();
      renderTextPreview();
    });
  }
  wireTextStyleToggle("text-italic", "italic");
  wireTextStyleToggle("text-underline", "underline");

  const FONT_SIZE_PRESETS = [12, 14, 16, 18, 21, 24, 36, 45, 56];

  function stepFontSizePreset(currentSize, direction) {
    // direction: -1 = down, +1 = up. Snaps to the nearest preset in that
    // direction first if currentSize isn't exactly on the scale, then clamps
    // at the ends instead of wrapping or going out of range.
    if (direction < 0) {
      const lower = FONT_SIZE_PRESETS.filter((p) => p < currentSize);
      return lower.length ? lower[lower.length - 1] : FONT_SIZE_PRESETS[0];
    }
    const higher = FONT_SIZE_PRESETS.filter((p) => p > currentSize);
    return higher.length ? higher[0] : FONT_SIZE_PRESETS[FONT_SIZE_PRESETS.length - 1];
  }

  let currentSizeFieldSetValue = null;

  function stepSize(direction) {
    const block = currentTextBlock();
    const preset = ensureTextPreset(block.preset_id);
    const sel = Preview.getActiveFormatSelection();
    if (sel && sel.blockId === block.id) {
      block.formatting_runs = block.formatting_runs || [];
      const current = block.formatting_runs.find((r) => r.start === sel.start && r.end === sel.end);
      const currentValue = (current && current.size_px != null) ? current.size_px : preset.size_px;
      const newValue = stepFontSizePreset(currentValue, direction);
      upsertFormatRun(block, sel.start, sel.end, "size_px", newValue);
      saveProject();
      renderTextPreview();
      if (currentSizeFieldSetValue) currentSizeFieldSetValue(newValue);
    } else {
      preset.size_px = stepFontSizePreset(preset.size_px, direction);
      saveProject();
      renderTextPreview();
      if (currentSizeFieldSetValue) currentSizeFieldSetValue(preset.size_px);
    }
  }

  document.getElementById("text-size-step-down").addEventListener("click", () => stepSize(-1));
  document.getElementById("text-size-step-up").addEventListener("click", () => stepSize(1));

  window.TextPanel.renderFontStyle = function renderFontStyle() {
    const preset = ensureTextPreset(currentTextBlock().preset_id);
    // BOX SIZE mode FILL computes size_px automatically (static/preview.js's maybeRefitFillText) —
    // the field still shows the live value, but typing into it would just be overwritten on the
    // next render, so it's disabled rather than hidden.
    const sizeFieldDisabled = preset.box_width_mode === "fill";

    document.getElementById("text-italic").setAttribute("aria-pressed", String(preset.italic));
    document.getElementById("text-underline").setAttribute("aria-pressed", String(preset.underline));
    document.getElementById("text-size-step-down").disabled = sizeFieldDisabled;
    document.getElementById("text-size-step-up").disabled = sizeFieldDisabled;

    currentSizeFieldSetValue = UI.numberField(document.getElementById("text-size-field"),
      { label: "SIZE", unit: "PX", value: preset.size_px, min: 24, max: 200, disabled: sizeFieldDisabled, span: 6,
        onChange: (v) => {
          const block = currentTextBlock();
          const sel = Preview.getActiveFormatSelection();
          if (sel && sel.blockId === block.id) {
            upsertFormatRun(block, sel.start, sel.end, "size_px", v);
          } else {
            preset.size_px = v;
          }
          saveProject();
          renderTextPreview();
        } });

    UI.colorSwatch(document.getElementById("text-color-field"),
      { label: "Color", value: preset.color, span: 8,
        onChange: (v) => {
          const block = currentTextBlock();
          const sel = Preview.getActiveFormatSelection();
          if (sel && sel.blockId === block.id) {
            upsertFormatRun(block, sel.start, sel.end, "color", v);
          } else {
            preset.color = v;
          }
          saveProject();
          renderTextPreview();
        } });

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
        } });
  };
})();

// Shared SIZE control for the TEXT and CAPTIONS Design tabs: the SIZE (PX) number field
// flanked by the two font-size stepper buttons. Builds its own markup and writes through the
// style target, so a TEXT selection lands on a per-range FormatRun instead of the base preset.
window.StyleSection = window.StyleSection || {};

(() => {
  // Copied verbatim from the two hand-written copies in index.html (Lucide a-arrow-down /
  // a-arrow-up), so the icons are byte-identical after the move into JS.
  const STEP_DOWN_ICON = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m14 12 4 4 4-4"/><path d="M18 16V7"/><path d="m2 16 4.039-9.69a.5.5 0 0 1 .923 0L11 16"/><path d="M3.304 13h6.392"/></svg>';
  const STEP_UP_ICON = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m14 11 4-4 4 4"/><path d="M18 16V7"/><path d="m2 16 4.039-9.69a.5.5 0 0 1 .923 0L11 16"/><path d="M3.304 13h6.392"/></svg>';

  function stepButton(icon, label) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "icon-btn col-1";
    btn.title = label;
    btn.setAttribute("aria-label", label);
    btn.innerHTML = icon;
    return btn;
  }

  // options: { compactRow } — TEXT passes true (its tighter gap/label-offset layout, preserved
  // as .style-size-row--compact); CAPTIONS omits it, keeping the default .style-row spacing.
  window.StyleSection.size = function size(container, target, options) {
    const opts = options || {};
    const group = document.createElement("div");
    group.className = "style-group";
    const row = document.createElement("div");
    row.className = "style-row style-size-row" + (opts.compactRow ? " style-size-row--compact" : "");
    group.appendChild(row);

    const stepDown = stepButton(STEP_DOWN_ICON, "Decrease font size");
    const fieldEl = document.createElement("label");
    const stepUp = stepButton(STEP_UP_ICON, "Increase font size");
    row.append(stepDown, fieldEl, stepUp);
    container.appendChild(group);

    // Built ONCE. UI.numberField wipes and rebuilds its container, so calling it again from
    // render() would drop the listener below — render() only pushes value + disabled state.
    const setFieldValue = UI.numberField(fieldEl, {
      label: "SIZE", unit: "PX", value: target.getFieldValue("size_px"),
      min: 24, max: 200, span: 6,
      onChange: (v) => target.setField("size_px", v),
    });

    // size_px is FormatRun-capable: setField, never setPresetField. getFieldValue is what
    // makes stepping relative to the SELECTION's size when one is active, not the block's.
    function step(direction) {
      const next = FontSizeScale.stepFontSizePreset(target.getFieldValue("size_px"), direction);
      target.setField("size_px", next);
      setFieldValue(next);
    }
    stepDown.addEventListener("click", () => step(-1));
    stepUp.addEventListener("click", () => step(1));

    return {
      render() {
        // BOX SIZE mode FILL computes size_px automatically (preview.js's maybeRefitFillText):
        // the field keeps showing the live value but must not be typeable or steppable.
        // box_width_mode is never a FormatRun field, so it is read off the preset directly.
        const disabled = target.getPreset().box_width_mode === "fill";
        setFieldValue.setDisabled(disabled);
        stepDown.disabled = disabled;
        stepUp.disabled = disabled;
        setFieldValue(target.getFieldValue("size_px"));
      },
    };
  };
})();

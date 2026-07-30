// Shared SIZE control for the TEXT and CAPTIONS Design tabs: the SIZE (PX) number field
// flanked by the two font-size stepper buttons. Builds its own markup and writes through the
// style target, so a TEXT selection lands on a per-range FormatRun instead of the base preset.
window.StyleSection = window.StyleSection || {};

(() => {
  function stepButton(container, icon, label) {
    const btn = UI.button(container, { icon, size: "sm" });
    btn.title = label;
    btn.setAttribute("aria-label", label);
    btn.classList.add("col-1");
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

    // UI.button appends to its container immediately, so build in the row's intended visual
    // order (step-down, field, step-up) rather than creating all three then appending.
    const stepDown = stepButton(row, "a-arrow-down", "Decrease font size");
    const fieldEl = document.createElement("label");
    row.appendChild(fieldEl);
    const stepUp = stepButton(row, "a-arrow-up", "Increase font size");
    container.appendChild(group);

    // Built ONCE. UI.numberField wipes and rebuilds its container, so calling it again from
    // render() would drop the listener below — render() only pushes value + disabled state.
    // The initial `value` is a placeholder, not `target.getFieldValue(...)`: this factory runs
    // once at panel load, before any text block/caption track necessarily exists yet, and
    // getFieldValue throws in that state (no block to read a preset from). render() — which
    // only ever runs once a block/track exists, per each panel's own empty-state guard —
    // supplies the real value immediately after.
    const setFieldValue = UI.numberField(fieldEl, {
      label: "SIZE", unit: "PX", value: 0,
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

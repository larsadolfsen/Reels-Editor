// Shared Shadow style section for the TEXT and CAPTIONS Design tabs: a settings row
// (swatch + "ON"/"OFF") plus a drill-down subpage holding the on/off toggle and the colour,
// offset-x, offset-y and blur fields. FormatRun has no shadow fields, so every control here
// writes the whole preset via target.setPresetField — never target.setField. options.fields
// (default {toggle:"shadow", color:"shadow_color", offsetX:"shadow_offset_x",
// offsetY:"shadow_offset_y", blur:"shadow_blur"}) lets a caller point this at different preset
// fields — e.g. the CAPTIONS Spotlight subpage reuses this file for the spotlight_shadow* fields.
window.StyleSection = window.StyleSection || {};

window.StyleSection.shadow = function shadowSection(container, target, options) {
  const host = options.host;
  const f = options.fields || { toggle: "shadow", color: "shadow_color", offsetX: "shadow_offset_x", offsetY: "shadow_offset_y", blur: "shadow_blur" };

  // Built once, in the factory. render() only ever calls the setValue updater captured below.
  const group = document.createElement("div");
  group.className = "style-group";
  const rowEl = document.createElement("div");
  rowEl.className = "col-8";
  group.appendChild(rowEl);
  container.appendChild(group);

  function isOn() { return !!target.getPreset()[f.toggle]; }

  // Construction-time value/swatchColor are placeholders, not isOn()/getPreset(): this factory
  // runs once at panel load, before any text block/caption track necessarily exists —
  // target.getPreset() throws in that state (style-section-outline.js's fix, same reason
  // applies here). render() supplies the real value immediately after, once a block/track
  // exists (each panel's own empty-state guard).
  const setRowValue = UI.settingsRow(rowEl, {
    label: "Shadow",
    value: "",
    swatchColor: "",
    onClick: () => page.open(),
  });

  // target.exists() guards the closeAll()-triggered call: closeAll() fires this subpage's
  // onClose even when the panel is about to show its own empty state (e.g. the block was
  // just deleted while this subpage was open) — nothing to refresh in that case.
  function refreshRow() {
    if (!target.exists()) return;
    setRowValue(isOn() ? "ON" : "OFF", null, isOn() ? target.getPreset()[f.color] : null);
  }

  const page = host.page("Shadow", (bodyEl) => {
    const preset = target.getPreset();

    const toggleGroup = document.createElement("div");
    toggleGroup.className = "style-group";
    const toggleEl = document.createElement("div");
    toggleGroup.appendChild(toggleEl);

    const colorGroup = document.createElement("div");
    colorGroup.className = "style-group";
    const colorField = document.createElement("label");
    colorGroup.appendChild(colorField);

    const offsetGroup = document.createElement("div");
    offsetGroup.className = "style-group";
    const offsetRow = document.createElement("div");
    offsetRow.className = "style-row";
    const offsetXField = document.createElement("label");
    const offsetYField = document.createElement("label");
    offsetRow.append(offsetXField, offsetYField);
    offsetGroup.appendChild(offsetRow);

    const blurGroup = document.createElement("div");
    blurGroup.className = "style-group";
    const blurField = document.createElement("label");
    blurGroup.appendChild(blurField);

    bodyEl.append(toggleGroup, colorGroup, offsetGroup, blurGroup);

    // The four detail fields are hidden individually, not their .style-group wrappers, so the
    // group's own margin still occupies the same space it did before this refactor.
    function syncFields() {
      const hidden = !isOn();
      colorField.hidden = hidden;
      offsetXField.hidden = hidden;
      offsetYField.hidden = hidden;
      blurField.hidden = hidden;
    }

    UI.buttonGroup(toggleEl,
      [{ value: "off", label: "OFF", span: 4 }, { value: "on", label: "ON", span: 4 }],
      isOn() ? "on" : "off",
      (value) => {
        target.setPresetField(f.toggle, value === "on");
        syncFields();
        refreshRow();
      });

    UI.colorSwatch(colorField, {
      label: "Shadow", value: preset[f.color], span: 8,
      onChange: (v) => { target.setPresetField(f.color, v); refreshRow(); },
    });

    UI.numberField(offsetXField, {
      label: "OFFSET X", unit: "PX", value: preset[f.offsetX], min: -40, max: 40, span: 4,
      onChange: (v) => target.setPresetField(f.offsetX, v),
    });

    UI.numberField(offsetYField, {
      label: "OFFSET Y", unit: "PX", value: preset[f.offsetY], min: -40, max: 40, span: 4,
      onChange: (v) => target.setPresetField(f.offsetY, v),
    });

    UI.numberField(blurField, {
      label: "BLUR", unit: "PX", value: preset[f.blur], min: 0, max: 40, span: 8,
      onChange: (v) => target.setPresetField(f.blur, v),
    });

    syncFields();
  }, { onClose: refreshRow });

  return { render: refreshRow };
};

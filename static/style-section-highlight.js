// Shared Highlight style section for the TEXT and CAPTIONS Design tabs: a settings row
// (swatch + "ON"/"OFF") plus a drill-down subpage holding the on/off toggle, the colour and the
// corner radius. Identical for both panels — an always-on background rect drawn behind the whole
// block/caption box (_highlight_dialogues for TEXT, _caption_highlight_dialogue for CAPTIONS),
// independent of CAPTIONS' separate per-word karaoke feature (see style-section-spotlight.js).
// Before 2026-07-30 this file also carried CAPTIONS' karaoke MODE group under this same
// "Highlight" row/label — split out because "highlight" on TEXT (a static box background) and
// the old bundled behavior on CAPTIONS (that background PLUS a per-word karaoke mode) were not
// actually the same feature, despite sharing one row. Spotlight now owns the MODE group; this
// section owns only the on/off marker. As of the spotlight per-word style overrides feature
// (2026-07-30), the two rows no longer share any fields — Spotlight's rect uses its own
// spotlight_highlight/spotlight_highlight_color/spotlight_highlight_border_radius fields (see
// below), independent of this section's highlight_color/highlight_border_radius.
// highlight/highlight_color are FormatRun-capable (setField/getFieldValue);
// highlight_border_radius is not (setPresetField/getPreset). As of the spotlight per-word style
// overrides feature, options.fields (default {toggle:"highlight", color:"highlight_color",
// radius:"highlight_border_radius"}) lets a caller point this whole section at different preset
// fields — the CAPTIONS Spotlight subpage reuses this file for the spotlight_highlight* fields
// (its own on/off marker for the per-word rect) instead of a new file.
window.StyleSection = window.StyleSection || {};

window.StyleSection.highlight = function highlightSection(container, target, options) {
  const host = options.host;
  const f = options.fields || { toggle: "highlight", color: "highlight_color", radius: "highlight_border_radius" };

  // Built once, in the factory. render() only ever calls the setValue updater captured below.
  const group = document.createElement("div");
  group.className = "style-group";
  const rowEl = document.createElement("div");
  rowEl.className = "col-8";
  group.appendChild(rowEl);
  container.appendChild(group);

  // getFieldValue, not getPreset()[f.toggle]: with a stage text selection active the row must
  // show that selection's FormatRun override.
  function isOn() { return !!target.getFieldValue(f.toggle); }
  function colorValue() { return target.getFieldValue(f.color); }

  // Construction-time value/swatchColor are placeholders, not isOn()/colorValue(): this factory
  // runs once at panel load, before any text block/caption track necessarily exists —
  // target.getFieldValue(...) throws in that state (style-section-outline.js's fix, same reason
  // applies here). render() supplies the real value immediately after, once a block/track
  // exists (each panel's own empty-state guard).
  const setRowValue = UI.settingsRow(rowEl, {
    label: "Highlight",
    value: "",
    swatchColor: "",
    onClick: () => page.open(),
  });

  // target.exists() guards the closeAll()-triggered call: closeAll() fires this subpage's
  // onClose even when the panel is about to show its own empty state (e.g. the block was
  // just deleted while this subpage was open) — nothing to refresh in that case.
  function refreshRow() {
    if (!target.exists()) return;
    setRowValue(isOn() ? "ON" : "OFF", null, isOn() ? colorValue() : null);
  }

  const page = host.page("Highlight", (bodyEl) => {
    const preset = target.getPreset();

    const toggleGroup = document.createElement("div");
    toggleGroup.className = "style-group";
    const toggleEl = document.createElement("div");
    toggleGroup.appendChild(toggleEl);
    bodyEl.appendChild(toggleGroup);

    const colorGroup = document.createElement("div");
    colorGroup.className = "style-group";
    const colorField = document.createElement("label");
    colorGroup.appendChild(colorField);

    const radiusGroup = document.createElement("div");
    radiusGroup.className = "style-group";
    const radiusField = document.createElement("label");
    radiusGroup.appendChild(radiusField);

    bodyEl.append(colorGroup, radiusGroup);

    function syncFields() {
      colorField.hidden = !isOn();
      radiusField.hidden = !isOn();
    }

    UI.buttonGroup(toggleEl,
      [{ value: "off", label: "OFF", span: 4 }, { value: "on", label: "ON", span: 4 }],
      isOn() ? "on" : "off",
      (value) => {
        target.setField(f.toggle, value === "on");
        syncFields();
        refreshRow();
      });

    UI.colorSwatch(colorField, {
      label: "Highlight", value: colorValue(), span: 8,
      onChange: (v) => { target.setField(f.color, v); refreshRow(); },
    });

    UI.numberField(radiusField, {
      label: "RADIUS", unit: "PX", value: preset[f.radius],
      min: 0, max: 40, span: 8,
      onChange: (v) => target.setPresetField(f.radius, v),
    });

    syncFields();
  }, { onClose: refreshRow });

  return { render: refreshRow };
};

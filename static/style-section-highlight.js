// Shared Highlight style section for the TEXT and CAPTIONS Design tabs: a settings row
// (swatch + "ON"/"OFF") plus a drill-down subpage holding the MARKER on/off toggle, the
// colour and the corner radius — and, when options.modes is set (CAPTIONS), the karaoke MODE
// group. highlight/highlight_color are FormatRun-capable (setField/getFieldValue);
// highlight_mode/highlight_border_radius are not (setPresetField/getPreset).
window.StyleSection = window.StyleSection || {};

window.StyleSection.highlight = function highlightSection(container, target, options) {
  const host = options.host;
  // CAPTIONS only: the three karaoke modes. TEXT has no per-word karaoke, so no MODE group.
  const modes = !!options.modes;

  // Built once, in the factory. render() only ever calls the setValue updater captured below.
  const group = document.createElement("div");
  group.className = "style-group";
  const rowEl = document.createElement("div");
  rowEl.className = "col-8";
  group.appendChild(rowEl);
  container.appendChild(group);

  // getFieldValue, not getPreset().highlight: with a stage text selection active the row must
  // show that selection's FormatRun override.
  function isOn() { return !!target.getFieldValue("highlight"); }
  function colorValue() { return target.getFieldValue("highlight_color"); }

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
    // MODE and RADIUS are whole-preset only, so they read the preset directly.
    const preset = target.getPreset();

    // The MARKER/MODE labels only earn their keep when there are two groups to tell apart;
    // with just the toggle, the subpage's own "Highlight" header already names it.
    if (modes) {
      const markerLabel = document.createElement("div");
      markerLabel.className = "section-label-spacer";
      UI.text(markerLabel, { variant: "eyebrow", content: "MARKER" });
      bodyEl.appendChild(markerLabel);
    }

    const toggleGroup = document.createElement("div");
    toggleGroup.className = "style-group";
    const toggleEl = document.createElement("div");
    toggleGroup.appendChild(toggleEl);
    bodyEl.appendChild(toggleGroup);

    let modeEl = null;
    if (modes) {
      const modeLabel = document.createElement("div");
      modeLabel.className = "section-label-spacer";
      UI.text(modeLabel, { variant: "eyebrow", content: "MODE" });
      bodyEl.appendChild(modeLabel);

      const modeGroup = document.createElement("div");
      modeGroup.className = "style-group";
      modeEl = document.createElement("div");
      modeGroup.appendChild(modeEl);
      bodyEl.appendChild(modeGroup);
    }

    const colorGroup = document.createElement("div");
    colorGroup.className = "style-group";
    const colorField = document.createElement("label");
    colorGroup.appendChild(colorField);

    const radiusGroup = document.createElement("div");
    radiusGroup.className = "style-group";
    const radiusField = document.createElement("label");
    radiusGroup.appendChild(radiusField);

    bodyEl.append(colorGroup, radiusGroup);

    // One shared visibility rule for both panels: a detail field shows exactly when the value
    // it edits can affect what renders. The colour paints the marker rect whenever the marker
    // is on, and additionally paints the karaoke word in every mode — so it is always live
    // where modes exist. The radius only matters where a rounded rect is drawn: the marker
    // rect, or "background" mode's per-word rect. On TEXT, highlight_mode is never
    // "background", so both reduce to the old !preset.highlight rule.
    function syncFields() {
      colorField.hidden = !(isOn() || modes);
      radiusField.hidden = !(isOn() || target.getPreset().highlight_mode === "background");
    }

    UI.buttonGroup(toggleEl,
      [{ value: "off", label: "OFF", span: 4 }, { value: "on", label: "ON", span: 4 }],
      isOn() ? "on" : "off",
      (value) => {
        target.setField("highlight", value === "on");
        syncFields();
        refreshRow();
      });

    if (modeEl) {
      UI.buttonGroup(modeEl,
        [{ value: "current_word", label: "Current word", span: 4 },
         { value: "progressive_fill", label: "Progressive fill", span: 4 },
         { value: "background", label: "Background", span: 8 }],
        preset.highlight_mode,
        (value) => {
          target.setPresetField("highlight_mode", value);
          syncFields();
        });
    }

    UI.colorSwatch(colorField, {
      label: "Highlight", value: colorValue(), span: 8,
      onChange: (v) => { target.setField("highlight_color", v); refreshRow(); },
    });

    UI.numberField(radiusField, {
      label: "RADIUS", unit: "PX", value: preset.highlight_border_radius,
      min: 0, max: 40, span: 8,
      onChange: (v) => target.setPresetField("highlight_border_radius", v),
    });

    syncFields();
  }, { onClose: refreshRow });

  return { render: refreshRow };
};

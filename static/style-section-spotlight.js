// CAPTIONS-only Design-tab section: "Spotlight", the per-word karaoke highlight (current word /
// progressive fill / background-behind-word), split out of the old combined "Highlight" row
// (see style-section-highlight.js's header) because it is a different feature from TEXT/CAPTIONS'
// shared static-box Highlight — a mode is always set, so unlike Highlight this row is never
// "None". Shares highlight_color/highlight_border_radius with the Highlight section by design
// (app/ass_render.py's _current_word_dialogues / _background_word_dialogues already read those
// same fields, independent of preset.highlight) — no new model fields. Everything here is
// whole-preset: a caption track has no per-range FormatRun overrides, so setPresetField and
// setField are the same write on this target (style-target-caption.js).
window.StyleSection = window.StyleSection || {};

window.StyleSection.spotlight = function spotlightSection(container, target, options) {
  const host = options.host;

  const MODE_LABELS = {
    current_word: "Current word",
    progressive_fill: "Progressive fill",
    background: "Background",
  };

  const group = document.createElement("div");
  group.className = "style-group";
  const rowEl = document.createElement("div");
  rowEl.className = "col-8";
  group.appendChild(rowEl);
  container.appendChild(group);

  const setRowValue = UI.settingsRow(rowEl, {
    label: "Spotlight",
    value: "",
    swatchColor: "",
    onClick: () => page.open(),
  });

  function refreshRow() {
    if (!target.exists()) return;
    const preset = target.getPreset();
    setRowValue(MODE_LABELS[preset.highlight_mode] || preset.highlight_mode, null, preset.highlight_color);
  }

  const page = host.page("Spotlight", (bodyEl) => {
    const modeGroup = document.createElement("div");
    modeGroup.className = "style-group";
    const modeEl = document.createElement("div");
    modeGroup.appendChild(modeEl);
    bodyEl.appendChild(modeGroup);

    const colorGroup = document.createElement("div");
    colorGroup.className = "style-group";
    const colorField = document.createElement("label");
    colorGroup.appendChild(colorField);

    const radiusGroup = document.createElement("div");
    radiusGroup.className = "style-group";
    const radiusField = document.createElement("label");
    radiusGroup.appendChild(radiusField);

    bodyEl.append(colorGroup, radiusGroup);

    // RADIUS only matters for "background" mode's per-word rounded rect; current_word/
    // progressive_fill never draw a rect (see app/ass_render.py's mode dispatch).
    function syncFields() {
      radiusField.hidden = target.getPreset().highlight_mode !== "background";
    }

    UI.buttonGroup(modeEl,
      [{ value: "current_word", label: "Current word", span: 4 },
       { value: "progressive_fill", label: "Progressive fill", span: 4 },
       { value: "background", label: "Background", span: 8 }],
      target.getPreset().highlight_mode,
      (value) => {
        target.setPresetField("highlight_mode", value);
        syncFields();
        refreshRow();
      });

    UI.colorSwatch(colorField, {
      label: "Spotlight", value: target.getPreset().highlight_color, span: 8,
      onChange: (v) => { target.setPresetField("highlight_color", v); refreshRow(); },
    });

    UI.numberField(radiusField, {
      label: "RADIUS", unit: "PX", value: target.getPreset().highlight_border_radius,
      min: 0, max: 40, span: 8,
      onChange: (v) => target.setPresetField("highlight_border_radius", v),
    });

    syncFields();
  }, { onClose: refreshRow });

  return { render: refreshRow };
};

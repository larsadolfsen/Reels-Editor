// Shared Highlight style section for the TEXT and CAPTIONS Design tabs: a settings row
// (swatch + "ON"/"OFF") plus a drill-down subpage holding the on/off toggle, the colour and the
// corner radius. Identical for both panels — an always-on background rect drawn behind the whole
// block/caption box (_highlight_dialogues for TEXT, _caption_highlight_dialogue for CAPTIONS),
// independent of CAPTIONS' separate per-word karaoke feature (see style-section-spotlight.js).
// options.fields (default {toggle:"highlight", color:"highlight_color", radius:"highlight_border_radius"})
// lets a caller point this at different preset fields — e.g. the CAPTIONS Spotlight subpage
// reuses this file for the spotlight_highlight* fields instead of a new file.
window.StyleSection = window.StyleSection || {};

window.StyleSection.highlight = function highlightSection(container, target, options) {
  const host = options.host;
  const f = options.fields || { toggle: "highlight", color: "highlight_color", radius: "highlight_border_radius" };

  const group = document.createElement("div");
  group.className = "style-group";
  const rowEl = document.createElement("div");
  rowEl.className = "col-8";
  group.appendChild(rowEl);
  container.appendChild(group);

  function isOn() { return !!target.getFieldValue(f.toggle); }
  function colorValue() { return target.getFieldValue(f.color); }

  const setRowValue = UI.settingsRow(rowEl, {
    label: "Highlight",
    value: "",
    swatchColor: "",
    onClick: () => page.open(),
  });

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

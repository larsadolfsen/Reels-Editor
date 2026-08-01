// CAPTIONS panel Box tab: Border row + drill-down subpanel (on/off toggle + width/radius/color),
// same pattern as text-panel-border.js but against the caption track's preset. box_border_width
// === 0 IS "no border" — there is no box_border boolean. Exposes window.CaptionPanel.renderBorder().
// Drill-down subpage is built via the shared captionStyleHost (panel-captions.js's SubpanelHost)
// rather than hand-rolled hidden-attribute toggling — see style-section-outline.js for the pattern.
window.CaptionPanel = window.CaptionPanel || {};

(() => {
  const DEFAULT_BORDER_WIDTH = 2;
  let borderRowSetValue = null;
  let page = null;

  function refreshBorderRow(preset) {
    const on = preset.box_border_width > 0;
    const value = SettingsRowValue.orNone(on, `${preset.box_border_width}px`);
    const swatch = on ? preset.box_border_color : null;

    if (borderRowSetValue) {
      borderRowSetValue(value, null, swatch);
    } else {
      borderRowSetValue = UI.settingsRow(document.getElementById("caption-box-border-row"), {
        label: "Border", value, swatchColor: swatch,
        onClick: () => page.open(),
      });
    }
  }

  window.CaptionPanel.renderBorder = function renderBorder() {
    const preset = ensureCaptionPreset(ensureCaptionTrack().preset_id);

    refreshBorderRow(preset);

    if (!page) {
      // buildBody reruns on every page.open(), so it always reflects the current preset —
      // no separate pre-open re-render step is needed the way the old hand-rolled open did.
      page = captionStyleHost.page("Border", (bodyEl) => {
        const p = ensureCaptionPreset(ensureCaptionTrack().preset_id);
        const on = p.box_border_width > 0;

        const toggleGroup = document.createElement("div");
        toggleGroup.className = "style-group";
        const toggleEl = document.createElement("div");
        toggleGroup.appendChild(toggleEl);

        const fieldsGroup = document.createElement("div");
        fieldsGroup.className = "style-group";
        const fieldsRow = document.createElement("div");
        fieldsRow.className = "style-row";
        const widthField = document.createElement("label");
        const radiusField = document.createElement("label");
        fieldsRow.append(widthField, radiusField);
        fieldsGroup.appendChild(fieldsRow);

        const colorGroup = document.createElement("div");
        colorGroup.className = "style-group";
        const colorField = document.createElement("label");
        colorGroup.appendChild(colorField);

        bodyEl.append(toggleGroup, fieldsGroup, colorGroup);

        widthField.hidden = !on;
        radiusField.hidden = !on;
        colorField.hidden = !on;

        UI.buttonGroup(toggleEl,
          [{ value: "off", label: "OFF", span: 4 }, { value: "on", label: "ON", span: 4 }],
          on ? "on" : "off",
          (v) => {
            if (v === "on") {
              if (p.box_border_width === 0) p.box_border_width = DEFAULT_BORDER_WIDTH;
            } else {
              p.box_border_width = 0;
            }
            saveProject();
            renderCaptionPreview();
            refreshBorderRow(p);
            page.open();
          });

        UI.numberField(widthField,
          { label: "WIDTH", unit: "PX", value: p.box_border_width, min: 0, max: 40, span: 4,
            onChange: (v) => { p.box_border_width = v; saveProject(); renderCaptionPreview(); refreshBorderRow(p); } });

        UI.numberField(radiusField,
          { label: "RADIUS", unit: "PX", value: p.box_border_radius, min: 0, max: 200, span: 4,
            onChange: (v) => { p.box_border_radius = v; saveProject(); renderCaptionPreview(); } });

        UI.colorSwatch(colorField,
          { label: "Border", value: p.box_border_color, span: 8,
            onChange: (v) => { p.box_border_color = v; saveProject(); renderCaptionPreview(); refreshBorderRow(p); } });
      }, { onClose: () => refreshBorderRow(ensureCaptionPreset(ensureCaptionTrack().preset_id)) });
    }
  };
})();

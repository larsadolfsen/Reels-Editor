// Shared Box-tab section: the absolute HORIZONTAL/VERTICAL pixel fields (TextPreset.x/y) plus
// the stateless 3x3 anchor-grid shortcut, one file serving both the TEXT and CAPTIONS panels.
// Uses target.getBoxSize() for the box's live rendered size and panel-text.js's
// anchorPositionX/anchorPositionY for the edge-flush maths. Every write is setPresetField.
window.StyleSection = window.StyleSection || {};

(() => {
  const ROW_OPTIONS = [
    { value: "top", label: "TOP", span: 3 },
    { value: "mid", label: "MID", span: 2 },
    { value: "btm", label: "BTM", span: 3 },
  ];
  const COL_OPTIONS = [
    { value: "left", label: "LEFT", span: 3 },
    { value: "mid", label: "MID", span: 2 },
    { value: "right", label: "RIGHT", span: 3 },
  ];

  window.StyleSection.position = function position(container, target, options) {
    container.innerHTML = "";

    const labelEl = document.createElement("div");
    labelEl.className = "section-label-spacer";
    UI.text(labelEl, { variant: "eyebrow", content: "POSITION" });
    container.appendChild(labelEl);

    const gridGroup = document.createElement("div");
    gridGroup.className = "style-group";
    const rowGroupEl = document.createElement("div");
    const colGroupEl = document.createElement("div");
    gridGroup.append(rowGroupEl, colGroupEl);
    container.appendChild(gridGroup);

    const fieldsGroup = document.createElement("div");
    fieldsGroup.className = "style-group";
    const fieldsRow = document.createElement("div");
    fieldsRow.className = "style-row";
    const xEl = document.createElement("label");
    const yEl = document.createElement("label");
    fieldsRow.append(xEl, yEl);
    fieldsGroup.appendChild(fieldsRow);
    container.appendChild(fieldsGroup);

    const preset0 = target.getPreset();

    const setX = UI.numberField(xEl,
      { label: "HORIZONTAL", unit: "PX", value: preset0.x, step: 1, min: 1, max: 1080, span: 4,
        onChange: (v) => target.setPresetField("x", Math.round(v)) });

    const setY = UI.numberField(yEl,
      { label: "VERTICAL", unit: "PX", value: preset0.y, step: 1, min: 1, max: 1920, span: 4,
        onChange: (v) => target.setPresetField("y", Math.round(v)) });

    // Stateless shortcut: activeValue is null, so nothing is selected on entry, and a click just
    // computes an absolute pixel value edge-flush against the 1080x1920 canvas from the box's own
    // rendered size — which is exactly what target.getBoxSize() exists for — writes it to x/y,
    // and re-renders the whole panel so the fields above pick the new value up.
    const setRowActive = UI.buttonGroup(rowGroupEl, ROW_OPTIONS, null, (value) => {
      const size = target.getBoxSize();
      target.setPresetField("y", Math.round(anchorPositionY(value, size && size.height)));
      target.rerenderPanel();
    });

    const setColActive = UI.buttonGroup(colGroupEl, COL_OPTIONS, null, (value) => {
      const size = target.getBoxSize();
      // anchorPositionX's third argument is the align mode: stage.css shifts the box by a
      // fraction of its own width depending on align, and the edge-flush x has to compensate.
      const x = anchorPositionX(value, size && size.width, target.getPreset().align);
      target.setPresetField("x", Math.round(x));
      target.rerenderPanel();
    });

    function render() {
      const preset = target.getPreset();
      setX(preset.x);
      setY(preset.y);
      // UI.buttonGroup marks the clicked button pressed even when the group has no active value.
      // The old code cleared that by rebuilding the group on every panel render; a build-once
      // section has to clear it here, or a clicked anchor cell stays lit.
      setRowActive(null);
      setColActive(null);
    }

    render();
    return { render };
  };
})();

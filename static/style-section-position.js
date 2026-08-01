// Shared Box-tab section: the absolute HORIZONTAL/VERTICAL pixel fields (TextPreset.x/y) plus
// the stateless single-row six-icon anchor shortcut, one file serving both the TEXT and CAPTIONS
// panels. Uses target.getBoxSize() for the box's live rendered size and static/anchor-position.js's
// AnchorPosition.positionX/positionY (kind-aware: target.kind picks the text/image vs caption safe
// rect) for the edge-flush maths. Every write is setPresetField.
//
// NOTE: this replaces an earlier two-row (TOP/MID/BTM + LEFT/MID/RIGHT) version built against a
// stale snapshot of the Box tab. Commit f69f15f ("POSITION anchors as a single row of icon
// buttons") landed on main after that version was written and changed both panels' live markup
// to one six-icon row (id `position-group`/`caption-position-group`) before this section was
// ever wired in — so the row/col version never actually shipped. Rewritten here to match.
window.StyleSection = window.StyleSection || {};

(() => {
  // Vertical (top/mid-v/btm) and horizontal (left/mid-h/right) anchors share one row, so the two
  // centering buttons need distinct values; each maps back to the plain "mid" the anchor helpers
  // expect. mid-h/mid-v use the dashed-centerline icons (commit 86d1634) — canonical set taken
  // from text-panel-position.js; caption-panel-box.js never got that fix applied.
  const OPTIONS = [
    { value: "top", label: "TOP", span: 1, icon: UI.icon("arrow-up-to-line", { size: 16 }) },
    { value: "mid-h", label: "MID HORIZONTAL", span: 1, icon: UI.icon("align-horizontal-justify-center", { size: 16 }) },
    { value: "btm", label: "BTM", span: 1, icon: UI.icon("arrow-down-to-line", { size: 16 }) },
    { value: "left", label: "LEFT", span: 1, icon: UI.icon("arrow-left-to-line", { size: 16 }) },
    { value: "mid-v", label: "MID VERTICAL", span: 1, icon: UI.icon("align-vertical-justify-center", { size: 16 }) },
    { value: "right", label: "RIGHT", span: 1, icon: UI.icon("arrow-right-to-line", { size: 16 }) },
  ];

  window.StyleSection.position = function position(container, target, options) {
    container.innerHTML = "";

    const labelEl = document.createElement("div");
    labelEl.className = "section-label-spacer";
    UI.text(labelEl, { variant: "eyebrow", content: "POSITION" });
    container.appendChild(labelEl);

    const gridGroup = document.createElement("div");
    gridGroup.className = "style-group";
    const gridEl = document.createElement("div");
    gridGroup.appendChild(gridEl);
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
    const setActive = UI.buttonGroup(gridEl, OPTIONS, null, (value) => {
      const size = target.getBoxSize();
      if (value === "top" || value === "mid-v" || value === "btm") {
        const y = AnchorPosition.positionY(value === "mid-v" ? "mid" : value, size && size.height, target.kind);
        target.setPresetField("y", Math.round(y));
      } else {
        // AnchorPosition.positionX's third argument is the align mode: stage.css shifts the box
        // by a fraction of its own width depending on align, and the edge-flush x has to
        // compensate; the fourth argument picks which safe rect (text/image vs caption) to snap
        // to.
        const x = AnchorPosition.positionX(value === "mid-h" ? "mid" : value, size && size.width, target.getPreset().align, target.kind);
        target.setPresetField("x", Math.round(x));
      }
      target.rerenderPanel();
    });

    function render() {
      const preset = target.getPreset();
      setX(preset.x);
      setY(preset.y);
      // UI.buttonGroup marks the clicked button pressed even when the group has no active value.
      // The old code cleared that by rebuilding the group on every panel render; a build-once
      // section has to clear it here, or a clicked anchor cell stays lit.
      setActive(null);
    }

    render();
    return { render };
  };
})();

// Shared Box-panel MASK tab for VIDEO BOX / IMAGE BOX (added 2026-08-01, mask-visibility-ui,
// replacing the retired timeline-mask-accordion.js): window.BoxMaskPanel.render(container, box,
// {onChange, getWindow}) shows "+ Add mask" (UI.maskTypeGallery, only "Shape" today) when
// box.mask_shape_id is unset, or an assigned-mask row (icon + "Shape" label, click opens the
// SHAPE panel via onTimelineSelect, trash icon removes the mask) when set. `getWindow()` returns
// {start, duration} — the box's own current visible window — used to size a newly-created mask
// shape and to keep an existing mask shape's start/duration following the box's own on every
// render. A mask shape has no timing of its own; before this it could drift from its box
// (edited independently via the SHAPE panel's Time tab, or just never updated after the box's
// own Time fields changed), which made selecting the mask seek the playhead to a moment the box
// itself wasn't even visible at — so nothing rendered, defeating the whole point of the rubylith
// preview. Rebuilds `container` fresh each call, same contract as box-panel-size-position.js.
window.BoxMaskPanel = (() => {
  function maskShapeFor(box) {
    if (!box.mask_shape_id) return null;
    return (project.shapes || []).find((s) => s.id === box.mask_shape_id) || null;
  }

  function render(container, box, { onChange, getWindow }) {
    container.innerHTML = "";
    const shape = maskShapeFor(box);

    const eyebrow = document.createElement("div");
    eyebrow.className = "section-label-spacer text-eyebrow";
    eyebrow.textContent = "MASK";
    container.appendChild(eyebrow);

    const group = document.createElement("div");
    group.className = "style-group";
    container.appendChild(group);

    if (!shape) {
      const wrap = document.createElement("div");
      wrap.className = "mask-add-gallery-wrap";
      UI.maskTypeGallery(wrap, [{ value: "shape", icon: "square", label: "Shape" }], async (kind) => {
        if (kind !== "shape") return;
        const win = getWindow();
        const newShape = ShapePanel.createShapeAt({
          x: box.x, y: box.y, width: box.width, height: box.height,
          start: win.start, duration: win.duration,
        });
        box.mask_shape_id = newShape.id;
        await onChange();
      });
      group.appendChild(wrap);
      return;
    }

    // Write-through, not a one-time seed: a mask shape's window always follows its box's.
    const win = getWindow();
    if (shape.start !== win.start || shape.duration !== win.duration) {
      shape.start = win.start;
      shape.duration = win.duration;
      saveProject();
    }

    const row = document.createElement("div");
    row.className = "mask-assigned-row";
    UI.listRow(row, {});
    const label = document.createElement("span");
    label.className = "mask-assigned-row-label";
    label.innerHTML = `${UI.icon("venetian-mask", { size: 14 })}<span>Shape</span>`;
    label.addEventListener("click", () => onTimelineSelect({ type: "shape", item: shape }));
    row.appendChild(label);

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "mask-assigned-row-remove";
    removeBtn.title = "Remove mask";
    removeBtn.innerHTML = UI.icon("trash", { size: 14 });
    removeBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      project.shapes = project.shapes.filter((s) => s.id !== shape.id);
      box.mask_shape_id = null;
      VideoBoxPreview.setActiveMaskShapeId(null);
      ImageBoxPreview.setActiveMaskShapeId(null);
      await onChange();
    });
    row.appendChild(removeBtn);

    group.appendChild(row);
  }

  return { render };
})();

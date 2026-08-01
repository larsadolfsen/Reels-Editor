// Shared Box-panel MASK tab for VIDEO BOX / IMAGE BOX (added 2026-08-01, mask-visibility-ui,
// replacing the retired timeline-mask-accordion.js): window.BoxMaskPanel.render(container, box,
// {onChange, getWindow}) shows a "Type" settings row + drill-down list (only "Shape" today) when
// box.mask_shape_id is unset, or an assigned-mask row (icon + "Shape" label, trash icon removes
// the mask) plus inline SIZE & POSITION + OPACITY fields for that mask shape when set — added
// 2026-08-01, mask-list-styling, replacing the row's old click-to-navigate-to-the-standalone-
// SHAPE-panel behavior: the mask shape is edited as a subpage of this box's own panel, not on
// its own page, reusing ShapeSizePositionFields/ShapeOpacityField (shared with panel-shape.js's
// Box/Style tabs). Field edits use their own lightweight save+repaint (`fieldOnChange`, mirroring
// panel-shape.js's `repaintStage()`) rather than the caller's `onChange` — that one rebuilds this
// whole panel via `renderDetail(box)`, which fires on every render of the assign/remove-mask
// picker but must NOT fire per keystroke (UI.numberField's onChange fires on every `input`
// event; rebuilding the container mid-keystroke would tear down the very input being typed into,
// same hazard box-panel-size-position.js documents for its own fields). `getWindow()` returns
// {start, duration} — the box's own current visible window — used to size a newly-created mask
// shape and to keep an existing mask shape's start/duration following the box's own on every
// render. A mask shape has no timing of its own; before this it could drift from its box
// (edited independently via the SHAPE panel's Time tab, or just never updated after the box's
// own Time fields changed), which made selecting the mask seek the playhead to a moment the box
// itself wasn't even visible at — so nothing rendered, defeating the whole point of the rubylith
// preview. Rebuilds `container` fresh each call, same contract as box-panel-size-position.js.
//
// The mask-type picker (added 2026-08-01, mask-list-styling, replacing the retired
// ui-mask-type-gallery.js card grid) follows the same settings-row + drill-down-list pattern as
// the shared style sections' Font Family/Weight rows (style-section-font-family.js/
// style-section-font-weight.js) — a UI.settingsRow opens a UI.subPanelHeader + .font-list of
// options — but built as a lightweight local main/picker toggle instead of going through
// StylePanelHost, since this panel has no drill-element pairing wired up in index.html the way
// TEXT/CAPTIONS do. `MASK_TYPES` is `[{value, icon, label}]`; only "shape" exists today, mirroring
// the retired gallery's own note that more mask source kinds (text/person) could be added later
// as more list rows without restructuring this file.
window.BoxMaskPanel = (() => {
  const MASK_TYPES = [{ value: "shape", icon: "venetian-mask", label: "Shape" }];

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
      async function assignType(kind) {
        if (kind !== "shape") return;
        const win = getWindow();
        const newShape = ShapePanel.createShapeAt({
          x: box.x, y: box.y, width: box.width, height: box.height,
          start: win.start, duration: win.duration,
        });
        box.mask_shape_id = newShape.id;
        await onChange();
      }

      const mainEl = document.createElement("div");
      mainEl.className = "col-8";
      const pickerEl = document.createElement("div");
      pickerEl.hidden = true;
      group.append(mainEl, pickerEl);

      function openPicker() { mainEl.hidden = true; pickerEl.hidden = false; }
      function closePicker() { pickerEl.hidden = true; mainEl.hidden = false; }

      UI.settingsRow(mainEl, { label: "Type", value: "None", onClick: openPicker });

      const headerEl = document.createElement("div");
      pickerEl.appendChild(headerEl);
      UI.subPanelHeader(headerEl, { title: "Mask Type", onBack: closePicker });

      const listEl = document.createElement("ul");
      listEl.className = "font-list";
      pickerEl.appendChild(listEl);
      MASK_TYPES.forEach((t) => {
        const li = document.createElement("li");
        li.className = "font-list-row";
        UI.listRow(li, { subtle: true });
        li.addEventListener("click", () => assignType(t.value));

        const nameGroup = document.createElement("span");
        nameGroup.className = "font-list-row-name-group";
        const iconEl = document.createElement("span");
        iconEl.innerHTML = UI.icon(t.icon, { size: 16 });
        const nameEl = document.createElement("span");
        nameEl.className = "font-list-row-name";
        nameEl.textContent = t.label;
        nameGroup.append(iconEl, nameEl);
        li.appendChild(nameGroup);

        listEl.appendChild(li);
      });
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

    // Per-keystroke field edits repaint the stage directly rather than going through the
    // caller's `onChange` — that one calls renderDetail(box), which rebuilds this whole panel
    // (including these very fields) via BoxMaskPanel.render, tearing down the input the user is
    // still typing into.
    const fieldOnChange = async () => {
      await saveProject();
      renderTimeline();
      VideoBoxPreview.render(project.video_boxes, Preview.currentTimelineTime());
      ImageBoxPreview.render(project.image_boxes, Preview.currentTimelineTime());
    };

    const sizePositionMount = document.createElement("div");
    sizePositionMount.className = "col-8";
    group.appendChild(sizePositionMount);
    ShapeSizePositionFields.render(sizePositionMount, shape, { onChange: fieldOnChange });

    const opacityRow = document.createElement("div");
    opacityRow.className = "style-row";
    group.appendChild(opacityRow);
    const opacityEl = document.createElement("label");
    opacityRow.appendChild(opacityEl);
    ShapeOpacityField.render(opacityEl, shape, { onChange: fieldOnChange, span: 8 });
  }

  return { render };
})();

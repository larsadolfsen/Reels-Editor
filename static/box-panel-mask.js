// Shared Box-panel MASK tab for VIDEO BOX / IMAGE BOX (added 2026-08-01, mask-visibility-ui,
// replacing the retired timeline-mask-accordion.js): window.BoxMaskPanel.render(container, box,
// {onChange, getWindow}) renders a "Type" settings row (added 2026-08-01, mask-list-styling,
// replacing the retired ui-mask-type-gallery.js card grid) that always shows the current
// selection ("None"/"Square", mirroring style-section-font-family.js's Font Family row) and opens
// a drill-down list of mask source kinds — "None" (default, added 2026-08-01 mask-type-none,
// replacing the old standalone ON/OFF switch — selecting it sets box.mask_enabled = false while
// leaving mask_shape_id/the shape's own config untouched, so re-selecting "Square" later instantly
// reapplies the same mask; see box-mask-render.js's maskingShapeFor and app/main.py's
// _rasterize_mask_png, both of which gate on this same field for preview/export) and "Square"
// (internally the ShapeLayer `"shape"` value — the display label was renamed 2026-08-01
// mask-type-none, but the mask source is still a rectangular ShapeLayer under the hood) are
// selectable, "Person"/"Text" (`MASK_TYPES`) are disabled placeholder rows, per the retired
// gallery's own note that more kinds could be added later as more rows — and finally a content
// area that changes to match the current selection: empty when "None", or inline SIZE & POSITION
// + OPACITY fields for that mask shape (added 2026-08-01, mask-list-styling, replacing the row's
// old click-to-navigate-to-the-standalone-SHAPE-panel behavior — the mask shape is edited as a
// subpage of this box's own panel, not on its own page, reusing ShapeSizePositionFields/
// ShapeOpacityField shared with panel-shape.js's Box/Style tabs). The old assigned-mask row
// (icon + "Square" label + a trash button that deleted the shape and reverted to "None") was
// removed 2026-08-01 (mask-type-none) as redundant with the Type row above it, which already
// shows the current selection with a checkmark; picking "None" in the Type picker is now the
// only way to turn a mask off — it still just flips box.mask_enabled, leaving the ShapeLayer and
// mask_shape_id in place so re-picking "Square" instantly reapplies the same mask, same as
// before. The
// Type picker is a real SubpanelHost drill-down subpage (same component Font Family/Weight/
// Color use on the TEXT/CAPTIONS panels), not hand-rolled toggle logic — mainEl/drillEl are built
// fresh as a local main/drill pair on every render() call rather than referencing fixed ids from
// index.html, since this shared panel serves two different callers (VIDEO BOX/IMAGE BOX) with
// their own container ids.
//
// Field edits use their own lightweight save+repaint (`fieldOnChange`, mirroring
// panel-shape.js's `repaintStage()`) rather than the caller's `onChange` — that one rebuilds this
// whole panel via `renderDetail(box)`, which fires on every render of the type-assign/remove-mask
// actions but must NOT fire per keystroke (UI.numberField's onChange fires on every `input`
// event; rebuilding the container mid-keystroke would tear down the very input the user is still
// typing into, same hazard box-panel-size-position.js documents for its own fields).
// `getWindow()` returns {start, duration} — the box's own current visible window — used to size a
// newly-created mask shape and to keep an existing mask shape's start/duration following the
// box's own on every render. A mask shape has no timing of its own; before this it could drift
// from its box (edited independently via the SHAPE panel's Time tab, or just never updated after
// the box's own Time fields changed), which made selecting the mask seek the playhead to a moment
// the box itself wasn't even visible at — so nothing rendered, defeating the whole point of the
// rubylith preview. Rebuilds `container` fresh each call, same contract as
// box-panel-size-position.js.
window.BoxMaskPanel = (() => {
  const MASK_TYPES = [
    { value: "none", icon: "ban", label: "None", enabled: true },
    { value: "shape", icon: "square", label: "Square", enabled: true },
    { value: "person", icon: "user", label: "Person", enabled: false },
    { value: "text", icon: "type", label: "Text", enabled: false },
  ];

  function maskShapeFor(box) {
    if (!box.mask_shape_id) return null;
    return (project.shapes || []).find((s) => s.id === box.mask_shape_id) || null;
  }

  function checkmark() {
    const check = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    check.setAttribute("class", "font-list-checkmark");
    check.setAttribute("viewBox", "0 0 24 24");
    check.setAttribute("fill", "none");
    check.setAttribute("stroke", "currentColor");
    check.setAttribute("stroke-width", "2");
    check.setAttribute("stroke-linecap", "round");
    check.setAttribute("stroke-linejoin", "round");
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", "M20 6 9 17l-5-5");
    check.appendChild(path);
    return check;
  }

  // Drive the rubylith "what gets cut" preview — previously only panel-shape.js's own
  // select/deselect set this, but a mask shape is no longer independently selectable
  // (mask-list-styling moved its editing inline into this Mask tab). `active` gates it to only
  // the Mask tab itself: this panel's body is built (and this function called) on every render
  // regardless of which of Box/Time/Mask is the visible tab, so without the gate the red overlay
  // stayed on the stage while editing SIZE/POSITION/TIME too. Both preview modules share one
  // BoxMaskRender-backed variable (see mask-shape-active-id.js), so both always receive the same
  // value regardless of which box kind is open. Exposed as `syncActive` so a plain tab switch
  // (no field change, no re-render of this panel's own DOM) can still update it.
  function syncActive(box, active) {
    const shape = box.mask_enabled ? maskShapeFor(box) : null;
    const activeMaskShapeId = active && shape ? shape.id : null;
    VideoBoxPreview.setActiveMaskShapeId(activeMaskShapeId);
    ImageBoxPreview.setActiveMaskShapeId(activeMaskShapeId);
    VideoBoxPreview.render(project.video_boxes, Preview.currentTimelineTime());
    ImageBoxPreview.render(project.image_boxes, Preview.currentTimelineTime());
  }

  function render(container, box, { onChange, getWindow, active }) {
    container.innerHTML = "";
    const shape = box.mask_enabled ? maskShapeFor(box) : null;
    const currentType = shape ? "shape" : "none";

    syncActive(box, !!active);

    // mainEl/drillEl are plain top-level siblings (not grid items of a .style-group), matching
    // #panel-text-main/#panel-text — SubpanelHost's "style-sub-panel" subpage class assumes that
    // unconstrained layout, not a fixed 28px grid track.
    const mainEl = document.createElement("div");
    const drillEl = document.createElement("div");
    container.append(mainEl, drillEl);
    const host = SubpanelHost(mainEl, drillEl);

    // "MASK" lives inside mainEl (not container) so it hides along with the rest of the main
    // view whenever the Mask Type drill-down is open — every other SubpanelHost-backed panel's
    // subpages replace the *entire* tab body, with no static label left showing above the
    // subpage's own back-arrow header; before this fix "MASK" stayed pinned above "< Mask Type",
    // which no other drill-down in the app does.
    const eyebrow = document.createElement("div");
    eyebrow.className = "section-label-spacer text-eyebrow";
    eyebrow.textContent = "MASK";
    mainEl.appendChild(eyebrow);

    const group = document.createElement("div");
    group.className = "style-group";
    mainEl.appendChild(group);

    // ---- "Type" settings row + drill-down list ----------------------------------------------
    async function assignType(kind) {
      if (kind === currentType) { typePage.close(); return; }
      if (kind === "none") {
        box.mask_enabled = false;
        await onChange();
        return;
      }
      const win = getWindow();
      const newShape = maskShapeFor(box) || ShapePanel.createShapeAt({
        x: box.x, y: box.y, width: box.width, height: box.height,
        start: win.start, duration: win.duration,
      });
      box.mask_shape_id = newShape.id;
      box.mask_enabled = true;
      await onChange();
    }

    const typePage = host.page("Mask Type", (bodyEl) => {
      const listEl = document.createElement("ul");
      listEl.className = "font-list";
      bodyEl.appendChild(listEl);
      MASK_TYPES.forEach((t) => {
        const li = document.createElement("li");
        li.className = "font-list-row";
        UI.listRow(li, { subtle: true });
        if (t.enabled) {
          li.addEventListener("click", () => assignType(t.value));
        } else {
          li.classList.add("font-list-row-disabled");
        }

        const nameGroup = document.createElement("span");
        nameGroup.className = "font-list-row-name-group";
        const iconEl = document.createElement("span");
        iconEl.className = "font-list-row-icon";
        iconEl.innerHTML = UI.icon(t.icon, { size: 16 });
        const nameEl = document.createElement("span");
        nameEl.className = "font-list-row-name";
        nameEl.textContent = t.label;
        nameGroup.append(iconEl, nameEl);
        li.appendChild(nameGroup);

        if (t.value === currentType) li.appendChild(checkmark());

        listEl.appendChild(li);
      });
    });

    const typeRowMount = document.createElement("div");
    typeRowMount.className = "col-8";
    group.appendChild(typeRowMount);
    const currentTypeInfo = MASK_TYPES.find((t) => t.value === currentType);
    UI.settingsRow(typeRowMount, { label: "Type", value: currentTypeInfo ? currentTypeInfo.label : "None", onClick: typePage.open });

    // ---- content area — changes to match the current selection ------------------------------
    if (!shape) return;

    // Write-through, not a one-time seed: a mask shape's window always follows its box's.
    const win = getWindow();
    if (shape.start !== win.start || shape.duration !== win.duration) {
      shape.start = win.start;
      shape.duration = win.duration;
      saveProject();
    }

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

  return { render, syncActive };
})();

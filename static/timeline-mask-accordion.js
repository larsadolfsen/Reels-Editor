// Per-lane MASK accordion (layer-masking-system feature): chevron + nested 32px MASK sub-lane
// under a video_box/image_box entry in #row-overlays, showing the assigned mask shape's own
// clickable lane or a "+ Add mask" type gallery that creates one. Module state
// (expandedMaskAccordions) survives across renders. Exposes window.MaskAccordion.{expandedHeightFor,
// attach}, called from static/timeline.js's renderOverlaysRow. Reaches into editor.js's
// project/saveProject/renderTimeline globals at call time, same documented approach as
// static/timeline-overlay-copy-toolbar.js.
(() => {
  const MASK_LANE_HEIGHT = 32; // px, nested mask sub-lane under a video_box/image_box entry
  // ids of video_box/image_box overlay entries whose mask accordion is currently expanded;
  // module-level so it survives across renders, cleared never (an entry that no longer exists
  // just stops showing up in `entries`).
  const expandedMaskAccordions = new Set();

  function videoBoxEnd(v) {
    return v.start + (v.out_point - v.in_point);
  }

  // A video_box/image_box entry's mask shape, if it has one assigned — mirrors the same lookup
  // already duplicated per-file in video-box-preview.js/image-box-preview.js/shape-preview.js.
  function maskShapeFor(project, box) {
    if (!box.mask_shape_id) return null;
    return (project.shapes || []).find((s) => s.id === box.mask_shape_id) || null;
  }

  function addBlock(track, left, width, label, selected, onClick) {
    const div = document.createElement("div");
    div.className = "timeline-block" + (selected ? " selected" : "");
    div.style.left = `${left}px`;
    div.style.width = `${Math.max(width, 4)}px`;
    const span = document.createElement("span");
    span.textContent = label;
    div.appendChild(span);
    div.addEventListener("click", (e) => { e.stopPropagation(); onClick(); });
    track.appendChild(div);
    return div;
  }

  // Extra height (px) renderOverlaysRow's total-height calc must add for every currently
  // expanded video_box/image_box accordion among `entries`.
  function expandedHeightFor(entries) {
    const expandedCount = entries.filter(
      (e) => (e.kind === "video_box" || e.kind === "image_box") && expandedMaskAccordions.has(e.id),
    ).length;
    return expandedCount * MASK_LANE_HEIGHT;
  }

  // Appends the expand/collapse chevron to `laneLabel` and, when expanded, the nested MASK
  // sub-lane (label + track) into `labelContainer`/`row`, for one video_box/image_box entry.
  // `px` is the current pixels-per-second scale, `selected` the timeline's current selection
  // (for the mask shape's own selected-highlight).
  function attach(laneLabel, labelContainer, row, px, selected, project, entry, onSelect) {
    const box = entry.item;
    const expanded = expandedMaskAccordions.has(entry.id);
    const chevron = document.createElement("span");
    chevron.className = "overlay-lane-mask-chevron";
    chevron.innerHTML = UI.icon(expanded ? "chevron-down" : "chevron-right", { size: 12 });
    chevron.title = "Mask";
    chevron.addEventListener("click", (e) => {
      e.stopPropagation();
      if (expanded) expandedMaskAccordions.delete(entry.id); else expandedMaskAccordions.add(entry.id);
      renderTimeline();
    });
    laneLabel.appendChild(chevron);

    if (!expanded) return;

    const maskShape = maskShapeFor(project, box);

    const maskLabel = document.createElement("div");
    maskLabel.className = "row-label overlay-lane-label overlay-lane-label-mask";
    if (maskShape) {
      maskLabel.innerHTML = `<span class="overlay-lane-handle">${UI.icon("venetian-mask", { size: 14 })}</span>`;
      const text = document.createElement("span");
      text.className = "overlay-lane-label-text";
      text.textContent = "MASK";
      text.addEventListener("click", () => onSelect({ type: "shape", item: maskShape }));
      maskLabel.appendChild(text);
    }
    labelContainer.appendChild(maskLabel);

    const maskTrack = document.createElement("div");
    maskTrack.className = "row-track overlay-lane-track overlay-lane-track-mask";
    row.appendChild(maskTrack);

    if (maskShape) {
      const isSel = !!selected && selected.type === "shape" && !!selected.item && selected.item.id === maskShape.id;
      const block = addBlock(maskTrack, maskShape.start * px, maskShape.duration * px, "Mask", isSel,
        () => onSelect({ type: "shape", item: maskShape }));
      block.dataset.blockId = maskShape.id;
    } else {
      const galleryWrap = document.createElement("div");
      galleryWrap.className = "mask-add-gallery-wrap";
      UI.maskTypeGallery(galleryWrap, [{ value: "shape", icon: "square", label: "Shape" }], (kind) => {
        if (kind !== "shape") return;
        const maskDuration = entry.kind === "video_box" ? videoBoxEnd(box) - box.start : box.duration;
        const newShape = ShapePanel.createShapeAt({
          x: box.x, y: box.y, width: box.width, height: box.height, start: box.start,
          duration: maskDuration,
        });
        box.mask_shape_id = newShape.id;
        saveProject();
        onSelect({ type: "shape", item: newShape });
      });
      maskTrack.appendChild(galleryWrap);
    }
  }

  if (typeof window !== "undefined") window.MaskAccordion = { expandedHeightFor, attach };
})();

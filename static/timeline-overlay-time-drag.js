// Drag-to-reposition-in-time for TEXT/IMAGE BOX/VIDEO BOX lanes in the merged overlays row:
// mousedown on a lane's `.timeline-block` (not its `.timeline-resize-handle`, duration resize
// stays wired to timeline-image-resize.js/timeline-text-resize.js) and horizontal drag past a
// 4px threshold shifts that item's `start` (TEXT also shifts `end` by the same delta, preserving
// duration) — new `start` clamps to >= 0, no snapping. Mirrors timeline-clip-drag.js's
// threshold+translateX-follow pattern, but writes an independent timeline position instead of
// reordering a sequence. A locked entry (entry.item.locked) never enters drag-follow at all,
// matching timeline-overlay-layer-drag.js's vertical-grip lock gate. VIDEO BOX is a special case: if the
// drop point lands inside #row-video's bounds, it stitches into the main sequence via the
// existing stitchVideoBoxIntoSequence (same behavior the old native-DnD wiring provided) instead
// of shifting `start` — this replaces static/timeline.js's old draggable/dragstart wiring on the
// VIDEO BOX lane block, so that gesture and this one don't compete on the same element.
// Delegated on #row-overlays itself (persists across renders; only its children are rebuilt by
// Timeline.render), same pattern as timeline-image-resize.js/timeline-clip-drag.js.
// Reaches into editor.js's `project`/`saveProject`/`renderTimeline` globals and
// OverlayLayers.mergedEntries; depends on window.Timeline (PX_PER_SEC) already existing, so this
// file must load after timeline.js and timeline-overlay-layers.js.
(() => {
  const THRESHOLD_PX = 4;

  const row = document.getElementById("row-overlays");

  row.addEventListener("mousedown", (e) => {
    if (e.target.closest(".timeline-resize-handle")) return;
    const blockEl = e.target.closest(".timeline-block");
    if (!blockEl || !blockEl.dataset.blockId) return;
    const blockId = blockEl.dataset.blockId;

    const entry = OverlayLayers.mergedEntries(project).find((en) => en.item.id === blockId);
    // Shapes are permanently excluded (no `locked` field, not requested by the feature) even
    // though they also carry dataset.blockId.
    if (!entry || entry.kind === "shape") return;
    if (entry.item.locked) return;

    const item = entry.item;
    const startX = e.clientX;
    const startStart = item.start;
    const startEnd = entry.kind === "text" ? item.end : null;
    const px = Timeline.PX_PER_SEC;
    let dragging = false;

    const onMove = (moveEvent) => {
      const dx = moveEvent.clientX - startX;
      if (!dragging && Math.abs(dx) > THRESHOLD_PX) {
        dragging = true;
        blockEl.classList.add("dragging");
      }
      if (!dragging) return;
      blockEl.style.transform = `translateX(${dx}px)`;
    };

    const onUp = async (upEvent) => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      blockEl.classList.remove("dragging");
      blockEl.style.transform = "";
      if (!dragging) return;

      if (entry.kind === "video_box") {
        const videoRow = document.getElementById("row-video");
        const videoRect = videoRow.getBoundingClientRect();
        if (upEvent.clientY >= videoRect.top && upEvent.clientY <= videoRect.bottom) {
          const dropTime = Timeline.timeAtX(project.clips, videoRect, upEvent.clientX);
          const wasSelected = selected && selected.type === "video-box" && selected.item && selected.item.id === item.id;
          stitchVideoBoxIntoSequence(item, dropTime);
          await saveProject();
          Preview.load(project);
          renderTimeline();
          if (wasSelected) openFilesPanel(); // the selected box no longer exists
          await runAutoCaption(); // re-transcribes the whole (now-changed) sequence
          return;
        }
      }

      const dx = (upEvent.clientX - startX) / px;
      const newStart = Math.max(0, startStart + dx);
      item.start = newStart;
      if (entry.kind === "text") item.end = newStart + (startEnd - startStart);
      saveProject();
      renderTimeline();
    };

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  });
})();

// Drag-to-reposition-in-time for TEXT/IMAGE BOX/VIDEO BOX lanes in the merged overlays row:
// mousedown on a lane's `.timeline-block` (not its `.timeline-resize-handle`, duration resize
// stays wired to timeline-image-resize.js/timeline-text-resize.js) and drag past a 4px distance
// threshold (both axes count — see below) shifts that item's `start` (TEXT also shifts `end` by
// the same delta, preserving duration) — new `start` clamps to >= 0, no snapping. Mirrors
// timeline-clip-drag.js's threshold+translateX-follow pattern, but writes an independent timeline
// position instead of reordering a sequence. A locked entry (entry.item.locked) never enters
// drag-follow at all, matching timeline-overlay-layer-drag.js's vertical-grip lock gate. VIDEO BOX
// is a special case: if the drop point lands inside #row-video's bounds, it stitches into the main
// sequence via the existing stitchVideoBoxIntoSequence (same behavior the old native-DnD wiring
// provided) instead of shifting `start` — this replaces static/timeline.js's old draggable/dragstart
// wiring on the VIDEO BOX lane block, so that gesture and this one don't compete on the same
// element. The drag-start threshold is a distance check (`Math.hypot(dx, dy)`), not horizontal-only,
// since the natural motion for the stitch gesture is mostly-vertical (down toward the VIDEO row) and
// a horizontal-only check would never cross it; the follow/positional math itself (translateX,
// final `start`) stays purely dx-based for every entry kind, including video_box — only the
// threshold decides whether a drag has started at all.
// Delegated on #row-overlays itself (persists across renders; only its children are rebuilt by
// Timeline.render), same pattern as timeline-image-resize.js/timeline-clip-drag.js.
// Reaches into editor.js's `project`/`selected`/`saveProject`/`renderTimeline`/`openFilesPanel`
// globals, panel-text.js's `renderTextPanel`, panel-image-box.js's `ImageBoxPanel.render`,
// panel-video-box.js's `VideoBoxPanel.render`, and OverlayLayers.mergedEntries; depends on
// window.Timeline (PX_PER_SEC) already existing, so this file must load after timeline.js and
// timeline-overlay-layers.js.
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
    const startY = e.clientY;
    const startStart = item.start;
    const startEnd = entry.kind === "text" ? item.end : null;
    const px = Timeline.PX_PER_SEC;
    let dragging = false;
    let clickListenerAttached = false;

    // The browser still dispatches a synthetic "click" after a real mousedown+move+mouseup, even
    // though the pointer moved — that click would otherwise reach the block's own click-to-select
    // listener (static/timeline.js's addBlock's `div.addEventListener("click", ...)`, registered
    // directly on this same element) and, for a video_box drag that stitched (deleting the box),
    // could fire mid-await with a now-deleted item, re-opening a panel for it. A capture-phase
    // listener registered on the SAME element runs before that bubble-phase listener regardless of
    // registration order (capture always precedes bubble at the target itself), so
    // stopPropagation() here reliably suppresses it before it ever runs.
    const suppressClick = (clickEvent) => {
      clickEvent.stopPropagation();
    };

    const onMove = (moveEvent) => {
      const dx = moveEvent.clientX - startX;
      const dy = moveEvent.clientY - startY;
      if (!dragging && Math.hypot(dx, dy) > THRESHOLD_PX) {
        dragging = true;
        blockEl.classList.add("dragging");
        blockEl.addEventListener("click", suppressClick, { capture: true, once: true });
        clickListenerAttached = true;
      }
      if (!dragging) return;
      blockEl.style.transform = `translateX(${dx}px)`;
    };

    const onUp = async (upEvent) => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      blockEl.classList.remove("dragging");
      blockEl.style.transform = "";
      // Safety net: if the synthetic click never fires this turn (e.g. the browser suppresses it
      // entirely for some input path), drop the listener so it doesn't linger and swallow a later,
      // unrelated real click on this element.
      if (clickListenerAttached) {
        setTimeout(() => blockEl.removeEventListener("click", suppressClick, { capture: true }), 0);
      }
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

      // Refresh whichever panel is currently open for the dragged item, mirroring
      // timeline-image-resize.js's/timeline-text-resize.js's post-drop panel re-render.
      if (entry.kind === "text" && selected && selected.type === "text" && selected.item && selected.item.id === blockId) {
        renderTextPanel();
      } else if (entry.kind === "image_box" && selected && selected.type === "image-box" && selected.item && selected.item.id === blockId) {
        ImageBoxPanel.render(blockId);
      } else if (entry.kind === "video_box" && selected && selected.type === "video-box" && selected.item && selected.item.id === blockId) {
        VideoBoxPanel.render(selected.item.id);
      }
    };

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  });
})();

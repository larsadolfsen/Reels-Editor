// Stage preview for image-box (picture-in-picture) layers: mounts one <img> element per
// visible box into #overlay (a sibling of preview.js's text-block divs and
// video-box-preview.js's <video>s — all three set an explicit CSS z-index from their model's
// z_index so stacking follows the project's cross-layer z-order), keeps each element's
// position/size in sync with the timeline clock, and wires drag-to-move (UI.videoBoxDrag)/
// resize (UI.resizeHandles) onto the selected box. Exposes
// window.ImageBoxPreview.{render, setSelectedImageBox, setOnActivate}. No playback sync needed
// (static image) — simpler than video-box-preview.js's currentTime/play/pause handling.
window.ImageBoxPreview = (() => {
  const overlay = document.getElementById("overlay");
  const mounted = new Map(); // boxId -> <img>
  const handlesDestroyers = new Map(); // boxId -> () => void, for resize/drag cleanup
  let selectedBoxId = null;
  let callbacks = null;
  let onActivate = null; // (boxId) => void, fired by a plain click on an unselected box in Select mode

  function boxEnd(b) {
    return b.start + b.duration;
  }

  function mountHandles(boxId, img, b) {
    if (handlesDestroyers.has(boxId)) return; // already mounted for this element
    const destroyDrag = UI.videoBoxDrag(img, {
      onMove: (delta) => { if (callbacks && callbacks.onMove) callbacks.onMove(delta); },
      onMoveEnd: (delta) => { if (callbacks && callbacks.onMoveEnd) callbacks.onMoveEnd(delta); },
    });
    const destroyResize = UI.resizeHandles(img, {
      getSize: () => ({ width: img.offsetWidth, height: img.offsetHeight }),
      onResize: (size) => { if (callbacks && callbacks.onResize) callbacks.onResize(size); },
      onDragEnd: (size) => { if (callbacks && callbacks.onDragEnd) callbacks.onDragEnd(size); },
    });
    handlesDestroyers.set(boxId, () => { destroyDrag(); destroyResize(); });
  }

  function unmountHandles(boxId) {
    const destroy = handlesDestroyers.get(boxId);
    if (destroy) { destroy(); handlesDestroyers.delete(boxId); }
  }

  function render(imageBoxes, timelineTime) {
    const activeIds = new Set();
    const stageW = overlay.clientWidth || 1;
    const stageH = overlay.clientHeight || 1;

    for (const b of imageBoxes) {
      // The selected box always renders (even outside its time window) so it stays clickable
      // to reposition/resize, matching video-box-preview.js's treatment of the selected box.
      const visible = (b.start <= timelineTime && timelineTime < boxEnd(b)) || b.id === selectedBoxId;
      if (!visible) continue;
      activeIds.add(b.id);

      let img = mounted.get(b.id);
      if (!img) {
        img = document.createElement("img");
        img.className = "image-box";
        img.src = "/media?path=" + encodeURIComponent(b.file_path);
        img.style.pointerEvents = "auto";
        // Click-to-select (mirrors video-box-preview.js): a plain click on a not-yet-selected
        // box selects it, Select-tool only. In Text-tool mode this no-ops so the click bubbles
        // to #stage's click listener (stage-click-router.js) and is treated as insert-text-here.
        img.addEventListener("click", () => {
          if (b.id === selectedBoxId) return;
          if (!window.ToolMode || ToolMode.get() !== "select") return;
          if (onActivate) onActivate(b.id);
        });
        overlay.appendChild(img);
        mounted.set(b.id, img);
      }

      img.style.left = (b.x / 1080 * stageW) + "px";
      img.style.top = (b.y / 1920 * stageH) + "px";
      img.style.width = (b.width / 1080 * stageW) + "px";
      img.style.height = (b.height / 1920 * stageH) + "px";
      img.style.zIndex = String(b.z_index);

      if (b.id === selectedBoxId && callbacks) mountHandles(b.id, img, b);
      else unmountHandles(b.id);
    }

    for (const [id, img] of mounted) {
      if (!activeIds.has(id)) {
        unmountHandles(id);
        img.remove();
        mounted.delete(id);
      }
    }
  }

  function setSelectedImageBox(boxId, cb) {
    if (selectedBoxId && selectedBoxId !== boxId) unmountHandles(selectedBoxId);
    selectedBoxId = boxId;
    callbacks = cb || null;
  }

  function setOnActivate(fn) {
    onActivate = fn || null;
  }

  return { render, setSelectedImageBox, setOnActivate };
})();

// Stage preview for video-box (picture-in-picture) layers: mounts one <video> element per
// visible box into #overlay (a sibling of preview.js's text-block divs — both set an explicit
// CSS z-index from their model's z_index so stacking follows the project's cross-layer
// z-order), keeps each element's position/size/currentTime in sync with the timeline clock,
// and wires drag-to-move (UI.videoBoxDrag)/resize (UI.resizeHandles) onto the selected box.
// Exposes window.VideoBoxPreview.{render, setSelectedVideoBox}. Muted always (no PiP audio).
window.VideoBoxPreview = (() => {
  const overlay = document.getElementById("overlay");
  const mounted = new Map(); // boxId -> <video>
  const handlesDestroyers = new Map(); // boxId -> () => void, for resize/drag cleanup
  let selectedBoxId = null;
  let callbacks = null;

  function boxEnd(v) {
    return v.start + (v.out_point - v.in_point);
  }

  function mountHandles(boxId, video, v) {
    if (handlesDestroyers.has(boxId)) return; // already mounted for this element
    const destroyDrag = UI.videoBoxDrag(video, {
      onMove: (delta) => { if (callbacks && callbacks.onMove) callbacks.onMove(delta); },
      onMoveEnd: (delta) => { if (callbacks && callbacks.onMoveEnd) callbacks.onMoveEnd(delta); },
    });
    const destroyResize = UI.resizeHandles(video, {
      getSize: () => ({ width: video.offsetWidth, height: video.offsetHeight }),
      onResize: (size) => { if (callbacks && callbacks.onResize) callbacks.onResize(size); },
      onDragEnd: (size) => { if (callbacks && callbacks.onDragEnd) callbacks.onDragEnd(size); },
    });
    handlesDestroyers.set(boxId, () => { destroyDrag(); destroyResize(); });
  }

  function unmountHandles(boxId) {
    const destroy = handlesDestroyers.get(boxId);
    if (destroy) { destroy(); handlesDestroyers.delete(boxId); }
  }

  function render(videoBoxes, timelineTime) {
    const activeIds = new Set();
    const stageW = overlay.clientWidth || 1;
    const stageH = overlay.clientHeight || 1;

    for (const v of videoBoxes) {
      // The selected box always renders (even outside its time window) so it stays clickable
      // to reposition/resize, matching how preview.js treats the selected text block.
      const visible = (v.start <= timelineTime && timelineTime < boxEnd(v)) || v.id === selectedBoxId;
      if (!visible) continue;
      activeIds.add(v.id);

      let video = mounted.get(v.id);
      if (!video) {
        video = document.createElement("video");
        video.className = "video-box";
        video.muted = true;
        video.src = "/media?path=" + encodeURIComponent(v.file_path);
        video.style.pointerEvents = "auto";
        overlay.appendChild(video);
        mounted.set(v.id, video);
      }

      video.style.left = (v.x / 1080 * stageW) + "px";
      video.style.top = (v.y / 1920 * stageH) + "px";
      video.style.width = (v.width / 1080 * stageW) + "px";
      video.style.height = (v.height / 1920 * stageH) + "px";
      video.style.zIndex = String(v.z_index);

      const inWindow = v.start <= timelineTime && timelineTime < boxEnd(v);
      if (inWindow) {
        const srcTime = v.in_point + (timelineTime - v.start);
        if (Math.abs(video.currentTime - srcTime) > 0.15) video.currentTime = srcTime;
        if (video.paused) video.play().catch(() => {});
      } else {
        if (!video.paused) video.pause();
      }

      if (v.id === selectedBoxId && callbacks) mountHandles(v.id, video, v);
      else unmountHandles(v.id);
    }

    for (const [id, video] of mounted) {
      if (!activeIds.has(id)) {
        unmountHandles(id);
        video.remove();
        mounted.delete(id);
      }
    }
  }

  function setSelectedVideoBox(boxId, cb) {
    if (selectedBoxId && selectedBoxId !== boxId) unmountHandles(selectedBoxId);
    selectedBoxId = boxId;
    callbacks = cb || null;
  }

  return { render, setSelectedVideoBox };
})();

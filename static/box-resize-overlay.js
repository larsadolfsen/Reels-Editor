// Shared drag-resize handle overlay for video/image PiP boxes (mirrors box-mask-render.js's
// rubylith overlay, same box-agnostic keyed-by-id pattern): UI.resizeHandles appends its handle
// divs as children of the container it's given, but a <video>/<img> is a replaced element and
// never paints DOM children — appending handles directly onto the box element (the old approach)
// left them in the DOM but invisible and unreachable. This instead maintains a sibling <div>
// positioned to match the box element's own left/top/width/height and hosts the resize handles
// there, appended straight into #overlay so it's never clipped by the box element's own bounds.
// Exposes window.BoxResizeOverlay.{mount(boxId, el, callbacks), sync(boxId, el), unmount(boxId)}.
window.BoxResizeOverlay = (() => {
  const overlayRoot = document.getElementById("overlay");
  const overlays = new Map(); // boxId -> { div, destroyResize }

  function positionToMatch(div, el) {
    div.style.left = el.style.left;
    div.style.top = el.style.top;
    div.style.width = el.style.width;
    div.style.height = el.style.height;
  }

  function mount(boxId, el, { onResize, onDragEnd }) {
    if (overlays.has(boxId)) return; // already mounted for this box
    const div = document.createElement("div");
    div.className = "box-resize-overlay";
    positionToMatch(div, el);
    overlayRoot.appendChild(div);
    const destroyResize = UI.resizeHandles(div, {
      getSize: () => ({ width: el.offsetWidth, height: el.offsetHeight }),
      onResize: (size) => { if (onResize) onResize(size); },
      onDragEnd: (size) => { if (onDragEnd) onDragEnd(size); },
    });
    overlays.set(boxId, { div, destroyResize });
  }

  // Keeps the overlay's rect in sync with its box element on every render — mount() only ever
  // runs once per selection, but the box element's position/size changes on every drag/resize.
  function sync(boxId, el) {
    const entry = overlays.get(boxId);
    if (entry) positionToMatch(entry.div, el);
  }

  function unmount(boxId) {
    const entry = overlays.get(boxId);
    if (entry) { entry.destroyResize(); entry.div.remove(); overlays.delete(boxId); }
  }

  return { mount, sync, unmount };
})();

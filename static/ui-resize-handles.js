// Reusable presentational UI helper, framework-free. Attaches to window.UI.
// Depends on the .resize-handles CSS component. No app state — callers own data.
window.UI = window.UI || {};

// Renders 8 drag handles (corners + edge midpoints) into `container` (must be position:relative
// or position:absolute, sized to the element being resized). getSize() supplies the starting
// {width, height} in px so drags apply relative to the drag's start (not accumulated error-prone
// deltas). onResize({width, height, edge, startWidth, startHeight}) fires live during drag;
// onDragEnd(same shape) fires once on mouseup. `edge` (e.g. "e", "nw") is which handle is being
// dragged — a west/north drag only changes width/height here, anchored at the container's own
// top-left corner; callers whose box has a real x/y position must shift it by (oldSize - newSize)
// on the w/n axes so the OPPOSITE edge stays fixed and the box visibly grows in the direction the
// user is dragging, rather than always growing rightward/downward regardless of which handle was
// grabbed — see static/resize-anchor.js. `startWidth`/`startHeight` are the box's own size from
// getSize() at the moment this drag began (not the caller's own model field, which may be stale —
// e.g. a TEXT block still in "fit" auto-size mode has no meaningful box_width/box_height of its
// own yet), so callers should anchor against these rather than re-deriving "old size" themselves.
// Returns a destroy() that removes the handles and any pending listeners.
window.UI.resizeHandles = function resizeHandles(container, { getSize, onResize, onDragEnd }) {
  const wrap = document.createElement("div");
  wrap.className = "resize-handles";

  const EDGES = ["n", "s", "e", "w", "ne", "nw", "se", "sw"];
  EDGES.forEach((edge) => {
    const el = document.createElement("div");
    el.className = `resize-handle resize-handle-${edge}`;
    el.addEventListener("mousedown", (e) => startDrag(edge, e));
    wrap.appendChild(el);
  });

  let dragState = null;

  function startDrag(edge, e) {
    e.preventDefault();
    e.stopPropagation();
    const { width, height } = getSize();
    dragState = { edge, startX: e.clientX, startY: e.clientY, startWidth: width, startHeight: height };
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }

  function sizeFromDrag(dx, dy) {
    const { edge, startWidth, startHeight } = dragState;
    let width = startWidth, height = startHeight;
    if (edge.includes("e")) width = startWidth + dx;
    if (edge.includes("w")) width = startWidth - dx;
    if (edge.includes("s")) height = startHeight + dy;
    if (edge.includes("n")) height = startHeight - dy;
    return {
      width: Math.max(1, Math.round(width)),
      height: Math.max(1, Math.round(height)),
      edge,
      startWidth,
      startHeight,
    };
  }

  function onMouseMove(e) {
    if (!dragState) return;
    onResize(sizeFromDrag(e.clientX - dragState.startX, e.clientY - dragState.startY));
  }

  function onMouseUp(e) {
    if (!dragState) return;
    const size = sizeFromDrag(e.clientX - dragState.startX, e.clientY - dragState.startY);
    dragState = null;
    document.removeEventListener("mousemove", onMouseMove);
    document.removeEventListener("mouseup", onMouseUp);
    onDragEnd(size);
  }

  container.appendChild(wrap);
  return () => {
    wrap.remove();
    document.removeEventListener("mousemove", onMouseMove);
    document.removeEventListener("mouseup", onMouseUp);
  };
};

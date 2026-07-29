// Reusable stage interaction: a draggable straight-line guide for a box's edge mask. Renders an
// SVG line (drag it to shift mask_offset) with a round end handle (drag it to change mask_angle)
// over a box's on-stage rect. Presentational only — the caller owns the data and persistence.
window.UI = window.UI || {};

// overlay: the #overlay element the guide mounts into.
// getRect(): {left, top, width, height} — the box's on-stage rect in px.
// getMask(): {angle, offset} — degrees and signed CANVAS px, straight off the box model.
// onChange({angle, offset}): fires live during a drag. onChangeEnd({angle, offset}): on mouseup.
// Returns destroy(), which removes the guide and any pending document listeners.
window.UI.maskLineDrag = function maskLineDrag(overlay, { getRect, getMask, onChange, onChangeEnd }) {
  const SVG_NS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("class", "mask-line-guide");
  const line = document.createElementNS(SVG_NS, "line");
  line.setAttribute("class", "mask-line-guide-line");
  const handle = document.createElementNS(SVG_NS, "circle");
  handle.setAttribute("class", "mask-line-guide-handle");
  handle.setAttribute("r", "7");
  svg.appendChild(line);
  svg.appendChild(handle);
  overlay.appendChild(svg);

  let drag = null; // {mode: "offset"|"angle", startX, startY, startOffset}

  // Canvas px per on-stage px — the stage renders the whole 1080-wide canvas across its width.
  function canvasPerStage() {
    return 1080 / (overlay.clientWidth || 1);
  }

  function geometry() {
    const rect = getRect();
    const { angle, offset } = getMask();
    const theta = angle * Math.PI / 180;
    const n = { x: Math.cos(theta), y: Math.sin(theta) };   // line normal
    const d = { x: -n.y, y: n.x };                          // along the line
    const offStage = offset / canvasPerStage();
    const cx = rect.width / 2 + n.x * offStage;
    const cy = rect.height / 2 + n.y * offStage;
    const len = rect.width + rect.height;                   // longer than any chord; SVG clips it
    return { rect, n, d, cx, cy, len };
  }

  function render() {
    const { rect, d, cx, cy, len } = geometry();
    svg.style.left = rect.left + "px";
    svg.style.top = rect.top + "px";
    svg.setAttribute("width", rect.width);
    svg.setAttribute("height", rect.height);
    svg.setAttribute("viewBox", `0 0 ${rect.width} ${rect.height}`);
    line.setAttribute("x1", cx - d.x * len);
    line.setAttribute("y1", cy - d.y * len);
    line.setAttribute("x2", cx + d.x * len);
    line.setAttribute("y2", cy + d.y * len);
    const reach = Math.max(24, Math.min(rect.width, rect.height) * 0.35);
    handle.setAttribute("cx", cx + d.x * reach);
    handle.setAttribute("cy", cy + d.y * reach);
  }

  function startDrag(mode, e) {
    e.preventDefault();
    e.stopPropagation();
    drag = { mode, startX: e.clientX, startY: e.clientY, startOffset: getMask().offset };
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }

  function maskFromEvent(e) {
    const { n, cx, cy } = geometry();
    const { angle } = getMask();
    if (drag.mode === "offset") {
      // Only motion along the line's normal moves the cut; motion along the line does nothing.
      const along = (e.clientX - drag.startX) * n.x + (e.clientY - drag.startY) * n.y;
      return { angle, offset: drag.startOffset + along * canvasPerStage() };
    }
    // Angle: the vector from the line's own center to the pointer defines the line direction
    // d = (-sin, cos), so theta = atan2(-v.x, v.y).
    const svgBox = svg.getBoundingClientRect();
    const vx = (e.clientX - svgBox.left) - cx;
    const vy = (e.clientY - svgBox.top) - cy;
    if (vx === 0 && vy === 0) return { angle, offset: drag.startOffset };
    const deg = Math.atan2(-vx, vy) * 180 / Math.PI;
    return { angle: Math.round((((deg % 360) + 360) % 360) * 10) / 10, offset: drag.startOffset };
  }

  function onMouseMove(e) {
    if (!drag) return;
    onChange(maskFromEvent(e));
  }

  function onMouseUp(e) {
    if (!drag) return;
    const mask = maskFromEvent(e);
    drag = null;
    document.removeEventListener("mousemove", onMouseMove);
    document.removeEventListener("mouseup", onMouseUp);
    onChangeEnd(mask);
  }

  line.addEventListener("mousedown", (e) => startDrag("offset", e));
  handle.addEventListener("mousedown", (e) => startDrag("angle", e));

  render();
  return {
    render,
    destroy() {
      svg.remove();
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    },
  };
};

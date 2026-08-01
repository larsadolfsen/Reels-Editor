// Pure aspect-ratio lock for a resize drag, shared by VIDEO BOX and IMAGE BOX (both aspect-locked;
// SHAPE and TEXT resize free-form, no caller there). Given the box's current {width, height} and a
// candidate new size (already scaled to canvas px), returns a same-ratio {width, height}.
//
// The driver axis — which dimension the drag actually changed, and which is derived from it via
// the ratio — is picked from `edge`, not by comparing the candidate size back to the box's own
// current size: a pure "n"/"s" edge drag intentionally leaves size.width equal to the box's own
// width, but round-tripping it through the live stage-px<->canvas-px scale conversion can land it
// off by a rounding pixel, which used to flip an equality-based driver check onto the wrong axis —
// exactly the "dragging north also yanks the box sideways / a plain west drag moves the top edge"
// bug this replaces. A corner edge (both a horizontal and vertical letter) has no single driver
// from the edge alone, since sizeFromDrag (ui-resize-handles.js) computes both axes independently
// there — falls back to whichever axis actually differs from the box's own current size.
(() => {
  function apply(from, size, edge) {
    const ratio = from.width / from.height;
    const horizontal = /[ew]/.test(edge);
    const vertical = /[ns]/.test(edge);
    const widthDrives = horizontal && !vertical ? true
      : vertical && !horizontal ? false
      : size.width !== from.width;
    return widthDrives
      ? { width: size.width, height: Math.round(size.width / ratio) }
      : { width: Math.round(size.height * ratio), height: size.height };
  }

  const api = { apply };
  if (typeof window !== "undefined") window.AspectLock = api;
  if (typeof module !== "undefined") module.exports = api;
})();

// Reusable stage interaction: click-to-edit a contentEditable element, click-drag over glyphs to
// perform a native text selection (reported via onSelectionChange, for rich-text range formatting),
// or click-drag over empty box padding to move the element. Mirrors ui-resize-handles.js's shape (a
// standalone interaction handler preview.js mounts/unmounts per-element via a callback object).
// Returns { enterEditMode } so a caller can programmatically enter edit mode (e.g. immediately
// after creating a new text block), not just on user click.
// isPlaceholder skips the glyph hit-test entirely: placeholder text isn't real content to select
// or format, and classifying it as a glyph made any click on it fragile (native text-selection
// treats the smallest mouse jitter as a drag, so the click silently fails to enter edit mode
// instead of always landing on the padding/click-vs-move threshold logic below).
// Tool-mode gating (added 2026-07-24, top-toolbar): a plain click only enters edit mode when the
// active tool (window.ToolMode) is "text". Outside Text mode (i.e. in Select mode), a plain click
// fires onSelectClick instead (select-without-edit), and glyph hit-testing/native text-selection
// is skipped entirely — every mousedown is treated as the box-move drag branch, so dragging still
// moves the box regardless of tool, only the plain-click outcome differs. enterEditMode() itself
// (the returned handle) is NOT gated — a caller invoking it programmatically always enters edit
// mode, tool mode notwithstanding.
window.UI = window.UI || {};

window.UI.textInteraction = function textInteraction(div, { onEditStart, onInput, onEditEnd, onMove, onMoveEnd, onSelectionChange, onSelectClick, isPlaceholder } = {}) {
  function enterEditMode() {
    if (div.contentEditable === "true") return;
    div.contentEditable = "true";
    div.focus();
    if (onEditStart) onEditStart();
    const onInputEvt = () => { if (onInput) onInput(div.textContent); };
    const onBlur = () => {
      div.removeEventListener("input", onInputEvt);
      div.removeEventListener("blur", onBlur);
      div.contentEditable = "false";
      if (onEditEnd) onEditEnd(div.textContent);
    };
    div.addEventListener("input", onInputEvt);
    div.addEventListener("blur", onBlur);
  }

  function isTextToolActive() {
    return !window.ToolMode || window.ToolMode.get() === "text";
  }

  function handlePlainClick() {
    if (isTextToolActive()) enterEditMode();
    else if (onSelectClick) onSelectClick();
  }

  div.addEventListener("mousedown", (e) => {
    if (e.target.closest(".resize-handle")) return; // let resize handles work unmodified
    if (div.contentEditable === "true") return; // already editing, let native caret placement work

    if (!isPlaceholder && isTextToolActive() && UI.rangeContainsPoint(div, e.clientX, e.clientY)) {
      // Landed on a glyph while the Text tool is active: let the browser's native text-selection
      // drag run completely unmodified (no preventDefault, no custom mousemove tracking) and
      // classify the outcome on mouseup — a real drag produces a non-collapsed selection
      // (format-range intent), a plain click leaves it collapsed (edit intent, same as before).
      const onMouseUp = () => {
        document.removeEventListener("mouseup", onMouseUp);
        const offsets = UI.textSelectionOffsets(div);
        if (offsets && offsets.end > offsets.start) {
          if (onSelectionChange) onSelectionChange(offsets);
        } else {
          handlePlainClick();
        }
      };
      document.addEventListener("mouseup", onMouseUp);
      return;
    }

    // Landed on empty box padding — or the Select tool is active, so glyphs are treated the same
    // as padding: box-move drag, unchanged from Phase 1.
    e.preventDefault();
    const startX = e.clientX, startY = e.clientY;
    let moved = false;
    const onMouseMove = (moveEvent) => {
      const dx = moveEvent.clientX - startX, dy = moveEvent.clientY - startY;
      if (!moved && Math.hypot(dx, dy) > 4) moved = true;
      if (moved && onMove) onMove({ dx, dy });
    };
    const onMouseUp = (upEvent) => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      if (moved) {
        const dx = upEvent.clientX - startX, dy = upEvent.clientY - startY;
        if (onMoveEnd) onMoveEnd({ dx, dy });
      } else {
        handlePlainClick();
      }
    };
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  });

  return { enterEditMode };
};

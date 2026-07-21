// Reusable stage interaction: click-to-edit a contentEditable element, click-drag over glyphs to
// perform a native text selection (reported via onSelectionChange, for rich-text range formatting),
// or click-drag over empty box padding to move the element. Mirrors ui-resize-handles.js's shape (a
// standalone interaction handler preview.js mounts/unmounts per-element via a callback object).
// Returns { enterEditMode } so a caller can programmatically enter edit mode (e.g. immediately
// after creating a new text block), not just on user click.
window.UI = window.UI || {};

window.UI.textInteraction = function textInteraction(div, { onEditStart, onInput, onEditEnd, onMove, onMoveEnd, onSelectionChange } = {}) {
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

  div.addEventListener("mousedown", (e) => {
    if (e.target.closest(".resize-handle")) return; // let resize handles work unmodified
    if (div.contentEditable === "true") return; // already editing, let native caret placement work

    if (UI.rangeContainsPoint(div, e.clientX, e.clientY)) {
      // Landed on a glyph: let the browser's native text-selection drag run completely
      // unmodified (no preventDefault, no custom mousemove tracking) and classify the
      // outcome on mouseup — a real drag produces a non-collapsed selection (format-range
      // intent), a plain click leaves it collapsed (edit intent, same as before).
      const onMouseUp = () => {
        document.removeEventListener("mouseup", onMouseUp);
        const offsets = UI.textSelectionOffsets(div);
        if (offsets && offsets.end > offsets.start) {
          if (onSelectionChange) onSelectionChange(offsets);
        } else {
          enterEditMode();
        }
      };
      document.addEventListener("mouseup", onMouseUp);
      return;
    }

    // Landed on empty box padding: box-move drag, unchanged from Phase 1.
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
        enterEditMode();
      }
    };
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  });

  return { enterEditMode };
};

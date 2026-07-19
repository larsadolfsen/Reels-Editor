// Reusable stage interaction: click-and-drag-to-move an element, no edit-mode distinction
// (unlike ui-text-interaction.js, a video box has nothing to "enter edit mode" into — any
// drag is always a move). Mirrors ui-resize-handles.js/ui-text-interaction.js's shape.
window.UI = window.UI || {};

window.UI.videoBoxDrag = function videoBoxDrag(div, { onMove, onMoveEnd }) {
  function onMouseDown(e) {
    if (e.target.closest(".resize-handle")) return; // let resize handles work unmodified
    e.preventDefault();
    const startX = e.clientX, startY = e.clientY;
    const onMouseMove = (moveEvent) => {
      onMove({ dx: moveEvent.clientX - startX, dy: moveEvent.clientY - startY });
    };
    const onMouseUp = (upEvent) => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      onMoveEnd({ dx: upEvent.clientX - startX, dy: upEvent.clientY - startY });
    };
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }
  div.addEventListener("mousedown", onMouseDown);
  return () => div.removeEventListener("mousedown", onMouseDown);
};

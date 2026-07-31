// Routes clicks on the stage background to the active tool (window.ToolMode, top-toolbar
// feature, added 2026-07-24). In Text-tool mode, a click anywhere on #stage that ISN'T an
// existing .text-block (a video box counts as "anywhere else", per the top-toolbar design spec:
// clicking a video box in Text mode inserts text on top of it) inserts a new text block centered
// at the click point and drops the tool back to Select afterward (Figma/Canva-style "insert
// once, then select"). Clicks on an existing .text-block are left entirely to
// ui-text-interaction.js's own click handling (edit-mode entry) — this listener still receives
// that click too (it bubbles up from the block), so it must ignore it explicitly rather than
// relying on event.stopPropagation() anywhere upstream. In Select-tool and Shape-tool modes this
// file does nothing at all (Shape's own drag gesture is stage-shape-draw.js). Depends on
// window.ToolMode, window.CanvasPoint (canvas-point.js), and on panel-text.js's
// addTextBlockAndEdit() / editor.js's project global — classic-script globals resolved at click
// time, not at this script's load time, so load order relative to those files doesn't matter.

document.getElementById("stage").addEventListener("click", (e) => {
  if (!window.ToolMode || ToolMode.get() !== "text") return;
  if (e.target.closest(".text-block")) return; // let the block's own click-to-edit handle it
  const rect = document.getElementById("overlay").getBoundingClientRect();
  const point = CanvasPoint.fromClient(e.clientX, e.clientY, rect);
  // Revert to Select before the (async) insert resolves, not after — a second click landing
  // while addTextBlockAndEdit is still in flight must see "select" already, or it would start a
  // second concurrent insert. enterEditMode() is never tool-gated, so reverting early doesn't
  // block the new block from still opening in edit mode.
  ToolMode.set("select");
  addTextBlockAndEdit(point);
});

// Routes clicks on the stage background to the active tool (window.ToolMode, top-toolbar
// feature, added 2026-07-24). In Text-tool mode, a click anywhere on #stage that ISN'T an
// existing .text-block (a video box counts as "anywhere else", per the top-toolbar design spec:
// clicking a video box in Text mode inserts text on top of it) inserts a new text block centered
// at the click point and drops the tool back to Select afterward (Figma/Canva-style "insert
// once, then select"). Clicks on an existing .text-block are left entirely to
// ui-text-interaction.js's own click handling (edit-mode entry) — this listener still receives
// that click too (it bubbles up from the block), so it must ignore it explicitly rather than
// relying on event.stopPropagation() anywhere upstream. In Select-tool mode this file does
// nothing at all. Depends on window.ToolMode and on panel-text.js's addTextBlockAndEdit() /
// editor.js's project global — classic-script globals resolved at click time, not at this
// script's load time, so load order relative to those files doesn't matter.

// Converts a mouse event's client coordinates into the 1080x1920 canvas coordinate space used by
// TextPreset.x/y, clamped to the canvas bounds. Pure given `rect` (the overlay's bounding rect).
function canvasPointFromClient(clientX, clientY, rect) {
  const x = Math.round((clientX - rect.left) / rect.width * 1080);
  const y = Math.round((clientY - rect.top) / rect.height * 1920);
  return { x: Math.max(0, Math.min(1080, x)), y: Math.max(0, Math.min(1920, y)) };
}

document.getElementById("stage").addEventListener("click", async (e) => {
  if (!window.ToolMode || ToolMode.get() !== "text") return;
  if (e.target.closest(".text-block")) return; // let the block's own click-to-edit handle it
  const rect = document.getElementById("overlay").getBoundingClientRect();
  const point = canvasPointFromClient(e.clientX, e.clientY, rect);
  await addTextBlockAndEdit(point);
  ToolMode.set("select");
});

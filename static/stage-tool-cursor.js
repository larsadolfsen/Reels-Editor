// Mirrors the active tool (window.ToolMode) onto #stage as a `data-tool` attribute, so stage
// cursors can be plain CSS state (stage.css) that follows a tool switch immediately, instead of
// inline styles that would only update on the next re-render.
const stageToolCursorEl = document.getElementById("stage");
stageToolCursorEl.dataset.tool = ToolMode.get();
ToolMode.onChange((mode) => { stageToolCursorEl.dataset.tool = mode; });

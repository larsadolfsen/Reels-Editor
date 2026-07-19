### Task 5: Video-box drag-to-move interaction component

**Status:** not started

**Depends on:** none (pure DOM component, no project-data knowledge). Independent of every other task — dispatch in parallel.

This project has no JS unit-test framework (only `pytest` for the Python backend — see `CLAUDE.md`'s Run commands). Existing components with this same shape (`static/ui-resize-handles.js`, `static/ui-text-interaction.js`) have no test files either; verification for this task is manual, in the browser.

**Files:**
- Create: `static/ui-video-box-drag.js`

**Interfaces:**
- Produces: `window.UI.videoBoxDrag(div, { onMove, onMoveEnd }) -> void`. `onMove({dx, dy})` fires on every `mousemove` during a drag (live preview); `onMoveEnd({dx, dy})` fires once on `mouseup` (persist). Ignores mousedowns that start on a `.resize-handle` descendant, so it coexists on the same element as `UI.resizeHandles` without stealing its drag. Consumed by Task 6's `static/video-box-preview.js`.

- [ ] **Step 1: Create the component**

Create `static/ui-video-box-drag.js`:

```js
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
```

- [ ] **Step 2: Manual verification (standalone smoke test)**

Since this component has no consumer yet (Task 6 wires it up), verify it loads without a syntax error: start the dev server, open the browser console, and confirm `window.UI.videoBoxDrag` is a function (`typeof UI.videoBoxDrag === "function"` in the console returns `true`). Full drag behavior is verified visually once Task 6/8/10 wire it onto an actual video box element.

- [ ] **Step 3: Commit**

```bash
git add static/ui-video-box-drag.js
git commit -m "feat: add UI.videoBoxDrag click-and-drag-to-move interaction component"
```

**Next session:** This task is independent and complete on its own. If continuing in the same session, move to Task 6 (`docs/superpowers/plans/2026-07-19-phase-3-video-box/task-6-video-box-preview.md`), which consumes this component's `UI.videoBoxDrag` signature. If dispatching separately, this should be subagent-driven with the same prompt shape as the other Batch 2 tasks.

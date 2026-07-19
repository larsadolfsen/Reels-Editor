### Task 9: LAYERS panel (drag-to-reorder z-index)

**Status:** not started

**Depends on:** Task 1 (merged, `z_index` fields) and Task 2 (merged, DOM id `layers-list`). Reuses existing globals: `project`, `saveProject()`, `renderTimeline()` (editor.js). Independent of Tasks 3–8.

**Files:**
- Create: `static/panel-layers.js`
- Create: `static/css/components/layers-panel.css`

**Interfaces:**
- Consumes: `project.text_blocks[].z_index`, `project.video_boxes[].z_index` (Task 1).
- Produces: `window.LayersPanel.render() -> void`. Consumed by Task 10's `editor.js` (`openLayersPanel()`).

- [ ] **Step 1: Create static/panel-layers.js**

Create `static/panel-layers.js`:

```js
// #panel-layers context-panel section: every text block + video box in one drag-and-drop
// reorderable list, sorted by z_index descending (top row = highest z_index = frontmost).
// Dropping a row renumbers every entry's z_index to match the new order. Exposes
// window.LayersPanel.render(). Plain HTML5 drag-and-drop, no new dependency.
window.LayersPanel = window.LayersPanel || {};

(() => {
  function mergedEntries() {
    const text = project.text_blocks.map((b) => ({ item: b, kind: "text", label: b.heading || "(empty heading)" }));
    const boxes = project.video_boxes.map((v) => ({ item: v, kind: "video_box", label: v.file_path.split(/[\\/]/).pop() }));
    return [...text, ...boxes].sort((a, b) => b.item.z_index - a.item.z_index);
  }

  // `entries` is already in the desired top-to-bottom (front-to-back) order; assign z_index
  // by position so a drag-drop reorder becomes the new persisted stacking order.
  function renumber(entries) {
    const n = entries.length;
    entries.forEach((e, i) => { e.item.z_index = n - 1 - i; });
  }

  function render() {
    const list = document.getElementById("layers-list");
    list.innerHTML = "";
    const entries = mergedEntries();

    entries.forEach((entry, index) => {
      const li = document.createElement("li");
      li.className = "layers-list-row";
      li.draggable = true;

      const type = document.createElement("span");
      type.className = "layers-list-row-type";
      type.textContent = entry.kind === "text" ? "Text" : "Video Box";
      li.appendChild(type);

      const label = document.createElement("span");
      label.className = "layers-list-row-label";
      label.textContent = entry.label;
      li.appendChild(label);

      li.addEventListener("dragstart", (e) => {
        e.dataTransfer.setData("text/plain", String(index));
        li.classList.add("dragging");
      });
      li.addEventListener("dragend", () => li.classList.remove("dragging"));
      li.addEventListener("dragover", (e) => e.preventDefault());
      li.addEventListener("drop", async (e) => {
        e.preventDefault();
        const fromIndex = Number(e.dataTransfer.getData("text/plain"));
        const toIndex = index;
        if (fromIndex === toIndex) return;
        const reordered = [...entries];
        const [moved] = reordered.splice(fromIndex, 1);
        reordered.splice(toIndex, 0, moved);
        renumber(reordered);
        await saveProject();
        renderTimeline();
        render();
      });

      list.appendChild(li);
    });
  }

  window.LayersPanel.render = render;
})();
```

- [ ] **Step 2: Create static/css/components/layers-panel.css**

Create `static/css/components/layers-panel.css`:

```css
/* LAYERS panel: drag-and-drop reorderable list of text blocks + video boxes by z_index. */
/* Exposes .layers-list/.layers-list-row/.layers-list-row-type/.layers-list-row-label. Depends on tokens.css. */
.layers-list { list-style: none; margin: 0; padding: 0; }

.layers-list-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2);
  border-radius: 3px;
  margin-bottom: var(--space-1);
  background: var(--bg-2);
  border: 1px solid var(--border-soft);
  cursor: grab;
}
.layers-list-row:hover { border-color: var(--border-hover-color); }
.layers-list-row.dragging { opacity: 0.4; }

.layers-list-row-type {
  flex-shrink: 0;
  font-family: var(--font-ui);
  font-size: 9.5px;
  text-transform: uppercase;
  color: var(--text-dim);
}

.layers-list-row-label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text);
  font-size: 12.5px;
}
```

- [ ] **Step 3: Manual verification**

Full behavior needs at least one text block and/or video box to exist — verified at the Task 10 integration checkpoint. For this task alone: start the dev server, open the browser console, confirm `typeof LayersPanel.render === "function"`.

- [ ] **Step 4: Commit**

```bash
git add static/panel-layers.js static/css/components/layers-panel.css
git commit -m "feat: add LAYERS panel for drag-and-drop z-index reordering"
```

**Next session:** This is the last of the Batch 2 tasks. Once Tasks 3–9 are all merged, dispatch Task 10 (`docs/superpowers/plans/2026-07-19-phase-3-video-box/task-10-editor-integration.md`) — this should be subagent-driven: "Implement Task 10 from `docs/superpowers/plans/2026-07-19-phase-3-video-box/task-10-editor-integration.md` — Tasks 1–9 are all complete and merged."

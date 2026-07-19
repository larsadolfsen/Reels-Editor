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

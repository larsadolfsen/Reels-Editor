// FILES/MEDIA context-panel section: media-library list (thumbnail, name, duration),
// grouped by type (videos, then images, each with a small section label — omitted when that
// group is empty), click-to-select, hover-reveal inline rename (pencil icon) and remove (trash
// icon, disabled with a usage-count chip when the media item is referenced by any ClipLayer).
// Clip rows use UI.listRow()/list-row.css (static/ui-list-row.js) for shared card styling
// (background/border/hover/selected); section-label rows are untouched by it.
// Exposes window.MediaPanel.render().
window.MediaPanel = window.MediaPanel || {};

(() => {
  let selectedMediaId = null; // MEDIA panel row highlight only — independent of timeline `selected`

  function formatClipDuration(seconds) {
    const m = Math.floor(seconds / 60);
    const s = (seconds % 60).toFixed(1).padStart(4, "0");
    return `${String(m).padStart(2, "0")}:${s}`;
  }

  function displayName(m) {
    return m.name || m.file_path.split(/[\\/]/).pop();
  }

  function startRename(m, nameEl) {
    const input = document.createElement("input");
    input.type = "text";
    input.className = "clip-name-input";
    input.value = displayName(m);

    let done = false;
    const commit = async () => {
      if (done) return;
      done = true;
      m.name = input.value.trim();
      await saveProject();
      render();
    };
    const cancel = () => {
      if (done) return;
      done = true;
      render();
    };

    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); input.blur(); }
      else if (e.key === "Escape") { e.preventDefault(); cancel(); }
    });
    input.addEventListener("blur", commit);
    input.addEventListener("click", (e) => e.stopPropagation());

    nameEl.replaceWith(input);
    input.focus();
    input.select();
  }

  function buildRow(m) {
    const li = document.createElement("li");
    UI.listRow(li, { selected: selectedMediaId === m.id });
    li.draggable = true; // drag onto the timeline's VIDEO row to place this file as a clip
    li.addEventListener("dragstart", (e) => e.dataTransfer.setData("text/media-id", m.id));

    const thumb = document.createElement("div");
    thumb.className = "clip-thumb";
    li.appendChild(thumb);

    // Load thumbnail asynchronously
    (async () => {
      const thumbUrl = await Api.getMediaThumbnail(m.id, m.file_path);
      if (thumbUrl) {
        const img = document.createElement("img");
        img.className = "clip-thumb-img";
        img.src = thumbUrl;
        thumb.innerHTML = "";
        thumb.appendChild(img);
      }
    })();

    const info = document.createElement("div");
    info.className = "clip-info";
    const name = document.createElement("span");
    name.className = "clip-name";
    name.textContent = displayName(m);
    const durationRow = document.createElement("div");
    durationRow.className = "clip-duration-row";
    const duration = document.createElement("span");
    duration.className = "clip-duration";
    duration.textContent = formatClipDuration(m.duration);
    durationRow.appendChild(duration);
    if (m.has_audio === false) {
      const muted = document.createElement("span");
      muted.className = "clip-audio-muted-icon";
      muted.title = "No audio";
      muted.innerHTML = '<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z"/><line x1="22" x2="16" y1="9" y2="15"/><line x1="16" x2="22" y1="9" y2="15"/></svg>';
      durationRow.appendChild(muted);
    }
    info.appendChild(name);
    info.appendChild(durationRow);
    li.appendChild(info);

    const actions = document.createElement("div");
    actions.className = "clip-actions";
    const renameBtn = document.createElement("button");
    renameBtn.type = "button";
    renameBtn.className = "icon-btn clip-action";
    renameBtn.title = "Rename";
    renameBtn.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>';
    renameBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      startRename(m, name);
    });
    actions.appendChild(renameBtn);

    const count = project.clips.filter((c) => c.media_id === m.id).length;
    if (count > 0) {
      const chip = document.createElement("span");
      chip.className = "clip-usage-chip";
      chip.textContent = String(count);
      actions.appendChild(chip);
    }

    const trashBtn = document.createElement("button");
    trashBtn.type = "button";
    trashBtn.className = "icon-btn clip-action";
    if (count > 0) {
      trashBtn.disabled = true;
      trashBtn.title = `used by ${count} clip${count === 1 ? "" : "s"}`;
    } else {
      trashBtn.title = "Remove";
    }
    trashBtn.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>';
    trashBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      if (count > 0) return;
      project.media_library = project.media_library.filter((x) => x.id !== m.id);
      await saveProject();
      render();
    });
    actions.appendChild(trashBtn);

    li.appendChild(actions);

    li.addEventListener("click", () => {
      selectedMediaId = selectedMediaId === m.id ? null : m.id;
      render();
    });
    return li;
  }

  function appendGroup(list, label, items) {
    if (!items.length) return;
    const labelLi = document.createElement("li");
    labelLi.className = "clip-section-label";
    labelLi.textContent = label;
    list.appendChild(labelLi);
    items.forEach((m) => list.appendChild(buildRow(m)));
  }

  function render() {
    const list = document.getElementById("clip-list");
    list.innerHTML = "";
    const videos = project.media_library.filter((m) => m.kind !== "image" && m.kind !== "audio");
    const images = project.media_library.filter((m) => m.kind === "image");
    appendGroup(list, "VIDEOS", videos);
    appendGroup(list, "IMAGES", images);
  }

  window.MediaPanel.render = render;
})();

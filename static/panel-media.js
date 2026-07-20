// FILES/MEDIA context-panel section: media-library list (thumbnail, name, duration),
// click-to-select, hover-reveal inline rename (pencil icon; trash icon added in a later task).
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

  function render() {
    const list = document.getElementById("clip-list");
    list.innerHTML = "";
    project.media_library.forEach((m) => {
      const li = document.createElement("li");
      li.draggable = true; // drag onto the timeline's VIDEO row to place this file as a clip
      li.addEventListener("dragstart", (e) => e.dataTransfer.setData("text/media-id", m.id));
      if (selectedMediaId === m.id) {
        li.classList.add("selected");
      }

      const thumb = document.createElement("div");
      thumb.className = "clip-thumb";
      li.appendChild(thumb);

      const info = document.createElement("div");
      info.className = "clip-info";
      const name = document.createElement("span");
      name.className = "clip-name";
      name.textContent = displayName(m);
      const duration = document.createElement("span");
      duration.className = "clip-duration";
      duration.textContent = formatClipDuration(m.duration);
      info.appendChild(name);
      info.appendChild(duration);
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
      li.appendChild(actions);

      li.addEventListener("click", () => {
        selectedMediaId = selectedMediaId === m.id ? null : m.id;
        render();
      });
      list.appendChild(li);
    });
  }

  window.MediaPanel.render = render;
})();

// FILES/MEDIA context-panel section: media-library list (thumbnail, name, duration),
// click-to-select. Exposes window.MediaPanel.render().
window.MediaPanel = window.MediaPanel || {};

(() => {
  let selectedMediaId = null; // MEDIA panel row highlight only — independent of timeline `selected`

  function formatClipDuration(seconds) {
    const m = Math.floor(seconds / 60);
    const s = (seconds % 60).toFixed(1).padStart(4, "0");
    return `${String(m).padStart(2, "0")}:${s}`;
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
      name.textContent = m.file_path.split(/[\\/]/).pop();
      const duration = document.createElement("span");
      duration.className = "clip-duration";
      duration.textContent = formatClipDuration(m.duration);
      info.appendChild(name);
      info.appendChild(duration);
      li.appendChild(info);

      li.addEventListener("click", () => {
        selectedMediaId = selectedMediaId === m.id ? null : m.id;
        render();
      });
      list.appendChild(li);
    });
  }

  window.MediaPanel.render = render;
})();

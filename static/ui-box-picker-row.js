// UI.boxPickerRow(mediaItem, {onClick}) -> <li> (added 2026-08-01, mask-list-styling): shared
// media-picker row for the VIDEO BOX / IMAGE BOX panels' "+" add-picker lists — a kind-based icon
// (no real thumbnail fetch) + name + duration, built on the shared .list-row card recipe
// (list-row.css, via UI.listRow) and reusing panel-media.js's .clip-info/.clip-name/
// .clip-duration-row/.clip-duration classes so it matches the FILES list's look without
// duplicating that layout CSS. Simpler than panel-media.js's buildRow: no thumbnail fetch,
// rename, or hover action icons — this picker is a one-shot "click row to add" list.
window.UI = window.UI || {};

(() => {
  const KIND_ICONS = { image: "image", audio: "music" };

  function iconFor(m) {
    return KIND_ICONS[m.kind] || "video";
  }

  function formatDuration(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = (seconds % 60).toFixed(1).padStart(4, "0");
    return `${String(mins).padStart(2, "0")}:${secs}`;
  }

  function displayName(m) {
    return m.name || m.file_path.split(/[\\/]/).pop();
  }

  window.UI.boxPickerRow = function boxPickerRow(m, { onClick }) {
    const li = document.createElement("li");
    UI.listRow(li, {});
    li.classList.add("box-picker-row");

    const icon = document.createElement("div");
    icon.className = "box-picker-row-icon";
    icon.innerHTML = UI.icon(iconFor(m), { size: 18 });
    li.appendChild(icon);

    const info = document.createElement("div");
    info.className = "clip-info";
    const name = document.createElement("span");
    name.className = "clip-name";
    name.textContent = displayName(m);
    const durationRow = document.createElement("div");
    durationRow.className = "clip-duration-row";
    const duration = document.createElement("span");
    duration.className = "clip-duration";
    duration.textContent = formatDuration(m.duration);
    durationRow.appendChild(duration);
    info.appendChild(name);
    info.appendChild(durationRow);
    li.appendChild(info);

    li.addEventListener("click", onClick);
    return li;
  };
})();

// FILES/MEDIA context-panel section: media-library list (thumbnail, name, duration),
// grouped by type (videos, then images, each with a small section label — omitted when that
// group is empty), click-to-select, hover-reveal inline rename (pencil icon), remove (trash
// icon, swapped for a disabled lock icon when the media item is referenced by any ClipLayer),
// and a plus icon (added 2026-07-24) that adds the item directly: a video row appends a new
// clip to the end of the VIDEO timeline sequence (appendMediaClipToSequence, clip-sequence.js);
// an image row creates a new IMAGE BOX overlay (ImageBoxPanel.createImageBox, panel-image-box.js)
// and opens the IMAGE BOX panel with it selected; an audio row sets/replaces Project.music with
// that file (mirrors panel-audio.js's addMusic()/replaceMusic(), one music track only) and opens
// the AUDIO panel.
// Clip rows use UI.listRow()/list-row.css (static/ui-list-row.js) for shared card styling
// (background/border/hover/selected); section-label rows are untouched by it. A "no audio" icon
// is shown for clips with no audio stream (m.has_audio === false) and, for video clips that do
// have a stream, also when its cached waveform peaks are all silent (checkSilentAudio, added
// 2026-07-23 — an audio stream can technically exist but carry no actual sound).
// Exposes window.MediaPanel.render().
window.MediaPanel = window.MediaPanel || {};

(() => {
  let selectedMediaId = null; // MEDIA panel row highlight only — independent of timeline `selected`
  const silentCache = {}; // media id -> bool, avoids re-fetching peaks on every render
  const SILENCE_THRESHOLD = 0.02;

  const MUTED_ICON_SVG = UI.icon("volume-x", { size: 11 });

  function appendMutedIcon(durationRow) {
    if (durationRow.querySelector(".clip-audio-muted-icon")) return;
    const muted = document.createElement("span");
    muted.className = "clip-audio-muted-icon";
    muted.title = "No audio";
    muted.innerHTML = MUTED_ICON_SVG;
    durationRow.appendChild(muted);
  }

  function checkSilentAudio(m, durationRow) {
    if (m.id in silentCache) {
      if (silentCache[m.id]) appendMutedIcon(durationRow);
      return;
    }
    (async () => {
      const peaks = await Api.getMediaPeaks(m.id, m.file_path);
      const silent = peaks.length > 0 && peaks.every((p) => p <= SILENCE_THRESHOLD);
      silentCache[m.id] = silent;
      if (silent) appendMutedIcon(durationRow);
    })();
  }

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
      appendMutedIcon(durationRow);
    } else if (m.kind !== "image" && m.kind !== "audio") {
      checkSilentAudio(m, durationRow);
    }
    info.appendChild(name);
    info.appendChild(durationRow);
    li.appendChild(info);

    const actions = document.createElement("div");
    actions.className = "clip-actions";

    const addBtn = UI.button(actions, {
      icon: "plus",
      size: "sm",
      onClick: async (e) => {
        e.stopPropagation();
        if (m.kind === "image") {
          const box = await ImageBoxPanel.createImageBox(m);
          await saveProject();
          // Routed through onTimelineSelect (panel-nav.js) rather than calling showPanel/render
          // directly, so it also sets `selected` (editor.js) to this box — otherwise the timeline
          // highlight, a following Delete keypress, and undo/redo's reRenderAfterRestore would all
          // keep targeting whatever was selected before this click (or nothing).
          await onTimelineSelect({ type: "image-box", item: box });
          // onTimelineSelect's image-box branch only calls ImageBoxPanel.render(), whose
          // ImageBoxPreview.setSelectedImageBox() call alone only updates which box is selected, it
          // doesn't itself trigger a render pass (same gap documented on ImageBoxPreview.setOnActivate
          // in editor.js) — without this, the new box never mounts into #overlay, so it renders
          // invisibly with no resize handles until the next unrelated stage render.
          ImageBoxPreview.render(project.image_boxes, Preview.currentTimelineTime());
        } else if (m.kind === "audio") {
          // Mirrors static/panel-audio.js's addMusic()/replaceMusic() — one music track only (v1),
          // so this always replaces any existing Project.music rather than erroring or disabling.
          project.music = { id: crypto.randomUUID().replaceAll("-", ""), media_id: m.id, volume: 0.3, muted: false };
          await saveProject();
          // PreviewAudio's module-level `music` state (static/preview-audio.js) is only ever set
          // inside PreviewAudio.load(project) — without this, PreviewAudio.play() silently no-ops
          // even though Project.music is now correctly set (bug found in final review).
          Preview.load(project);
          openAudioPanel(); // panel-nav.js: sets `selected = { type: "audio" }`, opens the panel, re-renders the timeline
        } else {
          await appendMediaClipToSequence(m);
          MediaPanel.render(); // refresh this row's trash button — it's now disabled, the media is in use
        }
      },
    });
    addBtn.title = m.kind === "image" ? "Add as image box" : m.kind === "audio" ? "Add audio" : "Add to timeline";
    addBtn.classList.add("clip-action");

    const renameBtn = UI.button(actions, {
      icon: "pencil",
      size: "sm",
      onClick: (e) => {
        e.stopPropagation();
        startRename(m, name);
      },
    });
    renameBtn.title = "Rename";
    renameBtn.classList.add("clip-action");

    const count = project.clips.filter((c) => c.media_id === m.id).length;

    const trashBtn = UI.button(actions, {
      icon: count > 0 ? "lock" : "trash",
      size: "sm",
      disabled: count > 0,
      onClick: async (e) => {
        e.stopPropagation();
        if (count > 0) return;
        project.media_library = project.media_library.filter((x) => x.id !== m.id);
        await saveProject();
        render();
      },
    });
    if (count > 0) {
      trashBtn.title = `Locked — used by ${count} clip${count === 1 ? "" : "s"}`;
    } else {
      trashBtn.title = "Remove";
    }
    trashBtn.classList.add("clip-action");

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
    labelLi.className = "clip-section-row";
    UI.text(labelLi, { variant: "eyebrow", content: label });
    list.appendChild(labelLi);
    items.forEach((m) => list.appendChild(buildRow(m)));
  }

  function render() {
    const list = document.getElementById("clip-list");
    list.innerHTML = "";
    const videos = project.media_library.filter((m) => m.kind !== "image" && m.kind !== "audio");
    const images = project.media_library.filter((m) => m.kind === "image");
    const audios = project.media_library.filter((m) => m.kind === "audio");
    appendGroup(list, "VIDEOS", videos);
    appendGroup(list, "IMAGES", images);
    appendGroup(list, "AUDIO", audios);
  }

  window.MediaPanel.render = render;
})();

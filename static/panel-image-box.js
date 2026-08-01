// #panel-image-box context-panel section: add-from-media-library picker (images only),
// size/position/time fields, drag-to-move/resize on stage (via ImageBoxPreview), delete. The
// detail view is split into Box (SIZE + POSITION, via the shared BoxSizePositionPanel —
// box-panel-size-position.js) and Time (START + DURATION) tab panes via
// UI.tabBar (Box default), with Delete as an always-visible footer. Exposes
// window.ImageBoxPanel.render(selectedId). One image box selected at a time; multiple boxes
// live in project.image_boxes (see app/models.py's ImageBoxLayer). Mirrors panel-video-box.js;
// createImageBox() is also exposed as window.ImageBoxPanel.createImageBox so the MEDIA panel's
// plus-icon "add to timeline" button (static/panel-media.js) can create a box directly;
// no in/out trim (images have no source timeline) — DURATION is the only length control.
window.ImageBoxPanel = window.ImageBoxPanel || {};

(() => {
  const IMAGE_BOX_HEADER_ICON = UI.icon("image", { size: 18 });
  const IMAGE_BOX_TAB_ICON_BOX = UI.icon("square-dashed", { size: 18 });
  const IMAGE_BOX_TAB_ICON_TIME = UI.icon("timer", { size: 18 });

  const IMAGE_BOX_TABS = [
    { value: "box", icon: IMAGE_BOX_TAB_ICON_BOX, label: "Box" },
    { value: "time", icon: IMAGE_BOX_TAB_ICON_TIME, label: "Time" },
  ];
  const imageBoxTabPanes = {
    box: document.getElementById("image-box-box-body"),
    time: document.getElementById("image-box-time-body"),
  };
  let activeImageBoxTab = "box";
  function showImageBoxTab(value) {
    activeImageBoxTab = value;
    Object.entries(imageBoxTabPanes).forEach(([k, el]) => { el.hidden = k !== value; });
  }
  UI.tabBar(document.getElementById("image-box-tab-bar"), IMAGE_BOX_TABS, activeImageBoxTab, showImageBoxTab);
  showImageBoxTab(activeImageBoxTab);

  function probeImageAspect(filePath) {
    return new Promise((resolve) => {
      const probe = new Image();
      probe.onload = () => resolve({ w: probe.naturalWidth || 16, h: probe.naturalHeight || 9 });
      probe.onerror = () => resolve({ w: 16, h: 9 });
      probe.src = "/media?path=" + encodeURIComponent(filePath);
    });
  }

  async function createImageBox(mediaItem) {
    const { w, h } = await probeImageAspect(mediaItem.file_path);
    const width = 1080;
    const height = Math.round(width * h / w);
    const box = {
      id: crypto.randomUUID().replaceAll("-", ""),
      media_id: mediaItem.id,
      file_path: mediaItem.file_path,
      start: 0,
      duration: 3.0,
      x: 0,
      y: 0,
      width,
      height,
      z_index: -1,
    };
    project.image_boxes.push(box);
    return box;
  }

  function renderPicker() {
    const list = document.getElementById("image-box-picker-list");
    list.innerHTML = "";
    project.media_library.filter((m) => m.kind === "image").forEach((m) => {
      const li = document.createElement("li");
      li.textContent = m.name || m.file_path.split(/[\\/]/).pop();
      li.addEventListener("click", async () => {
        const box = await createImageBox(m);
        await saveProject();
        renderTimeline();
        render(box.id);
      });
      list.appendChild(li);
    });
  }

  // Locks aspect ratio to the box's own current width/height: whichever dimension actually
  // changed from `from` drives, the other is derived — same logic as panel-video-box.js.
  function applyAspectLock(from, size) {
    const ratio = from.width / from.height;
    if (size.width !== from.width) {
      return { width: size.width, height: Math.round(size.width / ratio) };
    }
    return { width: Math.round(size.height * ratio), height: size.height };
  }

  function renderDetail(box) {
    UI.numberField(document.getElementById("image-box-start-field"),
      { label: "START", unit: "SEC", value: box.start, step: 0.1, min: 0, span: 4,
        onChange: async (v) => { box.start = v; await saveProject(); renderTimeline(); } });
    UI.numberField(document.getElementById("image-box-duration-field"),
      { label: "DURATION", unit: "SEC", value: box.duration, step: 0.1, min: 0.1, span: 4,
        onChange: async (v) => { box.duration = v; await saveProject(); renderTimeline(); } });

    BoxSizePositionPanel.render(document.getElementById("image-box-size-position"), box, {
      onChange: async () => {
        await saveProject();
        renderTimeline();
        ImageBoxPreview.render(project.image_boxes, Preview.currentTimelineTime());
      },
      getNaturalSize: () => probeImageAspect(box.file_path),
    });

    document.getElementById("image-box-delete").onclick = async () => {
      project.image_boxes = project.image_boxes.filter((b) => b.id !== box.id);
      await saveProject();
      ImageBoxPreview.render(project.image_boxes, Preview.currentTimelineTime());
      openFilesPanel();
    };

    ImageBoxPreview.setSelectedImageBox(box.id, {
      onResize: (size) => {
        const scale = stageScale();
        const { width, height } = applyAspectLock(box, { width: Math.round(size.width * scale), height: Math.round(size.height * scale) });
        ImageBoxPreview.render(
          project.image_boxes.map((b) => (b.id === box.id ? { ...b, width, height } : b)),
          Preview.currentTimelineTime(),
        );
      },
      onDragEnd: async (size) => {
        const scale = stageScale();
        const { width, height } = applyAspectLock(box, { width: Math.round(size.width * scale), height: Math.round(size.height * scale) });
        box.width = width; box.height = height;
        await saveProject();
        renderDetail(box);
      },
      onMove: (delta) => {
        const scale = stageScale();
        ImageBoxPreview.render(
          project.image_boxes.map((b) => (b.id === box.id ? { ...b, x: b.x + delta.dx * scale, y: b.y + delta.dy * scale } : b)),
          Preview.currentTimelineTime(),
        );
      },
      onMoveEnd: async (delta) => {
        const scale = stageScale();
        box.x = Math.round(box.x + delta.dx * scale);
        box.y = Math.round(box.y + delta.dy * scale);
        await saveProject();
        renderDetail(box);
      },
    });
  }

  let lastSelectedId = null;

  function render(selectedId) {
    document.getElementById("image-box-add").onclick = renderPicker;
    const box = selectedId ? project.image_boxes.find((b) => b.id === selectedId) : null;
    UI.contextPanelHeader(document.getElementById("image-box-header"), {
      icon: IMAGE_BOX_HEADER_ICON,
      label: box ? box.file_path.split(/[\\/]/).pop() : "Image",
    });
    document.getElementById("image-box-add-group").hidden = !!box;
    document.getElementById("image-box-picker").hidden = !!box;
    document.getElementById("image-box-detail").hidden = !box;
    if (!box) {
      renderPicker();
      ImageBoxPreview.setSelectedImageBox(null, null);
      lastSelectedId = null;
      return;
    }
    // Selecting a box that's outside its own time window seeks the playhead to its start so it's
    // visible and editable on stage — the box is no longer force-rendered while merely selected
    // (see image-box-preview.js), so without this a newly-selected box outside the current
    // playhead time would show its detail panel with nothing to look at on the stage.
    if (box.id !== lastSelectedId) {
      const t = Preview.currentTimelineTime();
      if (t < box.start || t >= box.start + box.duration) {
        Preview.seek(box.start);
        renderTimeline();
      }
    }
    lastSelectedId = box.id;
    renderDetail(box);
  }

  window.ImageBoxPanel.render = render;
  window.ImageBoxPanel.createImageBox = createImageBox;
})();

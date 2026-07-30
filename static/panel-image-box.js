// #panel-image-box context-panel section: add-from-media-library picker (images only),
// size/position/time fields, drag-to-move/resize on stage (via ImageBoxPreview), delete. The
// detail view is split into Box (SIZE & POSITION), Time (START + DURATION) and Mask (EDGE MASK)
// tab panes via UI.tabBar (Box default), with Delete as an always-visible footer. Exposes
// window.ImageBoxPanel.render(selectedId). One image box selected at a time; multiple boxes
// live in project.image_boxes (see app/models.py's ImageBoxLayer). Mirrors panel-video-box.js;
// createImageBox() is also exposed as window.ImageBoxPanel.createImageBox so the MEDIA panel's
// plus-icon "add to timeline" button (static/panel-media.js) can create a box directly;
// no in/out trim (images have no source timeline) — DURATION is the only length control.
window.ImageBoxPanel = window.ImageBoxPanel || {};

(() => {
  const IMAGE_BOX_TAB_ICON_BOX = UI.icon("square-dashed", { size: 18 });
  const IMAGE_BOX_TAB_ICON_TIME = UI.icon("timer", { size: 18 });
  const IMAGE_BOX_TAB_ICON_MASK = UI.icon("columns-2", { size: 18 });

  const IMAGE_BOX_TABS = [
    { value: "box", icon: IMAGE_BOX_TAB_ICON_BOX, label: "Box" },
    { value: "time", icon: IMAGE_BOX_TAB_ICON_TIME, label: "Time" },
    { value: "mask", icon: IMAGE_BOX_TAB_ICON_MASK, label: "Mask" },
  ];
  const imageBoxTabPanes = {
    box: document.getElementById("image-box-box-body"),
    time: document.getElementById("image-box-time-body"),
    mask: document.getElementById("image-box-mask-body"),
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

  // Re-renders the stage so a mask change is visible immediately, same as the X/Y/W/H fields do.
  function repaintStage() {
    ImageBoxPreview.render(project.image_boxes, Preview.currentTimelineTime());
  }

  function renderMask(box) {
    UI.buttonGroup(document.getElementById("image-box-mask-toggle"),
      [{ value: "off", label: "OFF", span: 4 }, { value: "on", label: "ON", span: 4 }],
      box.mask_enabled ? "on" : "off",
      async (v) => {
        box.mask_enabled = v === "on";
        await saveProject();
        renderMask(box);
        repaintStage();
      });

    UI.numberField(document.getElementById("image-box-mask-angle-field"),
      { label: "ANGLE", unit: "DEG", value: box.mask_angle ?? 0, step: 1, decimals: 1, span: 4,
        disabled: !box.mask_enabled,
        onChange: async (v) => { box.mask_angle = v; await saveProject(); repaintStage(); } });
    UI.numberField(document.getElementById("image-box-mask-offset-field"),
      { label: "OFFSET", unit: "PX", value: box.mask_offset ?? 0, step: 10, span: 4,
        disabled: !box.mask_enabled,
        onChange: async (v) => { box.mask_offset = v; await saveProject(); repaintStage(); } });

    const flip = document.getElementById("image-box-mask-flip");
    flip.disabled = !box.mask_enabled;
    flip.onclick = async () => {
      box.mask_flip = !box.mask_flip;
      await saveProject();
      repaintStage();
    };

    ImageBoxPreview.setOnMaskChange(async (mask, done) => {
      box.mask_angle = mask.angle;
      box.mask_offset = Math.round(mask.offset);
      repaintStage();
      if (done) {
        await saveProject();
        renderMask(box);   // number fields track the drag once it settles
      }
    });
  }

  function renderDetail(box) {
    document.getElementById("image-box-name").textContent = box.file_path.split(/[\\/]/).pop();

    UI.numberField(document.getElementById("image-box-start-field"),
      { label: "START", unit: "SEC", value: box.start, step: 0.1, min: 0, span: 4,
        onChange: async (v) => { box.start = v; await saveProject(); renderTimeline(); } });
    UI.numberField(document.getElementById("image-box-duration-field"),
      { label: "DURATION", unit: "SEC", value: box.duration, step: 0.1, min: 0.1, span: 4,
        onChange: async (v) => { box.duration = v; await saveProject(); renderTimeline(); } });

    UI.numberField(document.getElementById("image-box-x-field"),
      { label: "X", unit: "PX", value: box.x, min: 0, max: 1080, span: 4,
        onChange: async (v) => { box.x = v; await saveProject(); ImageBoxPreview.render(project.image_boxes, Preview.currentTimelineTime()); } });
    UI.numberField(document.getElementById("image-box-y-field"),
      { label: "Y", unit: "PX", value: box.y, min: 0, max: 1920, span: 4,
        onChange: async (v) => { box.y = v; await saveProject(); ImageBoxPreview.render(project.image_boxes, Preview.currentTimelineTime()); } });

    UI.numberField(document.getElementById("image-box-width-field"),
      { label: "WIDTH", unit: "PX", value: box.width, min: 1, max: 1080, span: 4,
        onChange: async (v) => {
          const { width, height } = applyAspectLock(box, { width: v, height: box.height });
          box.width = width; box.height = height;
          await saveProject(); renderTimeline(); renderDetail(box);
          ImageBoxPreview.render(project.image_boxes, Preview.currentTimelineTime());
        } });
    UI.numberField(document.getElementById("image-box-height-field"),
      { label: "HEIGHT", unit: "PX", value: box.height, min: 1, max: 1920, span: 4,
        onChange: async (v) => {
          const { width, height } = applyAspectLock(box, { width: box.width, height: v });
          box.width = width; box.height = height;
          await saveProject(); renderTimeline(); renderDetail(box);
          ImageBoxPreview.render(project.image_boxes, Preview.currentTimelineTime());
        } });

    document.getElementById("image-box-delete").onclick = async () => {
      project.image_boxes = project.image_boxes.filter((b) => b.id !== box.id);
      await saveProject();
      renderTimeline();
      render(null);
    };

    renderMask(box);

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

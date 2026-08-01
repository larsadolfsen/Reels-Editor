// #panel-video-box context-panel section: add-from-media-library picker, time/position/size
// fields, drag-to-move/resize on stage (via VideoBoxPreview), delete. The detail view is split
// into Box (SIZE + POSITION, via the shared BoxSizePositionPanel — box-panel-size-position.js),
// Time (START), and Mask (via the shared BoxMaskPanel — box-panel-mask.js, added 2026-08-01
// mask-visibility-ui, replacing the timeline's per-lane MASK accordion) tab panes via UI.tabBar
// (Box default), with Delete as an always-visible footer. No trim (IN/OUT) controls — removed
// 2026-07-30, the in_point/out_point fields still exist on VideoBoxLayer (set once at creation
// from the source media's full duration) but are no longer user-editable via this panel. Exposes
// window.VideoBoxPanel.render(selectedId) and window.VideoBoxPanel.createVideoBox(mediaItem)
// (added 2026-07-30, video-hover-icons-files: pushes a new VideoBoxLayer into
// project.video_boxes and returns it, no save/render — caller's responsibility; reused by
// panel-media.js's hover-reveal PIP icon).
// One video box selected at a time; multiple boxes live in project.video_boxes (see app/models.py's VideoBoxLayer).
window.VideoBoxPanel = window.VideoBoxPanel || {};

(() => {
  const VIDEO_BOX_HEADER_ICON = UI.icon("picture-in-picture", { size: 18 });
  const VIDEO_BOX_TAB_ICON_BOX = UI.icon("square-dashed", { size: 18 });
  const VIDEO_BOX_TAB_ICON_TIME = UI.icon("timer", { size: 18 });
  const VIDEO_BOX_TAB_ICON_MASK = UI.icon("venetian-mask", { size: 18 });

  const VIDEO_BOX_TABS = [
    { value: "box", icon: VIDEO_BOX_TAB_ICON_BOX, label: "Box" },
    { value: "time", icon: VIDEO_BOX_TAB_ICON_TIME, label: "Time" },
    { value: "mask", icon: VIDEO_BOX_TAB_ICON_MASK, label: "Mask" },
  ];
  const videoBoxTabPanes = {
    box: document.getElementById("video-box-box-body"),
    time: document.getElementById("video-box-time-body"),
    mask: document.getElementById("video-box-mask-body"),
  };
  let activeVideoBoxTab = "box";
  let currentBox = null;
  function showVideoBoxTab(value) {
    activeVideoBoxTab = value;
    Object.entries(videoBoxTabPanes).forEach(([k, el]) => { el.hidden = k !== value; });
    // Leaving the Mask tab (without any field edit re-rendering this panel) must still hide the
    // rubylith overlay — and returning to it must still show it — so sync it directly rather than
    // relying on renderDetail() to run again.
    if (currentBox) BoxMaskPanel.syncActive(currentBox, value === "mask");
  }
  UI.tabBar(document.getElementById("video-box-tab-bar"), VIDEO_BOX_TABS, activeVideoBoxTab, showVideoBoxTab);
  showVideoBoxTab(activeVideoBoxTab);

  function probeVideoAspect(filePath) {
    return new Promise((resolve) => {
      const probe = document.createElement("video");
      probe.preload = "metadata";
      probe.onloadedmetadata = () => resolve({ w: probe.videoWidth || 16, h: probe.videoHeight || 9 });
      probe.onerror = () => resolve({ w: 16, h: 9 });
      probe.src = "/media?path=" + encodeURIComponent(filePath);
    });
  }

  async function createVideoBox(mediaItem) {
    const { w, h } = await probeVideoAspect(mediaItem.file_path);
    const width = 1080;
    const height = Math.round(width * h / w);
    const box = {
      id: crypto.randomUUID().replaceAll("-", ""),
      media_id: mediaItem.id,
      file_path: mediaItem.file_path,
      in_point: 0,
      out_point: mediaItem.duration,
      start: 0,
      x: 0,
      y: 0,
      width,
      height,
      z_index: -1,
    };
    project.video_boxes.push(box);
    return box;
  }

  function renderPicker() {
    const list = document.getElementById("video-box-picker-list");
    list.innerHTML = "";
    project.media_library.forEach((m) => {
      list.appendChild(UI.boxPickerRow(m, {
        onClick: async () => {
          const box = await createVideoBox(m);
          await saveProject();
          renderTimeline();
          render(box.id);
        },
      }));
    });
  }

  // Locks aspect ratio to the box's own current width/height: whichever dimension actually
  // changed from `from` drives, the other is derived — so both corner drags (width changes)
  // and the rare pure vertical-edge drag (height changes) each still work under a strict lock.
  function applyAspectLock(from, size) {
    const ratio = from.width / from.height;
    if (size.width !== from.width) {
      return { width: size.width, height: Math.round(size.width / ratio) };
    }
    return { width: Math.round(size.height * ratio), height: size.height };
  }

  function renderDetail(box) {
    UI.numberField(document.getElementById("video-box-start-field"),
      { label: "START", unit: "SEC", value: box.start, step: 0.1, min: 0, span: 8,
        onChange: async (v) => { box.start = v; await saveProject(); renderTimeline(); } });

    BoxSizePositionPanel.render(document.getElementById("video-box-size-position"), box, {
      onChange: async () => {
        await saveProject();
        renderTimeline();
        VideoBoxPreview.render(project.video_boxes, Preview.currentTimelineTime());
      },
      getNaturalSize: () => probeVideoAspect(box.file_path),
    });

    BoxMaskPanel.render(document.getElementById("video-box-mask-body"), box, {
      active: activeVideoBoxTab === "mask",
      getWindow: () => ({ start: box.start, duration: box.out_point - box.in_point }),
      onChange: async () => {
        await saveProject();
        renderTimeline();
        VideoBoxPreview.render(project.video_boxes, Preview.currentTimelineTime());
        renderDetail(box);
      },
    });

    document.getElementById("video-box-delete").onclick = async () => {
      if (box.mask_shape_id) {
        project.shapes = project.shapes.filter((s) => s.id !== box.mask_shape_id);
      }
      project.video_boxes = project.video_boxes.filter((b) => b.id !== box.id);
      await saveProject();
      VideoBoxPreview.render(project.video_boxes, Preview.currentTimelineTime());
      openFilesPanel();
    };

    VideoBoxPreview.setSelectedVideoBox(box.id, {
      onResize: (size) => {
        const scale = stageScale();
        const { width, height } = applyAspectLock(box, { width: Math.round(size.width * scale), height: Math.round(size.height * scale) });
        VideoBoxPreview.render(
          project.video_boxes.map((b) => (b.id === box.id ? { ...b, width, height } : b)),
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
        VideoBoxPreview.render(
          project.video_boxes.map((b) => (b.id === box.id ? { ...b, x: b.x + delta.dx * scale, y: b.y + delta.dy * scale } : b)),
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
    document.getElementById("video-box-add").onclick = renderPicker;
    const box = selectedId ? project.video_boxes.find((b) => b.id === selectedId) : null;
    UI.contextPanelHeader(document.getElementById("video-box-header"), {
      icon: VIDEO_BOX_HEADER_ICON,
      label: box ? box.file_path.split(/[\\/]/).pop() : "Video",
    });
    document.getElementById("video-box-add-group").hidden = !!box;
    document.getElementById("video-box-picker").hidden = !!box;
    document.getElementById("video-box-detail").hidden = !box;
    currentBox = box;
    if (!box) {
      renderPicker();
      VideoBoxPreview.setSelectedVideoBox(null, null);
      VideoBoxPreview.setActiveMaskShapeId(null);
      ImageBoxPreview.setActiveMaskShapeId(null);
      VideoBoxPreview.render(project.video_boxes, Preview.currentTimelineTime());
      ImageBoxPreview.render(project.image_boxes, Preview.currentTimelineTime());
      lastSelectedId = null;
      return;
    }
    // Selecting a box that's outside its own start/trim window seeks the playhead to its start
    // so it's visible and editable on stage — the box is no longer force-rendered while merely
    // selected (see video-box-preview.js), so without this a newly-selected box outside the
    // current playhead time would show its detail panel with nothing to look at on the stage.
    if (box.id !== lastSelectedId) {
      const t = Preview.currentTimelineTime();
      const boxEnd = box.start + (box.out_point - box.in_point);
      if (t < box.start || t >= boxEnd) {
        Preview.seek(box.start);
        renderTimeline();
      }
    }
    lastSelectedId = box.id;
    renderDetail(box);
  }

  window.VideoBoxPanel.render = render;
  window.VideoBoxPanel.createVideoBox = createVideoBox;
})();

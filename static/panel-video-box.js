// #panel-video-box context-panel section: add-from-media-library picker, trim/time/position/size
// fields, drag-to-move/resize on stage (via VideoBoxPreview), delete. Exposes
// window.VideoBoxPanel.render(selectedId). One video box selected at a time; multiple boxes
// live in project.video_boxes (see app/models.py's VideoBoxLayer).
window.VideoBoxPanel = window.VideoBoxPanel || {};

(() => {
  function findMedia(box) {
    return project.media_library.find((m) => m.id === box.media_id);
  }

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
      const li = document.createElement("li");
      li.textContent = m.file_path.split(/[\\/]/).pop();
      li.addEventListener("click", async () => {
        const box = await createVideoBox(m);
        await saveProject();
        renderTimeline();
        render(box.id);
      });
      list.appendChild(li);
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
    document.getElementById("video-box-name").textContent = box.file_path.split(/[\\/]/).pop();
    const media = findMedia(box);
    const dur = media ? media.duration : box.out_point;

    async function applyTrim(inP, outP) {
      const t = clampTrim(inP, outP, dur);
      box.in_point = t.in_point; box.out_point = t.out_point;
      await saveProject();
      renderTimeline();
      renderDetail(box);
    }

    UI.numberField(document.getElementById("video-box-in-field"),
      { label: "IN", unit: "SEC", value: box.in_point, step: 0.1, span: 4,
        onChange: (v) => applyTrim(v, box.out_point) });
    UI.numberField(document.getElementById("video-box-out-field"),
      { label: "OUT", unit: "SEC", value: box.out_point, step: 0.1, span: 4,
        onChange: (v) => applyTrim(box.in_point, v) });

    UI.numberField(document.getElementById("video-box-start-field"),
      { label: "START", unit: "SEC", value: box.start, step: 0.1, min: 0, span: 8,
        onChange: async (v) => { box.start = v; await saveProject(); renderTimeline(); } });

    UI.numberField(document.getElementById("video-box-x-field"),
      { label: "X", unit: "PX", value: box.x, min: 0, max: 1080, span: 4,
        onChange: async (v) => { box.x = v; await saveProject(); renderTimeline(); VideoBoxPreview.render(project.video_boxes, Preview.currentTimelineTime()); } });
    UI.numberField(document.getElementById("video-box-y-field"),
      { label: "Y", unit: "PX", value: box.y, min: 0, max: 1920, span: 4,
        onChange: async (v) => { box.y = v; await saveProject(); VideoBoxPreview.render(project.video_boxes, Preview.currentTimelineTime()); } });

    UI.numberField(document.getElementById("video-box-width-field"),
      { label: "WIDTH", unit: "PX", value: box.width, min: 1, max: 1080, span: 4,
        onChange: async (v) => {
          const { width, height } = applyAspectLock(box, { width: v, height: box.height });
          box.width = width; box.height = height;
          await saveProject(); renderTimeline(); renderDetail(box);
          VideoBoxPreview.render(project.video_boxes, Preview.currentTimelineTime());
        } });
    UI.numberField(document.getElementById("video-box-height-field"),
      { label: "HEIGHT", unit: "PX", value: box.height, min: 1, max: 1920, span: 4,
        onChange: async (v) => {
          const { width, height } = applyAspectLock(box, { width: box.width, height: v });
          box.width = width; box.height = height;
          await saveProject(); renderTimeline(); renderDetail(box);
          VideoBoxPreview.render(project.video_boxes, Preview.currentTimelineTime());
        } });

    document.getElementById("video-box-delete").onclick = async () => {
      project.video_boxes = project.video_boxes.filter((b) => b.id !== box.id);
      await saveProject();
      renderTimeline();
      render(null);
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

  function render(selectedId) {
    document.getElementById("video-box-add").onclick = renderPicker;
    const box = selectedId ? project.video_boxes.find((b) => b.id === selectedId) : null;
    document.getElementById("video-box-picker").hidden = !!box;
    document.getElementById("video-box-detail").hidden = !box;
    if (!box) {
      renderPicker();
      VideoBoxPreview.setSelectedVideoBox(null, null);
      return;
    }
    renderDetail(box);
  }

  window.VideoBoxPanel.render = render;
})();

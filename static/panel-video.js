// VIDEO context-panel section: trim/order/fill-mode/speed/delete for the selected clip, split
// into Design (FILL + SPEED), Time (TRIM + ORDER), and Auto (AUTO CAPTION + AUTO SILENCE, added
// 2026-07-30 replacing the standalone AUTO rail entry — content unchanged, just relocated and
// rendered via panel-audio-track.js's AudioTrackPanel.render()) tab panes via UI.tabBar (Design
// default). Exposes window.VideoPanel.render()/select()/deleteClip()/moveClipTo(), plus the shared
// clampTrim() helper (also used by panel-video-box.js).
// Note: there is no duplicate-clip feature — it was removed because duplicateClip() didn't
// shift/sync captions the way delete/move/insert do (static/caption-clip-sync.js).
window.VideoPanel = window.VideoPanel || {};

function clampTrim(inP, outP, dur) {
  inP = Math.max(0, Math.min(inP, dur));
  outP = Math.max(0, Math.min(outP, dur));
  if (outP <= inP) outP = Math.min(dur, inP + 0.1);
  return { in_point: inP, out_point: outP };
}

UI.divider(document.getElementById("video-order-divider"));

(() => {
  const VIDEO_TAB_ICON_DESIGN = UI.icon("pencil", { size: 18 });
  const VIDEO_TAB_ICON_TIME = UI.icon("timer", { size: 18 });
  const VIDEO_TAB_ICON_AUTO = UI.icon("sparkles", { size: 18 });

  const VIDEO_TABS = [
    { value: "design", icon: VIDEO_TAB_ICON_DESIGN, label: "Design" },
    { value: "time", icon: VIDEO_TAB_ICON_TIME, label: "Time" },
    { value: "auto", icon: VIDEO_TAB_ICON_AUTO, label: "Auto" },
  ];
  const videoTabPanes = {
    design: document.getElementById("video-design-body"),
    time: document.getElementById("video-time-body"),
    auto: document.getElementById("video-auto-body"),
  };
  let activeVideoTab = "design";
  function showVideoTab(value) {
    activeVideoTab = value;
    Object.entries(videoTabPanes).forEach(([k, el]) => { el.hidden = k !== value; });
  }
  UI.tabBar(document.getElementById("video-tab-bar"), VIDEO_TABS, activeVideoTab, showVideoTab);
  showVideoTab(activeVideoTab);

  function render(c) {
    const dur = clipDurations[c.id] ?? c.out_point;
    const media = project.media_library.find((m) => m.id === c.media_id);
    document.getElementById("video-name").textContent =
      (media && (media.name || media.file_path.split(/[\\/]/).pop())) || c.file_path.split(/[\\/]/).pop();

    async function applyTrim(inP, outP) {
      const t = clampTrim(inP, outP, dur);
      c.in_point = t.in_point; c.out_point = t.out_point;
      await saveProject();
      Preview.load(project);
      renderTimeline();
      render(c);
    }

    UI.numberField(document.getElementById("video-in-field"),
      { label: "IN", unit: "SEC", value: c.in_point, step: 0.1, span: 4,
        onChange: (v) => applyTrim(v, c.out_point) });

    UI.numberField(document.getElementById("video-out-field"),
      { label: "OUT", unit: "SEC", value: c.out_point, step: 0.1, span: 4,
        onChange: (v) => applyTrim(c.in_point, v) });

    document.getElementById("video-set-in").onclick = () => applyTrim(Preview.currentSourceTime(), c.out_point);
    document.getElementById("video-set-out").onclick = () => applyTrim(c.in_point, Preview.currentSourceTime());

    const ordered = [...project.clips].sort((a, b) => a.order - b.order);
    const idx = ordered.findIndex((x) => x.id === c.id);
    const upBtn = document.getElementById("video-move-up");
    const downBtn = document.getElementById("video-move-down");
    upBtn.disabled = idx <= 0;
    downBtn.disabled = idx === -1 || idx === ordered.length - 1;
    upBtn.onclick = async () => { await moveClipTo(c.id, idx - 1); render(c); };
    downBtn.onclick = async () => { await moveClipTo(c.id, idx + 1); render(c); };

    UI.buttonGroup(document.getElementById("video-fill-mode-group"),
      [{ value: "fit", label: "FIT", span: 4 }, { value: "fill", label: "FILL", span: 4 }],
      c.fill_mode,
      async (v) => {
        c.fill_mode = v;
        await saveProject();
        Preview.load(project);
      });

    UI.numberField(document.getElementById("video-speed-field"),
      { label: "SPEED", unit: "×", value: c.speed || 1, step: 0.1, min: 0.5, max: 2.0, decimals: 1, span: 8,
        onChange: async (v) => {
          c.speed = Math.max(0.5, Math.min(2.0, v));
          await saveProject();
          Preview.load(project);
          renderTimeline();
        } });

    UI.numberField(document.getElementById("video-volume-field"),
      { label: "VOLUME", unit: "%", value: Math.round((c.volume ?? 1) * 100), step: 5, min: 0, max: 200, decimals: 0, span: 6,
        onChange: async (v) => {
          c.volume = Math.max(0, Math.min(2, v / 100));
          await saveProject();
          Preview.load(project);
        } });

    const muteBtn = document.getElementById("video-mute-btn");
    const iconVolume = muteBtn.querySelector(".icon-volume");
    const iconMuted = muteBtn.querySelector(".icon-volume-muted");
    function updateMuteIcon() {
      iconVolume.classList.toggle("icon-hidden", c.muted);
      iconMuted.classList.toggle("icon-hidden", !c.muted);
      muteBtn.setAttribute("aria-pressed", String(!!c.muted));
    }
    updateMuteIcon();
    muteBtn.onclick = async () => {
      c.muted = !c.muted;
      updateMuteIcon();
      await saveProject();
      Preview.load(project);
    };

    document.getElementById("video-delete").onclick = () => deleteClip(c.id);

    AudioTrackPanel.render();
  }

  // Removes a clip from the sequence: shifts project.captions.words to close the gap the deleted
  // clip's range leaves (removing any words that fell inside it), renumbers the remaining clips'
  // `order` so no gaps appear, drops its clipDurations cache entry, clears selection back to a
  // neutral panel, and if the playhead was inside the deleted clip's timeline range, seeks it to
  // that clip's former start (clamped to the shorter post-delete sequence duration).
  async function deleteClip(clipId) {
    const c = project.clips.find((x) => x.id === clipId);
    if (!c) return;

    const ordered = [...project.clips].sort((a, b) => a.order - b.order);
    let start = 0;
    for (const clip of ordered) {
      if (clip.id === c.id) break;
      start += (clip.out_point - clip.in_point) / (clip.speed || 1);
    }
    const duration = (c.out_point - c.in_point) / (c.speed || 1);
    const wasInside = (() => {
      const t = parseFloat(document.getElementById("time").textContent) || 0;
      return t >= start && t < start + duration;
    })();

    if (project.captions) {
      project.captions.words = CaptionClipSync.shiftCaptionsAfterEdit(project.captions.words, start, duration, 0);
    }

    project.clips = project.clips.filter((x) => x.id !== clipId);
    project.clips.sort((a, b) => a.order - b.order).forEach((x, i) => { x.order = i; });
    delete clipDurations[clipId];

    await saveProject();
    Preview.load(project);
    MediaPanel.render();
    openFilesPanel();

    if (wasInside) {
      const newTotal = Preview.sequenceDuration(project.clips);
      Preview.seek(newTotal > 0 ? Math.min(start, Math.max(0, newTotal - 0.001)) : 0);
    }
  }

  function select(c) {
    selected = { type: "video", item: c };
    showPanel("video");
    render(c);
    renderTimeline();
  }

  // Reindexes project.clips so `clipId` ends up at position `newIndex` (0-based, among clips
  // ordered by `.order`), renumbering every clip's `.order` to 0..n-1 gap-free. `newIndex` is
  // clamped to the valid range. Re-times project.captions.words to follow their clips: each
  // word shifts by its own owning clip's start delta (see caption-clip-sync.js), since a reorder
  // is a non-monotonic permutation, not a single splice point. Shared by the VIDEO panel's
  // move-up/down buttons and the timeline's drag-to-reorder gesture (static/timeline-clip-drag.js).
  async function moveClipTo(clipId, newIndex) {
    const list = [...project.clips].sort((a, b) => a.order - b.order);
    const from = list.findIndex((c) => c.id === clipId);
    if (from === -1) return;
    const clamped = Math.max(0, Math.min(newIndex, list.length - 1));
    const oldRanges = CaptionClipSync.clipRanges(list);
    const [moved] = list.splice(from, 1);
    list.splice(clamped, 0, moved);
    list.forEach((c, i) => { c.order = i; });
    if (project.captions) {
      const newRanges = CaptionClipSync.clipRanges(list);
      project.captions.words = CaptionClipSync.resyncCaptionsAfterReorder(project.captions.words, oldRanges, newRanges);
    }
    await saveProject();
    Preview.load(project);
    renderTimeline();
  }

  window.VideoPanel.render = render;
  window.VideoPanel.select = select;
  window.VideoPanel.deleteClip = deleteClip;
  window.VideoPanel.moveClipTo = moveClipTo;
})();

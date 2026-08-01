// Timeline strip: pure row-position math (mirrors app/timeline.py) + rendering for
// toolbar (zoom/time readout)/ruler/playhead/playhead-handle box/TEXT/CAPTIONS/VIDEO BOX/VIDEO/AUDIO
// rows into the DOM ids defined in index.html. The AUDIO row renders real per-clip + music
// waveforms via TimelineAudioRow (static/timeline-audio-row.js) — see that file for detail.
// Empty rows are collapsed out of the timeline (row + aligned label hidden together via
// setRowVisible): only VIDEO always shows; TEXT/CAPTIONS/VIDEO BOX appear only when they have
// content, and AUDIO appears when there's a music track or a clip with an audio stream to draw.
// The playhead-handle box (#slice-btn) tracks the playhead
// and holds two icons: a grip-vertical handle (dragged in editor.js to scrub the playhead)
// and a scissors icon (static/timeline-slice.js wires its click; updateSliceButton below only
// drives its disabled-state indicator, priority-aware as of video-box-slice-priority: a
// selected video box active at the playhead is checked instead of the main clip list).
// Zoomable pixels-per-second scale: the timeline always shows a fixed window of
// `visibleSeconds` seconds across the scroll container's width. Defaults to 30s; the
// toolbar −/+ buttons zoom in/out by 10s steps, clamped to at least [10s, 120s] (see
// below). Not persisted, reset to the 30s default on every project open (editor.js
// calls Timeline.resetZoom()). Auto-fit: every render() widens `visibleSeconds` to
// fit the video clips' own timeline length (videoDuration, fitVisibleSeconds) unless
// the user has manually zoomed (manualZoom flag, set by zoomIn/zoomOut, cleared by
// resetZoom) — so adding clips grows the visible window automatically until the user
// takes manual control. Text/caption/video-box layers that run longer than the video
// don't inflate this default fit (though they still extend the ruler/scroll range via
// totalDuration, so they remain reachable by scrolling or manual zoom-out).
// #timeline-scroll provides horizontal scroll once zoomed content exceeds the viewport.
// The ruler's timestamp density follows that zoom (tickStep): the step is picked from a
// 1/2/5/10/15/30/60/120/300/600s ladder so labels stay >= MIN_TICK_LABEL_PX apart instead
// of smearing together into an unreadable band when zoomed out.
// render()'s 5th `actions = {}` param ({ onAddClip }) renders a small dashed "+" button
// after the VIDEO row's clip sequence (at x=0 when empty), giving a visible way to add a
// clip beyond the console. TEXT blocks are added via the left icon rail's TEXT entry instead
// (see panel-nav.js); TEXT-row and IMAGE BOX lanes instead render a right-edge resize handle
// (`resizable` option on addBlock, dataset.blockId set on each block) driven by
// timeline-text-resize.js / timeline-image-resize.js respectively.
// MAIN and AUDIO's labels get a static, non-interactive lock icon (ensureFixedRowLockIcons,
// idempotent, called from render()) signaling they can never be reordered — see the overlay
// row's own per-layer lock toggle in renderOverlaysRow/timeline-overlay-layer-drag.js instead.
// Every row/lane label is also clickable (added 2026-07-31, layer-sidepanel-timeline-click):
// an overlay lane's label text (`.overlay-lane-label-text`, sibling of its lock/drag handle
// icon so the two interactions stay independent) selects that lane's own item and opens its
// panel, same as clicking its block; #label-video falls back through the currently-selected
// clip, else the first clip; #label-audio reuses `actions.onSelectAudio` (same as `#row-audio`'s
// existing content click); #label-captions calls the new `actions.onOpenCaptionsPanel`. All
// three fixed-row labels bind their listener once via the existing `dataset.selectBound` guard.
// Exposes window.Timeline.{render, groupWords, timeAtX, tick, resetZoom, PX_PER_SEC}.
// PX_PER_SEC is a live getter reflecting the current zoom level (see the header comment
// above for the zoom scale itself). tick() is a cheap playhead-only update driven every
// animation frame during playback (see editor.js), so motion stays smooth between the
// heavier full render() calls. Depends on Preview (preview.js).
window.Timeline = (() => {
  const LABEL_WIDTH = 88;
  const LANE_HEIGHT = 44; // px per overlay-stack lane, matches CAPTIONS row height
  const MIN_PX_PER_SEC_FLOOR = 60; // fallback if the scroll container can't be measured yet
  const MIN_TICK_LABEL_PX = 48; // min gap between ruler timestamps ("00:00" is ~27px at 9px)
  const DEFAULT_VISIBLE_SECONDS = 30;
  const ZOOM_STEP_SECONDS = 10;
  const MIN_VISIBLE_SECONDS = 10;
  const MAX_VISIBLE_SECONDS = 120;
  let lastDuration = 1;
  let lastProject = null;
  let lastTimelineTime = 0;
  let lastSelected = null;
  let visibleSeconds = DEFAULT_VISIBLE_SECONDS;
  let manualZoom = false;

  // Pixels-per-second scale that fits `visibleSeconds` seconds across the scroll container's
  // width. Recomputed fresh every call (not cached) since the container can resize (panel
  // collapse/expand, window resize).
  function currentPxPerSecond() {
    const scrollEl = document.getElementById("timeline-scroll");
    const w = scrollEl ? scrollEl.clientWidth : 0;
    if (!w) return MIN_PX_PER_SEC_FLOOR;
    return w / visibleSeconds;
  }

  // Widens the visible window to fit the given duration (plus a little trailing
  // padding so the last block's add-button/resize-handle isn't flush against the
  // container's right edge), used for auto-fit and as the manual zoom-out ceiling.
  function fitVisibleSeconds(duration) {
    return Math.max(DEFAULT_VISIBLE_SECONDS, Math.ceil(duration) + 2);
  }

  // Default auto-fit target: the video clips' own timeline length, not the
  // possibly-longer max across text/caption/video-box layers (totalDuration) —
  // so opening a project shows the video filling the width instead of leaving
  // blank timeline space after it just because some other layer runs longer.
  function videoDuration(project) {
    return Math.max(sequenceDuration(ordered(project.clips || [])), 1);
  }

  function zoomIn() {
    manualZoom = true;
    visibleSeconds = Math.max(MIN_VISIBLE_SECONDS, visibleSeconds - ZOOM_STEP_SECONDS);
  }

  function zoomOut() {
    manualZoom = true;
    const ceiling = lastProject ? Math.max(MAX_VISIBLE_SECONDS, fitVisibleSeconds(totalDuration(lastProject))) : MAX_VISIBLE_SECONDS;
    visibleSeconds = Math.min(ceiling, visibleSeconds + ZOOM_STEP_SECONDS);
  }

  function resetZoom() {
    visibleSeconds = DEFAULT_VISIBLE_SECONDS;
    manualZoom = false;
  }

  function ordered(list) {
    return [...list].sort((a, b) => a.order - b.order);
  }
  function clipDuration(c) {
    return (c.out_point - c.in_point) / (c.speed || 1);
  }
  function sequenceDuration(clips) {
    return clips.reduce((sum, c) => sum + clipDuration(c), 0);
  }
  function videoBoxEnd(v) {
    return v.start + (v.out_point - v.in_point);
  }

  function groupWords(words, max = 4) {
    const expanded = words.flatMap((word) => Timeline.estimateWordTimings(word));
    const sorted = expanded.sort((a, b) => a.t_start - b.t_start);
    const groups = [];
    for (let i = 0; i < sorted.length; i += max) groups.push(sorted.slice(i, i + max));
    return groups;
  }

  function formatTime(s) {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  }

  // mm:ss.s readout for the toolbar, e.g. "00:03.4".
  function formatTimeDeci(s) {
    const m = Math.floor(s / 60);
    const rem = s - m * 60;
    return `${String(m).padStart(2, "0")}:${rem.toFixed(1).padStart(4, "0")}`;
  }

  // Lightweight update for smooth, high-frequency playhead motion during playback:
  // moves just the playhead/SLICE button/time readout, skipping the track rebuild that
  // full render() does (rebuilding all block DOM nodes every animation frame would be
  // wasteful and can visibly jank).
  function tick(timelineTime) {
    lastTimelineTime = timelineTime;
    document.getElementById("playhead").style.left = `${timelineTime * currentPxPerSecond()}px`;
    document.getElementById("timeline-time").textContent =
      `${formatTimeDeci(timelineTime)} / ${formatTimeDeci(lastDuration)}`;
    autoScrollToPlayhead(timelineTime);
    updateSliceButton();
  }

  function updateSliceButton() {
    const btn = document.getElementById("slice-btn");
    const scrollEl = document.getElementById("timeline-scroll");
    const playhead = document.getElementById("playhead");
    const left = parseFloat(playhead.style.left) || 0;
    btn.style.left = `${LABEL_WIDTH + left - scrollEl.scrollLeft}px`;

    const sliceAction = document.getElementById("slice-action");
    const activeBox = (lastSelected && lastSelected.type === "video-box" && Timeline.isBoxActiveAt(lastSelected.item, lastTimelineTime))
      ? lastSelected.item
      : null;
    const disabled = activeBox
      ? Timeline.isBoxSliceDisabled(activeBox, lastTimelineTime)
      : Timeline.isSliceDisabled((lastProject && lastProject.clips) || [], lastTimelineTime);
    sliceAction.classList.toggle("disabled", disabled);
  }

  // Keeps the playhead within view during playback by nudging #timeline-scroll's scrollLeft
  // when the playhead nears either visible edge. Only called from tick() (the playback RAF
  // loop) — manual scrubbing/scrolling elsewhere is left entirely to the user.
  function autoScrollToPlayhead(timelineTime) {
    const scrollEl = document.getElementById("timeline-scroll");
    const x = timelineTime * currentPxPerSecond();
    const margin = 40;
    if (x < scrollEl.scrollLeft + margin) {
      scrollEl.scrollLeft = Math.max(0, x - margin);
    } else if (x > scrollEl.scrollLeft + scrollEl.clientWidth - margin) {
      scrollEl.scrollLeft = x - scrollEl.clientWidth + margin;
    }
  }

  // Total duration must cover video, text blocks, and captions — not just the clip
  // sequence — otherwise rows with content past the video's end render off-scale.
  function totalDuration(project) {
    const clips = ordered(project.clips || []);
    let d = sequenceDuration(clips);
    for (const b of project.text_blocks || []) d = Math.max(d, b.end);
    for (const v of project.video_boxes || []) d = Math.max(d, videoBoxEnd(v));
    for (const w of (project.captions || {}).words || []) d = Math.max(d, w.t_end);
    return Math.max(d, 1);
  }

  function timeAtX(clips, rulerRect, clientX) {
    return Math.max(0, (clientX - rulerRect.left) / currentPxPerSecond());
  }

  function clearTrack(id) {
    const el = document.getElementById(id);
    el.innerHTML = "";
    return el;
  }

  // Show/hide a row and its aligned left-column label together, so empty tracks
  // (and their labels) collapse out of the timeline. `rowName` is the data-row
  // value, which also matches the label id (`label-<rowName>`). VIDEO is never
  // toggled — it always stays visible.
  function setRowVisible(rowName, visible) {
    const row = document.querySelector(`.timeline-row[data-row="${rowName}"]`);
    const label = document.getElementById(`label-${rowName}`);
    if (row) row.hidden = !visible;
    if (label) label.hidden = !visible;
  }

  // Small + button appended after a row's content (VIDEO: end of the clip sequence,
  // TEXT: after the last block). Only rendered when the caller passes the action.
  function addRowAddButton(track, left, label, onClick) {
    const btn = UI.button(track, {
      icon: "plus",
      size: "sm",
      intent: "dashed",
      onClick: (e) => { e.stopPropagation(); onClick(); },
    });
    btn.classList.add("row-add-button");
    btn.title = label;
    btn.setAttribute("aria-label", label);
    btn.style.left = `${left}px`;
  }

  function addBlock(track, left, width, label, selected, onClick, { resizable } = {}) {
    const div = document.createElement("div");
    div.className = "timeline-block" + (selected ? " selected" : "");
    div.style.left = `${left}px`;
    div.style.width = `${Math.max(width, 4)}px`;
    const span = document.createElement("span");
    span.textContent = label;
    div.appendChild(span);
    div.addEventListener("click", (e) => { e.stopPropagation(); onClick(); });
    if (resizable) {
      const startHandle = document.createElement("div");
      startHandle.className = "timeline-resize-handle timeline-resize-handle-start";
      div.appendChild(startHandle);
      const endHandle = document.createElement("div");
      endHandle.className = "timeline-resize-handle timeline-resize-handle-end";
      div.appendChild(endHandle);
    }
    track.appendChild(div);
  }

  // Smallest "nice" step (seconds) whose labels are still at least MIN_TICK_LABEL_PX apart
  // at the current zoom. Zooming out used to keep a fixed 2s step, so labels overlapped into
  // an unreadable smear; now the ruler thins them out instead. Pure.
  function tickStep(px, minLabelPx = MIN_TICK_LABEL_PX) {
    const ladder = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600];
    return ladder.find((s) => s * px >= minLabelPx) || ladder[ladder.length - 1];
  }

  function renderRuler(duration, px) {
    const ruler = document.getElementById("timeline-ruler");
    ruler.querySelectorAll(".tick").forEach((t) => t.remove());
    const step = tickStep(px);
    for (let s = 0; s <= Math.ceil(duration); s += step) {
      const tick = document.createElement("div");
      tick.className = "tick";
      tick.style.left = `${s * px}px`;
      tick.textContent = formatTime(s);
      ruler.appendChild(tick);
    }
  }

  // Merges TEXT blocks + VIDEO BOX + IMAGE BOX layers into one z_index-ordered stack of 44px
  // lanes inside #row-overlays (top = highest z_index = frontmost), replacing the old separate
  // TEXT/VIDEO BOX rows. Each lane still renders its item exactly as before (time-positioned
  // block, resize handle for text/image boxes/shapes) — only the vertical grouping/order changed.
  // As of 2026-07-31 (overlay-lane-time-drag), every lane's block also carries dataset.blockId
  // (video boxes included) and drag-to-reposition-in-time is wired in
  // static/timeline-overlay-time-drag.js, which also folds in dragging a VIDEO BOX onto the VIDEO
  // row to stitch it into the main sequence — replacing the native HTML5 draggable/dragstart
  // wiring this branch used to set. #label-overlays gets one "TEXT"/"VIDEO BOX"/"IMAGE"/"SHAPE"
  // label per lane, height-matched to its lane.
  // Reordering (drag handle) is wired in static/timeline-overlay-layer-drag.js via
  // OverlayLayers.mergedEntries/renumber. A lane with entry.item.locked shows a "lock" icon
  // instead of "grip-vertical" and is not draggable — see
  // static/timeline-overlay-layer-drag.js for the click-to-toggle/drag-skip logic.
  // As of the layer-masking-system feature, every video_box/image_box lane gets an extra
  // expand/collapse chevron opening a nested 32px MASK sub-lane — either the assigned mask
  // shape's own clickable lane (opens #panel-shape via onSelect({type:"shape", ...})), or a
  // UI.maskTypeGallery "+ Add mask" gallery whose sole "Shape" card creates a new ShapeLayer
  // sized/positioned to the box via ShapePanel.createShapeAt, with `duration` set to match the
  // box's own visible window (videoBoxEnd(v) - v.start for a video_box, box.duration directly
  // for an image_box — not ShapeDefaults' constant 3s), assigns it as box.mask_shape_id, and
  // selects it. The mask shape itself is excluded from `entries` by OverlayLayers.mergedEntries
  // (Task 8), so it never also renders as its own top-level lane. See
  // static/timeline-mask-accordion.js for the accordion's own implementation (chevron, expand
  // state, nested lane, gallery, shape-creation flow).
  function renderOverlaysRow(project, px, selected, onSelect) {
    const entries = OverlayLayers.mergedEntries(project);
    const rowEl = document.querySelector('.timeline-row[data-row="overlays"]');
    const totalHeight = `${Math.max(entries.length, 1) * LANE_HEIGHT + MaskAccordion.expandedHeightFor(entries)}px`;
    rowEl.style.height = totalHeight;
    document.getElementById("label-overlays").style.height = totalHeight;

    const row = clearTrack("row-overlays");
    const labelContainer = clearTrack("label-overlays");

    for (const entry of entries) {
      const laneLabel = document.createElement("div");
      laneLabel.className = "row-label overlay-lane-label" + (entry.item.locked ? " locked" : "");
      laneLabel.dataset.entryId = entry.id;
      const handleIcon = entry.item.locked ? "lock" : "grip-vertical";
      const handleTitle = entry.item.locked ? "Locked — click to unlock" : "Lock layer";
      laneLabel.innerHTML = `<span class="overlay-lane-handle" title="${handleTitle}">${UI.icon(handleIcon, { size: 14 })}</span>`;
      const text = document.createElement("span");
      text.className = "overlay-lane-label-text";
      text.textContent = entry.kind === "text" ? "TEXT" : entry.kind === "video_box" ? "VIDEO" : entry.kind === "image_box" ? "IMAGE" : "SHAPE";
      text.addEventListener("click", () => {
        if (entry.kind === "text") onSelect({ type: "text", item: entry.item });
        else if (entry.kind === "video_box") onSelect({ type: "video-box", item: entry.item });
        else if (entry.kind === "image_box") onSelect({ type: "image-box", item: entry.item });
        else onSelect({ type: "shape", item: entry.item });
      });
      laneLabel.appendChild(text);
      labelContainer.appendChild(laneLabel);

      const laneTrack = document.createElement("div");
      laneTrack.className = "row-track overlay-lane-track";
      row.appendChild(laneTrack);

      if (entry.kind === "text") {
        const b = entry.item;
        const isSel = !!selected && selected.type === "text" && !!selected.item && selected.item.id === b.id;
        addBlock(laneTrack, b.start * px, (b.end - b.start) * px, b.heading, isSel,
          () => onSelect({ type: "text", item: b }), { resizable: true });
        laneTrack.lastElementChild.dataset.blockId = b.id;
      } else if (entry.kind === "video_box") {
        const v = entry.item;
        const isSel = !!selected && selected.type === "video-box" && !!selected.item && selected.item.id === v.id;
        const name = v.file_path.split(/[\\/]/).pop();
        addBlock(laneTrack, v.start * px, (videoBoxEnd(v) - v.start) * px, name, isSel,
          () => onSelect({ type: "video-box", item: v }));
        laneTrack.lastElementChild.dataset.blockId = v.id;
      } else if (entry.kind === "image_box") {
        const b = entry.item;
        const isSel = !!selected && selected.type === "image-box" && !!selected.item && selected.item.id === b.id;
        const name = b.file_path.split(/[\\/]/).pop();
        addBlock(laneTrack, b.start * px, b.duration * px, name, isSel,
          () => onSelect({ type: "image-box", item: b }), { resizable: true });
        laneTrack.lastElementChild.dataset.blockId = b.id;
      } else {
        const s = entry.item;
        const isSel = !!selected && selected.type === "shape" && !!selected.item && selected.item.id === s.id;
        addBlock(laneTrack, s.start * px, s.duration * px, "Shape", isSel,
          () => onSelect({ type: "shape", item: s }), { resizable: true });
        laneTrack.lastElementChild.dataset.blockId = s.id;
      }

      OverlayCopyToolbar.attach(laneTrack.lastElementChild, entry);

      if (entry.kind === "video_box" || entry.kind === "image_box") {
        MaskAccordion.attach(laneLabel, labelContainer, row, px, selected, project, entry, onSelect);
      }
    }
  }

  // MAIN and AUDIO are fixed rows outside the draggable overlay stack (unlike TEXT/VIDEO
  // BOX/IMAGE BOX, they were never reorderable in the first place) — this is a purely static
  // visual cue, not a per-layer toggle, so it's rendered once and left alone rather than
  // rebuilt every render() the way overlay lanes are.
  function ensureFixedRowLockIcons() {
    for (const rowName of ["video", "audio"]) {
      const label = document.getElementById(`label-${rowName}`);
      if (!label || label.querySelector(".row-label-lock")) continue;
      const icon = document.createElement("span");
      icon.className = "row-label-lock";
      icon.innerHTML = UI.icon("lock", { size: 14 });
      icon.title = "Always locked";
      label.prepend(icon);
    }
  }

  function render(project, timelineTime, selected, onSelect, actions = {}) {
    ensureFixedRowLockIcons();
    const clips = ordered(project.clips || []);
    const duration = totalDuration(project);
    lastDuration = duration;
    lastProject = project;
    lastTimelineTime = timelineTime;
    lastSelected = selected;
    if (!manualZoom) visibleSeconds = fitVisibleSeconds(videoDuration(project));
    const px = currentPxPerSecond();
    const contentWidth = duration * px;
    document.getElementById("timeline-content").style.width = `${contentWidth}px`;

    renderRuler(duration, px);
    document.getElementById("playhead").style.left = `${timelineTime * px}px`;
    document.getElementById("timeline-time").textContent =
      `${formatTimeDeci(timelineTime)} / ${formatTimeDeci(duration)}`;
    updateSliceButton();
    TimelineAudioRow.render(project, px, () => renderTimeline());
    const audioTrack = document.getElementById("row-audio");
    if (!audioTrack.dataset.selectBound) {
      audioTrack.dataset.selectBound = "1";
      audioTrack.addEventListener("click", () => actions.onSelectAudio && actions.onSelectAudio());
    }

    const videoLabel = document.getElementById("label-video");
    if (videoLabel && !videoLabel.dataset.selectBound) {
      videoLabel.dataset.selectBound = "1";
      videoLabel.addEventListener("click", () => {
        const currentClips = ordered((lastProject && lastProject.clips) || []);
        if (!currentClips.length) return;
        const current = lastSelected && lastSelected.type === "video"
          ? currentClips.find((c) => c.id === lastSelected.item.id)
          : null;
        onSelect({ type: "video", item: current || currentClips[0] });
      });
    }
    const audioLabel = document.getElementById("label-audio");
    if (audioLabel && !audioLabel.dataset.selectBound) {
      audioLabel.dataset.selectBound = "1";
      audioLabel.addEventListener("click", () => actions.onSelectAudio && actions.onSelectAudio());
    }
    const captionsLabel = document.getElementById("label-captions");
    if (captionsLabel && !captionsLabel.dataset.selectBound) {
      captionsLabel.dataset.selectBound = "1";
      captionsLabel.addEventListener("click", () => actions.onOpenCaptionsPanel && actions.onOpenCaptionsPanel());
    }

    const scrollEl = document.getElementById("timeline-scroll");
    if (!scrollEl.dataset.sliceBound) {
      scrollEl.dataset.sliceBound = "1";
      scrollEl.addEventListener("scroll", updateSliceButton);
    }

    const videoTrack = clearTrack("row-video");
    let acc = 0;
    for (const c of clips) {
      const d = clipDuration(c);
      const media = project.media_library.find((m) => m.id === c.media_id);
      const name = (media && (media.name || media.file_path.split(/[\\/]/).pop())) || c.file_path.split(/[\\/]/).pop();
      const isSel = !!selected && selected.type === "video" && selected.item.id === c.id;
      addBlock(videoTrack, acc * px, d * px, name, isSel, () => onSelect({ type: "video", item: c }));
      const blockEl = videoTrack.lastElementChild;
      blockEl.dataset.clipId = c.id;
      if (media && media.kind !== "audio") {
        TimelineVideoRow.render(blockEl, c, media, px, () => renderTimeline());
      }
      acc += d;
    }
    if (actions.onAddClip) addRowAddButton(videoTrack, acc * px, "Add clip", actions.onAddClip);

    renderOverlaysRow(project, px, selected, onSelect);

    const capTrack = clearTrack("row-captions");
    const groups = project.captions ? groupWords(project.captions.words) : [];
    groups.forEach((g, i) => {
      const start = g[0].t_start, end = g[g.length - 1].t_end;
      const label = g.map((w) => w.text).join(" ");
      const isSel = !!selected && selected.type === "caption" && selected.groupIndex === i;
      addBlock(capTrack, start * px, (end - start) * px, label, isSel,
        () => onSelect({ type: "caption", item: g, groupIndex: i }));
    });

    // Collapse empty tracks out of the timeline: only VIDEO always shows. Rows reappear
    // automatically once content is added, since render() runs on every change. AUDIO shows
    // real per-clip + music waveforms (see TimelineAudioRow above), so it's "empty" only when
    // there's no music and no clip with an audio track to draw.
    const mediaById = new Map((project.media_library || []).map((m) => [m.id, m]));
    const hasAudioContent = !!project.music || clips.some((c) => {
      const media = mediaById.get(c.media_id);
      return media && media.has_audio;
    });
    setRowVisible("overlays", (project.text_blocks || []).length > 0 || (project.video_boxes || []).length > 0 || (project.image_boxes || []).length > 0 || (project.shapes || []).length > 0);
    setRowVisible("captions", groups.length > 0);
    setRowVisible("audio", hasAudioContent);
  }

  document.getElementById("zoom-in").addEventListener("click", () => { zoomIn(); renderTimeline(); });
  document.getElementById("zoom-out").addEventListener("click", () => { zoomOut(); renderTimeline(); });

  return {
    render, groupWords, timeAtX, tick, resetZoom,
    get PX_PER_SEC() { return currentPxPerSecond(); },
  };
})();

// Timeline strip: pure row-position math (mirrors app/timeline.py) + rendering for
// toolbar (zoom/time readout)/ruler/playhead/playhead-handle box/TEXT/CAPTIONS/VIDEO BOX/VIDEO/AUDIO
// rows into the DOM ids defined in index.html. The AUDIO row renders real per-clip + music
// waveforms via TimelineAudioRow (static/timeline-audio-row.js) — see that file for detail.
// Empty rows are collapsed out of the timeline (row + aligned label hidden together via
// setRowVisible): only VIDEO always shows; TEXT/CAPTIONS/VIDEO BOX appear only when they have
// content, and AUDIO appears when there's a music track or a clip with an audio stream to draw.
// The playhead-handle box (#slice-btn) tracks the playhead
// and holds two icons: a grip-vertical handle (dragged in editor.js to scrub the playhead)
// and a scissors icon (visual only, no slice feature yet).
// Zoomable pixels-per-second scale: the timeline always shows a fixed window of
// `visibleSeconds` seconds across the scroll container's width. Defaults to 30s; the
// toolbar −/+ buttons zoom in/out by 10s steps, clamped to at least [10s, 120s] (see
// below). Not persisted, reset to the 30s default on every project open (editor.js
// calls Timeline.resetZoom()). Auto-fit: every render() widens `visibleSeconds` to
// fit the project's whole content (fitVisibleSeconds) unless the user has manually
// zoomed (manualZoom flag, set by zoomIn/zoomOut, cleared by resetZoom) — so adding
// clips grows the visible window automatically until the user takes manual control.
// #timeline-scroll provides horizontal scroll once zoomed content exceeds the viewport.
// render()'s 5th `actions = {}` param ({ onAddClip }) renders a small dashed "+" button
// after the VIDEO row's clip sequence (at x=0 when empty), giving a visible way to add a
// clip beyond the console. TEXT blocks are added via the left icon rail's TEXT entry instead
// (see panel-nav.js); TEXT-row blocks instead render a right-edge resize handle (`resizable`
// option on addBlock, dataset.blockId set on each block) driven by timeline-text-resize.js.
// Exposes window.Timeline.{render, groupWords, timeAtX, tick, resetZoom, PX_PER_SEC}.
// PX_PER_SEC is a live getter reflecting the current zoom level (see the header comment
// above for the zoom scale itself). tick() is a cheap playhead-only update driven every
// animation frame during playback (see editor.js), so motion stays smooth between the
// heavier full render() calls. Depends on Preview (preview.js).
window.Timeline = (() => {
  const LABEL_WIDTH = 88;
  const LANE_HEIGHT = 44; // px per overlay-stack lane, matches CAPTIONS row height
  const MIN_PX_PER_SEC_FLOOR = 60; // fallback if the scroll container can't be measured yet
  const DEFAULT_VISIBLE_SECONDS = 30;
  const ZOOM_STEP_SECONDS = 10;
  const MIN_VISIBLE_SECONDS = 10;
  const MAX_VISIBLE_SECONDS = 120;
  let lastDuration = 1;
  let lastProject = null;
  let lastTimelineTime = 0;
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

  // Widens the visible window to fit the whole project (plus a little trailing
  // padding so the last block's add-button/resize-handle isn't flush against the
  // container's right edge), used for auto-fit and as the manual zoom-out ceiling.
  function fitVisibleSeconds(duration) {
    return Math.max(DEFAULT_VISIBLE_SECONDS, Math.ceil(duration) + 2);
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
    const clips = (lastProject && lastProject.clips) || [];
    const disabled = Timeline.isSliceDisabled(clips, lastTimelineTime);
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
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "row-add-btn";
    btn.title = label;
    btn.setAttribute("aria-label", label);
    btn.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>`;
    btn.style.left = `${left}px`;
    btn.addEventListener("click", (e) => { e.stopPropagation(); onClick(); });
    track.appendChild(btn);
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
      const handle = document.createElement("div");
      handle.className = "timeline-resize-handle";
      div.appendChild(handle);
    }
    track.appendChild(div);
  }

  function renderRuler(duration, px) {
    const ruler = document.getElementById("timeline-ruler");
    ruler.querySelectorAll(".tick").forEach((t) => t.remove());
    for (let s = 0; s <= Math.ceil(duration); s += 2) {
      const tick = document.createElement("div");
      tick.className = "tick";
      tick.style.left = `${s * px}px`;
      tick.textContent = formatTime(s);
      ruler.appendChild(tick);
    }
  }

  // Merges TEXT blocks + VIDEO BOX layers into one z_index-ordered stack of 44px lanes
  // inside #row-overlays (top = highest z_index = frontmost), replacing the old separate
  // TEXT/VIDEO BOX rows. Each lane still renders its item exactly as before (time-positioned
  // block, resize handle for text, drag-to-timeline for video boxes) — only the vertical
  // grouping/order changed. #label-overlays gets one "TEXT"/"VIDEO BOX" label per lane,
  // height-matched to its lane. Reordering (drag handle) is wired in
  // static/timeline-overlay-layer-drag.js via OverlayLayers.mergedEntries/renumber.
  function renderOverlaysRow(project, px, selected, onSelect) {
    const entries = OverlayLayers.mergedEntries(project);
    const rowEl = document.querySelector('.timeline-row[data-row="overlays"]');
    const totalHeight = `${Math.max(entries.length, 1) * LANE_HEIGHT}px`;
    rowEl.style.height = totalHeight;
    document.getElementById("label-overlays").style.height = totalHeight;

    const row = clearTrack("row-overlays");
    const labelContainer = clearTrack("label-overlays");

    for (const entry of entries) {
      const laneLabel = document.createElement("div");
      laneLabel.className = "row-label overlay-lane-label";
      laneLabel.dataset.entryId = entry.id;
      laneLabel.innerHTML = `<span class="overlay-lane-handle"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="5" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="19" r="1"/></svg></span>`;
      const text = document.createElement("span");
      text.textContent = entry.kind === "text" ? "TEXT" : "VIDEO BOX";
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
      } else {
        const v = entry.item;
        const isSel = !!selected && selected.type === "video-box" && !!selected.item && selected.item.id === v.id;
        const name = v.file_path.split(/[\\/]/).pop();
        addBlock(laneTrack, v.start * px, (videoBoxEnd(v) - v.start) * px, name, isSel,
          () => onSelect({ type: "video-box", item: v }));
        const el = laneTrack.lastElementChild;
        el.draggable = true;
        el.addEventListener("dragstart", (e) => e.dataTransfer.setData("text/video-box-id", v.id));
      }
    }
  }

  function render(project, timelineTime, selected, onSelect, actions = {}) {
    const clips = ordered(project.clips || []);
    const duration = totalDuration(project);
    lastDuration = duration;
    lastProject = project;
    lastTimelineTime = timelineTime;
    if (!manualZoom) visibleSeconds = fitVisibleSeconds(duration);
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
    setRowVisible("overlays", (project.text_blocks || []).length > 0 || (project.video_boxes || []).length > 0);
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

// Preview stage playback: plays a project's clips back-to-back in timeline order, and composites
// the text-block overlay (renderText) and caption overlay (renderCaptions) on top. Text/caption
// divs and video-box <video> elements (see video-box-preview.js) are siblings inside #overlay and
// each set an explicit CSS z-index from their model's z_index field, so browser stacking follows
// the project's cross-layer z-order.
// applyFillModeClass(clip) toggles #player's .fill-mode-fill class (stage.css) to switch between
// FIT (object-fit: contain) and FILL (object-fit: cover) per ClipLayer.fill_mode; called from both
// playClipAt and seek's clip-switch branch, the two places player.src changes for a new clip.
// In BOX FILL mode, renderText() also auto-computes and persists preset.size_px via
// window.FontFit before laying out the div.
// renderCaptions() groups project.captions.words via Timeline.groupWords (max_words_per_line),
// finds the group active at the given timelineTime, and renders it as one .caption-block with a
// per-word highlight color driven by preset.highlight_mode ("current_word" | "progressive_fill").
// playClipAt() also prefetches the *next* clip's file into a hidden second <video> element
// (preloadPlayer) as soon as the current clip starts, so the browser's HTTP cache is warm by the
// time the real player.src swap happens at the join — smooths the visible stall that a cold
// network fetch at the clip boundary otherwise causes.
// Exposes window.Preview.{load, seek, renderText, renderCaptions, currentTimelineTime, play, pause, restart, isPaused, setSelectedTextBlock, setOnStageTextActivate, getActiveFormatSelection}. Mirrors app/timeline.py's ordered/locate. Thin — DOM wiring only.
// getActiveFormatSelection() -> {blockId, start, end} | null tracks the current non-collapsed
// stage text selection (set via onSelectionChange, cleared on block switch or collapse), consumed
// by the FONT accordion (text-panel-font-style.js/text-panel-font-weight.js) to decide whether a
// control change writes a per-range FormatRun or the block's base preset.
// When project.clips is empty, playback runs on an internal virtual clock (performance.now()-based)
// instead of the <video> element's timeupdate/play/pause events, so text/caption-only projects
// stay scrubbable/playable in preview. Preview.isPaused() abstracts over both modes for callers.
window.Preview = (() => {
  let clips = [];
  let activeIndex = -1;
  let textProject = null;
  let textPresets = {};
  let selectedTextBlockId = null;
  let boxResizeCallbacks = null;
  let editingBlockId = null;
  let editingDiv = null;
  let onStageTextActivate = null;
  let activeFormatSelection = null;
  // Virtual clock driving playback when there are zero video clips (text/captions-only
  // projects) — the video element has no src/timeupdate events to drive off of in that case.
  let virtualTime = 0;
  let virtualPlaying = false;
  let virtualRafId = null;
  let virtualLastTs = 0;
  const fitCache = new Map(); // blockId -> { key: string, size: number }
  const player = document.getElementById("player");
  const timeEl = document.getElementById("time");
  const overlay = document.getElementById("overlay");
  const stage = document.getElementById("stage");
  // Hidden second <video> used only to prefetch the next clip's file into the browser's HTTP
  // cache while the current clip is still playing, so the real player.src swap at the clip
  // boundary (playClipAt) hits a warm cache instead of a cold network fetch.
  const preloadPlayer = document.createElement("video");
  preloadPlayer.preload = "auto";
  preloadPlayer.muted = true;
  preloadPlayer.style.display = "none";
  document.body.appendChild(preloadPlayer);
  let preloadedIndex = -1;

  function ordered(list) {
    return [...list].sort((a, b) => a.order - b.order);
  }

  function hexToRgba(hex, opacityPercent) {
    const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${opacityPercent / 100})`;
  }

  function fitCacheKey(preset, heading) {
    return JSON.stringify([heading, preset.box_width, preset.box_height, preset.font, preset.weight, preset.italic]);
  }

  function maybeRefitFillText(block, preset) {
    if (preset.box_width_mode !== "fill") return;
    const key = fitCacheKey(preset, block.heading || "");
    const cached = fitCache.get(block.id);
    if (cached && cached.key === key) {
      preset.size_px = cached.size;
      return;
    }
    const measurerFactory = (size) =>
      FontFit.canvasMeasurer(preset.font, size, { weight: preset.weight, italic: preset.italic });
    const { size } = FontFit.fitFontSize(block.heading || "", measurerFactory, preset.box_width, preset.box_height);
    preset.size_px = size;
    fitCache.set(block.id, { key, size });
  }

  function clipDuration(c) {
    return c.out_point - c.in_point;
  }

  function sequenceDuration(list) {
    return list.reduce((sum, c) => sum + clipDuration(c), 0);
  }

  function locate(list, t) {
    let acc = 0;
    for (const c of ordered(list)) {
      const d = clipDuration(c);
      if (t < acc + d) return { clip: c, src: c.in_point + (t - acc), acc };
      acc += d;
    }
    return null;
  }

  function playClipAt(index) {
    activeIndex = index;
    const c = clips[index];
    applyFillModeClass(c);
    player.src = "/media?path=" + encodeURIComponent(c.file_path);
    player.onloadedmetadata = () => {
      player.currentTime = c.in_point;
      player.play();
    };
    maybePreloadNext(index);
  }

  // Toggles the CSS class stage.css uses to switch #player between letterboxed (FIT,
  // object-fit: contain) and cropped-to-fill (FILL, object-fit: cover) per ClipLayer.fill_mode.
  function applyFillModeClass(clip) {
    player.classList.toggle("fill-mode-fill", clip.fill_mode === "fill");
  }

  function maybePreloadNext(index) {
    const nextIndex = index + 1;
    if (nextIndex >= clips.length || nextIndex === preloadedIndex) return;
    preloadedIndex = nextIndex;
    preloadPlayer.src = "/media?path=" + encodeURIComponent(clips[nextIndex].file_path);
  }

  function zeroClipDuration() {
    if (!textProject) return 0;
    let maxEnd = 0;
    for (const b of (textProject.text_blocks || [])) maxEnd = Math.max(maxEnd, b.end || 0);
    if (textProject.captions && textProject.captions.words) {
      for (const w of textProject.captions.words) maxEnd = Math.max(maxEnd, w.t_end || 0);
    }
    return maxEnd;
  }

  function cancelVirtualPlayback() {
    if (virtualRafId) { cancelAnimationFrame(virtualRafId); virtualRafId = null; }
    virtualPlaying = false;
  }

  function virtualTick(now) {
    if (!virtualPlaying) return;
    const dt = (now - virtualLastTs) / 1000;
    virtualLastTs = now;
    virtualTime += dt;
    if (virtualTime >= zeroClipDuration()) {
      virtualTime = zeroClipDuration();
      virtualPlaying = false;
      setPlayingIcon(false);
    }
    timeEl.textContent = virtualTime.toFixed(1);
    if (textProject) renderText(textProject, textPresets, virtualTime);
    if (textProject) renderCaptions(textProject, textPresets, virtualTime);
    if (textProject) VideoBoxPreview.render(textProject.video_boxes || [], virtualTime);
    Timeline.tick(virtualTime);
    if (virtualPlaying) virtualRafId = requestAnimationFrame(virtualTick);
  }

  function startVirtualPlayback() {
    virtualPlaying = true;
    virtualLastTs = performance.now();
    setPlayingIcon(true);
    virtualRafId = requestAnimationFrame(virtualTick);
  }

  function load(project) {
    clips = ordered(project.clips || []);
    activeIndex = -1;
    cancelVirtualPlayback();
    virtualTime = 0;
    preloadedIndex = -1;
    if (clips.length > 0) {
      playClipAt(0);
    } else {
      player.removeAttribute("src");
      timeEl.textContent = "0.0";
    }
  }

  function renderText(project, presets, timelineTime) {
    textProject = project;
    textPresets = presets;
    const keepEditingDiv = editingDiv && overlay.contains(editingDiv);
    overlay.querySelectorAll(".text-block").forEach((el) => { if (el !== editingDiv) el.remove(); });
    if (keepEditingDiv) {
      overlay.appendChild(editingDiv); // preserve focus/caret across re-renders while typing
      // Re-appending a node (even the same one) drops browser focus silently — no blur event,
      // contentEditable stays "true", but document.activeElement falls back to <body>. This bites
      // whenever a re-render happens synchronously inside onEditStart itself (e.g. clicking an
      // unselected block also opens the TEXT panel, which re-renders before the click finishes) —
      // without this, the block looks editable but the caret/keyboard focus never actually lands.
      if (document.activeElement !== editingDiv && editingDiv.isContentEditable) {
        editingDiv.focus();
        const range = document.createRange();
        range.selectNodeContents(editingDiv);
        range.collapse(false);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
      }
    }
    let stageW = overlay.clientWidth || stage.clientWidth;
    let stageH = overlay.clientHeight || stage.clientHeight;
    if ((stageW === 0 || stageH === 0) && stageW !== 0) {
      stageH = stageW * 16 / 9;
    }
    for (const block of (project.text_blocks || [])) {
      const isSelected = block.id === selectedTextBlockId;
      // An empty heading normally means "nothing to show" — but the selected block must still
      // render (even empty) so there's something on the stage to click into and start typing;
      // this is the only way to enter a heading now that the side-panel textarea is gone.
      if (!block.heading && !isSelected) continue;
      if (!(block.start <= timelineTime && timelineTime < block.end)) continue;
      const preset = presets[block.preset_id];
      if (!preset) continue;
      if (keepEditingDiv && block.id === editingBlockId) continue; // already re-attached above, leave untouched

      maybeRefitFillText(block, preset);

      const div = document.createElement("div");
      div.className = `text-block text-block--align-${preset.align}`;
      div.style.zIndex = String(block.z_index ?? 0);
      div.style.left = (preset.x / 1080 * stageW) + "px";
      div.style.top = (preset.y / 1920 * stageH) + "px";
      div.style.textAlign = preset.align;

      const sizePx = preset.size_px / 1920 * stageH;
      div.style.fontSize = sizePx + "px";

      div.style.padding = "0.15em 0.35em";

      div.style.backgroundColor = preset.box_background ? hexToRgba(preset.box_background_color, preset.box_background_opacity) : "transparent";
      div.style.borderWidth = (preset.box_border_width / 1080 * stageW) + "px";
      div.style.borderStyle = preset.box_border_width > 0 ? "solid" : "none";
      div.style.borderColor = preset.box_border_color;
      div.style.borderRadius = (preset.box_border_radius / 1080 * stageW) + "px";

      const widthIsBoxed = preset.box_width_mode === "fixed" || preset.box_width_mode === "fill";
      const heightIsBoxed = preset.box_height_mode === "fixed" || preset.box_height_mode === "fill";
      const boxW = widthIsBoxed ? (preset.box_width / 1080 * stageW) + "px" : "";
      const boxH = heightIsBoxed ? (preset.box_height / 1920 * stageH) + "px" : "";
      div.style.width = boxW;
      div.style.height = boxH;
      div.style.whiteSpace = widthIsBoxed ? "pre-wrap" : "pre";
      div.style.boxSizing = "border-box";

      const runs = (block.formatting_runs && block.formatting_runs.length) ? block.formatting_runs : [];
      const heading = block.heading || "";
      const boundaries = [...new Set([0, heading.length, ...runs.flatMap((r) => [r.start, r.end])])].sort((a, b) => a - b);
      div.textContent = "";
      for (let i = 0; i < boundaries.length - 1; i++) {
        const segStart = boundaries[i], segEnd = boundaries[i + 1];
        if (segStart >= segEnd) continue;
        const run = runs.find((r) => r.start <= segStart && segEnd <= r.end);
        const span = document.createElement("span");
        span.className = "text-run";
        span.textContent = heading.slice(segStart, segEnd);
        span.style.color = (run && run.color) || preset.color;
        span.style.fontFamily = `"${(run && run.font) || preset.font}", sans-serif`;
        span.style.fontSize = ((run && run.size_px) || preset.size_px) / 1920 * stageH + "px";
        span.style.fontWeight = String((run && run.weight) || preset.weight);
        span.style.fontStyle = (run && run.italic != null ? run.italic : preset.italic) ? "italic" : "normal";
        span.style.textDecoration = (run && run.underline != null ? run.underline : preset.underline) ? "underline" : "none";
        const runOutlinePx = (run && run.outline_px != null ? run.outline_px : preset.outline_px) / 1920 * stageH;
        span.style.webkitTextStroke = `${runOutlinePx}px ${(run && run.outline_color) || preset.outline_color}`;
        const highlighted = run && run.highlight != null ? run.highlight : preset.highlight;
        span.style.backgroundColor = highlighted ? ((run && run.highlight_color) || preset.highlight_color) : "transparent";
        div.appendChild(span);
      }
      if (!heading) { div.style.minWidth = "40px"; div.style.minHeight = "1em"; } // stay clickable while empty
      overlay.appendChild(div);

      // Always clickable/editable, regardless of which right-panel section is open (not just
      // when this block is the "selected" one) — a stage text block should always show a text
      // cursor and always be one click away from edit mode.
      div.style.pointerEvents = "auto";
      div.style.cursor = "text";
      UI.textInteraction(div, {
        onEditStart: () => {
          editingBlockId = block.id;
          editingDiv = div;
          // Entering edit mode only happens on a plain (non-drag) click, which collapses any
          // prior text selection — clear the tracked format-range selection so FONT accordion
          // controls fall back to editing the base preset again (matches getActiveFormatSelection's
          // documented "cleared ... or the selection collapses" contract).
          if (activeFormatSelection && activeFormatSelection.blockId === block.id) activeFormatSelection = null;
          // If this block isn't the currently-selected one, ask the caller (editor.js) to
          // switch the right panel to TEXT and fully select it, on this same click.
          if (block.id !== selectedTextBlockId && onStageTextActivate) onStageTextActivate(block.id);
        },
        onInput: (text) => {
          block.heading = text;
          if (boxResizeCallbacks && boxResizeCallbacks.onEdit) boxResizeCallbacks.onEdit(text);
        },
        onEditEnd: (text) => {
          block.heading = text;
          editingBlockId = null;
          editingDiv = null;
          if (boxResizeCallbacks && boxResizeCallbacks.onEditEnd) boxResizeCallbacks.onEditEnd(text);
        },
        onMove: (delta) => { if (boxResizeCallbacks && boxResizeCallbacks.onMove) boxResizeCallbacks.onMove(delta); },
        onMoveEnd: (delta) => { if (boxResizeCallbacks && boxResizeCallbacks.onMoveEnd) boxResizeCallbacks.onMoveEnd(delta); },
        onSelectionChange: (offsets) => {
          activeFormatSelection = { blockId: block.id, start: offsets.start, end: offsets.end };
          if (boxResizeCallbacks && boxResizeCallbacks.onSelectionChange) boxResizeCallbacks.onSelectionChange(activeFormatSelection);
        },
      });
      if (block.id === selectedTextBlockId && boxResizeCallbacks) {
        UI.resizeHandles(div, {
          getSize: () => ({ width: div.offsetWidth, height: div.offsetHeight }),
          onResize: (size) => boxResizeCallbacks.onResize(size),
          onDragEnd: (size) => boxResizeCallbacks.onDragEnd(size),
        });
      }
    }
  }

  function activeCaptionGroup(words, maxWords, timelineTime) {
    const groups = Timeline.groupWords(words, maxWords);
    return groups.find((g) => timelineTime >= g[0].t_start && timelineTime < g[g.length - 1].t_end) || null;
  }

  function renderCaptions(project, presets, timelineTime) {
    overlay.querySelectorAll(".caption-block").forEach((el) => el.remove());
    const track = project.captions;
    if (!track || !track.words.length) return;
    const preset = presets[track.preset_id];
    if (!preset) return;

    const group = activeCaptionGroup(track.words, preset.max_words_per_line, timelineTime);
    if (!group) return;

    let stageW = overlay.clientWidth || stage.clientWidth;
    let stageH = overlay.clientHeight || stage.clientHeight;
    if ((stageW === 0 || stageH === 0) && stageW !== 0) stageH = stageW * 16 / 9;

    const div = document.createElement("div");
    div.className = `caption-block text-block--align-${preset.align}`;
    div.style.zIndex = String(track.z_index ?? 0);
    div.style.left = (preset.x / 1080 * stageW) + "px";
    div.style.top = (preset.y / 1920 * stageH) + "px";
    div.style.textAlign = preset.align;
    div.style.fontFamily = `"${preset.font}", sans-serif`;
    div.style.fontWeight = String(preset.weight);
    div.style.fontStyle = preset.italic ? "italic" : "normal";
    div.style.textDecoration = preset.underline ? "underline" : "none";
    div.style.fontSize = (preset.size_px / 1920 * stageH) + "px";
    div.style.webkitTextStroke = `${preset.outline_px / 1920 * stageH}px ${preset.outline_color}`;
    div.style.padding = "0.15em 0.35em";
    div.style.backgroundColor = preset.box_background ? hexToRgba(preset.box_background_color, preset.box_background_opacity) : "transparent";
    div.style.borderWidth = (preset.box_border_width / 1080 * stageW) + "px";
    div.style.borderStyle = preset.box_border_width > 0 ? "solid" : "none";
    div.style.borderColor = preset.box_border_color;
    div.style.borderRadius = (preset.box_border_radius / 1080 * stageW) + "px";
    div.style.pointerEvents = "none";

    group.forEach((word, i) => {
      const span = document.createElement("span");
      let isHighlighted;
      if (preset.highlight_mode === "progressive_fill") {
        isHighlighted = timelineTime >= word.t_start;
      } else {
        isHighlighted = timelineTime >= word.t_start && timelineTime < word.t_end;
      }
      span.style.color = isHighlighted ? preset.highlight_color : preset.color;
      span.textContent = word.text + (i < group.length - 1 ? " " : "");
      div.appendChild(span);
    });

    overlay.appendChild(div);
  }

  function setOnStageTextActivate(fn) {
    onStageTextActivate = fn || null;
  }

  function setSelectedTextBlock(blockId, callbacks) {
    if (blockId !== selectedTextBlockId) activeFormatSelection = null;
    selectedTextBlockId = blockId;
    boxResizeCallbacks = callbacks || null;
    if (textProject) renderText(textProject, textPresets, computeTimelineTime());
  }

  function getActiveFormatSelection() {
    return activeFormatSelection;
  }

  function computeTimelineTime() {
    if (clips.length === 0) return virtualTime;
    if (activeIndex < 0) return 0;
    const c = clips[activeIndex];
    let t = 0;
    for (let i = 0; i < activeIndex; i++) t += clipDuration(clips[i]);
    return t + (player.currentTime - c.in_point);
  }

  player.addEventListener("timeupdate", () => {
    if (activeIndex < 0) return;
    const c = clips[activeIndex];
    const timelineTime = computeTimelineTime();
    timeEl.textContent = timelineTime.toFixed(1);

    if (textProject) renderText(textProject, textPresets, timelineTime);
    if (textProject) renderCaptions(textProject, textPresets, timelineTime);
    if (textProject) VideoBoxPreview.render(textProject.video_boxes || [], timelineTime);

    if (player.currentTime >= c.out_point) {
      if (activeIndex + 1 < clips.length) {
        playClipAt(activeIndex + 1);
      } else {
        player.pause();
      }
    }
  });

  new ResizeObserver(() => {
    if (textProject) renderText(textProject, textPresets, computeTimelineTime());
    if (textProject) renderCaptions(textProject, textPresets, computeTimelineTime());
  }).observe(stage);

  function doPlay() {
    if (clips.length === 0) {
      if (virtualTime >= zeroClipDuration()) virtualTime = 0;
      startVirtualPlayback();
      return;
    }
    const atEnd = activeIndex >= 0 && activeIndex === clips.length - 1
      && player.currentTime >= clips[activeIndex].out_point;
    if (atEnd) playClipAt(0);
    else player.play();
  }
  function doPause() {
    if (clips.length === 0) { cancelVirtualPlayback(); setPlayingIcon(false); return; }
    player.pause();
  }
  function doRestart() {
    if (clips.length === 0) { virtualTime = 0; startVirtualPlayback(); return; }
    playClipAt(0);
  }
  function isPaused() {
    return clips.length === 0 ? !virtualPlaying : player.paused;
  }

  document.getElementById("play-pause").addEventListener("click", () => {
    if (isPaused()) doPlay(); else doPause();
  });
  document.getElementById("restart").addEventListener("click", doRestart);

  // Icon swap driven by the video element's own play/pause events, so it stays correct
  // regardless of what triggered the state change (buttons, keyboard, end of clip).
  // Toggles the .icon-hidden class rather than the `hidden` attribute: browsers don't
  // reliably apply the UA `[hidden] { display: none }` rule to SVG elements, so both
  // icons stayed visible at once when toggled via setAttribute("hidden", "").
  const iconPlay = document.querySelector("#play-pause .icon-play");
  const iconPause = document.querySelector("#play-pause .icon-pause");
  function setPlayingIcon(isPlaying) {
    iconPlay.classList.toggle("icon-hidden", isPlaying);
    iconPause.classList.toggle("icon-hidden", !isPlaying);
  }
  player.addEventListener("play", () => setPlayingIcon(true));
  player.addEventListener("pause", () => setPlayingIcon(false));

  function seek(t) {
    if (clips.length === 0) {
      virtualTime = Math.max(0, Math.min(t, zeroClipDuration()));
      timeEl.textContent = virtualTime.toFixed(1);
      if (textProject) renderText(textProject, textPresets, virtualTime);
      if (textProject) renderCaptions(textProject, textPresets, virtualTime);
      if (textProject) VideoBoxPreview.render(textProject.video_boxes || [], virtualTime);
      return;
    }
    const loc = locate(clips, t);
    if (!loc) return;
    if (loc.clip !== clips[activeIndex]) {
      activeIndex = clips.indexOf(loc.clip);
      applyFillModeClass(loc.clip);
      player.src = "/media?path=" + encodeURIComponent(loc.clip.file_path);
      player.onloadedmetadata = () => { player.currentTime = loc.src; };
    } else {
      player.currentTime = loc.src;
    }
  }

  return { load, locate, sequenceDuration, seek, renderText, renderCaptions, currentTimelineTime: computeTimelineTime, play: doPlay, pause: doPause, restart: doRestart, isPaused, setSelectedTextBlock, setOnStageTextActivate, getActiveFormatSelection };
})();

// Preview stage playback: plays a project's clips back-to-back in timeline order,
// and composites the text-block overlay on top (renderText).
// Exposes window.Preview.{load, seek, renderText, currentTimelineTime, play, pause, restart, isPaused, setSelectedTextBlock, setOnStageTextActivate}. Mirrors app/timeline.py's ordered/locate. Thin — DOM wiring only.
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
  // Virtual clock driving playback when there are zero video clips (text/captions-only
  // projects) — the video element has no src/timeupdate events to drive off of in that case.
  let virtualTime = 0;
  let virtualPlaying = false;
  let virtualRafId = null;
  let virtualLastTs = 0;
  const player = document.getElementById("player");
  const timeEl = document.getElementById("time");
  const overlay = document.getElementById("overlay");
  const stage = document.getElementById("stage");

  function ordered(list) {
    return [...list].sort((a, b) => a.order - b.order);
  }

  function hexToRgba(hex, opacityPercent) {
    const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${opacityPercent / 100})`;
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
    player.src = "/media?path=" + encodeURIComponent(c.file_path);
    player.onloadedmetadata = () => {
      player.currentTime = c.in_point;
      player.play();
    };
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
    overlay.innerHTML = "";
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

      const div = document.createElement("div");
      div.className = "text-block text-block--align-" + preset.align;
      div.style.left = (preset.x / 1080 * stageW) + "px";
      div.style.top = (preset.y / 1920 * stageH) + "px";
      div.style.color = preset.color;
      div.style.textAlign = preset.align;
      div.style.fontFamily = `"${preset.font}", sans-serif`;
      div.style.fontWeight = preset.bold ? "700" : "400";
      div.style.fontStyle = preset.italic ? "italic" : "normal";
      div.style.textDecoration = preset.underline ? "underline" : "none";

      const sizePx = preset.size_px / 1920 * stageH;
      div.style.fontSize = sizePx + "px";

      const outlinePx = preset.outline_px / 1920 * stageH;
      div.style.webkitTextStroke = `${outlinePx}px ${preset.outline_color}`;
      div.style.padding = "0.15em 0.35em";

      div.style.backgroundColor = preset.box_background ? hexToRgba(preset.box_background_color, preset.box_background_opacity) : "transparent";
      div.style.borderWidth = (preset.box_border_width / 1080 * stageW) + "px";
      div.style.borderStyle = preset.box_border_width > 0 ? "solid" : "none";
      div.style.borderColor = preset.box_border_color;
      div.style.borderRadius = (preset.box_border_radius / 1080 * stageW) + "px";

      const boxW = preset.box_width_mode === "fixed" ? (preset.box_width / 1080 * stageW) + "px" : "";
      const boxH = preset.box_height_mode === "fixed" ? (preset.box_height / 1920 * stageH) + "px" : "";
      div.style.width = boxW;
      div.style.height = boxH;
      div.style.whiteSpace = preset.box_width_mode === "fixed" ? "pre-wrap" : "pre";
      div.style.boxSizing = "border-box";

      div.textContent = block.heading;
      if (!block.heading) { div.style.minWidth = "40px"; div.style.minHeight = "1em"; } // stay clickable while empty
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

  function setOnStageTextActivate(fn) {
    onStageTextActivate = fn || null;
  }

  function setSelectedTextBlock(blockId, callbacks) {
    selectedTextBlockId = blockId;
    boxResizeCallbacks = callbacks || null;
    if (textProject) renderText(textProject, textPresets, computeTimelineTime());
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
      return;
    }
    const loc = locate(clips, t);
    if (!loc) return;
    if (loc.clip !== clips[activeIndex]) {
      activeIndex = clips.indexOf(loc.clip);
      player.src = "/media?path=" + encodeURIComponent(loc.clip.file_path);
      player.onloadedmetadata = () => { player.currentTime = loc.src; };
    } else {
      player.currentTime = loc.src;
    }
  }

  return { load, locate, sequenceDuration, seek, renderText, currentTimelineTime: computeTimelineTime, play: doPlay, pause: doPause, restart: doRestart, isPaused, setSelectedTextBlock, setOnStageTextActivate };
})();

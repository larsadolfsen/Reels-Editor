// Preview stage playback: plays a project's clips back-to-back in timeline order,
// and composites the text-block overlay on top (renderText).
// Exposes window.Preview.{load, seek, renderText, currentTimelineTime, play, pause, restart}. Mirrors app/timeline.py's ordered/locate. Thin — DOM wiring only.
window.Preview = (() => {
  let clips = [];
  let activeIndex = -1;
  let textProject = null;
  let textPresets = {};
  const player = document.getElementById("player");
  const timeEl = document.getElementById("time");
  const overlay = document.getElementById("overlay");
  const stage = document.getElementById("stage");

  function ordered(list) {
    return [...list].sort((a, b) => a.order - b.order);
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

  function load(project) {
    clips = ordered(project.clips || []);
    activeIndex = -1;
    if (clips.length > 0) {
      playClipAt(0);
    } else {
      player.removeAttribute("src");
    }
  }

  function renderText(project, presets, timelineTime) {
    textProject = project;
    textPresets = presets;
    overlay.innerHTML = "";
    let stageW = overlay.clientWidth || stage.clientWidth;
    let stageH = overlay.clientHeight || stage.clientHeight;
    if ((stageW === 0 || stageH === 0) && stageW !== 0) {
      stageH = stageW * 16 / 9;
    }
    for (const block of (project.text_blocks || [])) {
      if (!block.heading) continue;
      if (!(block.start <= timelineTime && timelineTime < block.end)) continue;
      const preset = presets[block.preset_id];
      if (!preset) continue;

      const div = document.createElement("div");
      div.className = "text-block";
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

      if (preset.box) {
        div.style.backgroundColor = preset.box_color;
        div.style.padding = "0.15em 0.35em";
      } else {
        const outlinePx = preset.outline_px / 1920 * stageH;
        div.style.webkitTextStroke = `${outlinePx}px ${preset.outline_color}`;
      }

      div.textContent = block.heading;
      overlay.appendChild(div);
    }
  }

  function computeTimelineTime() {
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
    const atEnd = activeIndex >= 0 && activeIndex === clips.length - 1
      && player.currentTime >= clips[activeIndex].out_point;
    if (atEnd) playClipAt(0);
    else player.play();
  }
  function doPause() { player.pause(); }
  function doRestart() { playClipAt(0); }

  document.getElementById("play-pause").addEventListener("click", () => {
    if (player.paused) doPlay(); else doPause();
  });
  document.getElementById("restart").addEventListener("click", doRestart);

  // Icon swap driven by the video element's own play/pause events, so it stays correct
  // regardless of what triggered the state change (buttons, keyboard, end of clip).
  // Sets style.display directly rather than the `hidden` attribute: browsers don't
  // reliably apply the UA `[hidden] { display: none }` rule to SVG elements, so both
  // icons stayed visible at once when toggled via setAttribute("hidden", "").
  const iconPlay = document.querySelector("#play-pause .icon-play");
  const iconPause = document.querySelector("#play-pause .icon-pause");
  function setPlayingIcon(isPlaying) {
    iconPlay.style.display = isPlaying ? "none" : "";
    iconPause.style.display = isPlaying ? "" : "none";
  }
  player.addEventListener("play", () => setPlayingIcon(true));
  player.addEventListener("pause", () => setPlayingIcon(false));

  function seek(t) {
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

  return { load, locate, sequenceDuration, seek, renderText, currentTimelineTime: computeTimelineTime, play: doPlay, pause: doPause, restart: doRestart };
})();

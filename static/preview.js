// Preview stage playback: plays a project's clips back-to-back in timeline order,
// and composites the text-block overlay on top (renderText).
// Exposes window.Preview.load(project), .renderText(project, presets, t). Mirrors app/timeline.py's ordered/locate. Thin — DOM wiring only.
window.Preview = (() => {
  let clips = [];
  let activeIndex = -1;
  let lastTimelineTime = 0;
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
    lastTimelineTime = timelineTime;
    overlay.innerHTML = "";
    const stageW = stage.clientWidth, stageH = stage.clientHeight;
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

      const sizePx = preset.size_px / 1920 * stageH;
      div.style.fontSize = sizePx + "px";

      if (preset.box) {
        div.style.backgroundColor = preset.box_color;
        div.style.padding = "0.15em 0.35em";
      } else {
        const outlinePx = preset.outline_px / 1920 * stageH;
        div.style.webkitTextStroke = `${outlinePx}px ${preset.outline_color}`;
      }

      const heading = document.createElement("div");
      heading.textContent = block.heading;
      div.appendChild(heading);

      if (block.subheading) {
        const sub = document.createElement("div");
        sub.className = "subheading";
        sub.textContent = block.subheading;
        sub.style.fontSize = (sizePx * 0.55) + "px";
        div.appendChild(sub);
      }

      overlay.appendChild(div);
    }
  }

  player.addEventListener("timeupdate", () => {
    if (activeIndex < 0) return;
    const c = clips[activeIndex];
    let timelineTime = 0;
    for (let i = 0; i < activeIndex; i++) timelineTime += clipDuration(clips[i]);
    timelineTime += player.currentTime - c.in_point;
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

  document.getElementById("play").addEventListener("click", () => {
    if (player.paused) player.play(); else player.pause();
  });

  return { load, locate, sequenceDuration, renderText, currentTimelineTime: () => lastTimelineTime };
})();

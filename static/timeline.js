// Timeline strip: pure row-position math (mirrors app/timeline.py) + rendering for
// toolbar (zoom/time readout)/ruler/playhead/playhead-handle box/TEXT/CAPTIONS/VIDEO/AUDIO
// rows into the DOM ids defined in index.html. The AUDIO row is a static dummy waveform
// (no audio-track feature yet). The playhead-handle box (#slice-btn) tracks the playhead
// and holds two icons: a grip-vertical handle (dragged in editor.js to scrub the playhead)
// and a scissors icon (visual only, no slice feature yet).
// Fixed pixels-per-second scale (not stretched to container width) so content is always
// readable; #timeline-scroll provides horizontal scroll when content exceeds the viewport.
// Exposes window.Timeline.{render, groupWords, timeAtX, tick}. tick() is a cheap
// playhead-only update driven every animation frame during playback (see editor.js),
// so motion stays smooth between the heavier full render() calls. Depends on Preview (preview.js).
window.Timeline = (() => {
  const PX_PER_SEC = 60;
  const LABEL_WIDTH = 88;
  let lastDuration = 1;

  function ordered(list) {
    return [...list].sort((a, b) => a.order - b.order);
  }
  function clipDuration(c) {
    return c.out_point - c.in_point;
  }
  function sequenceDuration(clips) {
    return clips.reduce((sum, c) => sum + clipDuration(c), 0);
  }

  function groupWords(words, max = 4) {
    const sorted = [...words].sort((a, b) => a.t_start - b.t_start);
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
    document.getElementById("playhead").style.left = `${timelineTime * PX_PER_SEC}px`;
    document.getElementById("timeline-time").textContent =
      `${formatTimeDeci(timelineTime)} / ${formatTimeDeci(lastDuration)}`;
    updateSliceButton();
  }

  function updateSliceButton() {
    const btn = document.getElementById("slice-btn");
    const scrollEl = document.getElementById("timeline-scroll");
    const playhead = document.getElementById("playhead");
    const left = parseFloat(playhead.style.left) || 0;
    btn.style.left = `${LABEL_WIDTH + left - scrollEl.scrollLeft}px`;
  }

  // Deterministic pseudo-random bar heights, regenerated only when the track width
  // changes, so the placeholder doesn't reflow on every playback tick.
  function renderAudioTrack(width) {
    const track = document.getElementById("row-audio");
    const rounded = String(Math.round(width));
    if (track.dataset.width === rounded) return;
    track.dataset.width = rounded;
    track.innerHTML = "";
    const pitch = 4;
    const count = Math.max(1, Math.floor(width / pitch));
    let seed = 1;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    for (let i = 0; i < count; i++) {
      const bar = document.createElement("div");
      bar.className = "waveform-bar";
      bar.style.height = `${4 + Math.round(rand() * 24)}px`;
      track.appendChild(bar);
    }
  }

  // Total duration must cover video, text blocks, and captions — not just the clip
  // sequence — otherwise rows with content past the video's end render off-scale.
  function totalDuration(project) {
    const clips = ordered(project.clips || []);
    let d = sequenceDuration(clips);
    for (const b of project.text_blocks || []) d = Math.max(d, b.end);
    for (const w of (project.captions || {}).words || []) d = Math.max(d, w.t_end);
    return Math.max(d, 1);
  }

  function timeAtX(clips, rulerRect, clientX) {
    return Math.max(0, (clientX - rulerRect.left) / PX_PER_SEC);
  }

  function clearTrack(id) {
    const el = document.getElementById(id);
    el.innerHTML = "";
    return el;
  }

  function addBlock(track, left, width, label, selected, onClick) {
    const div = document.createElement("div");
    div.className = "timeline-block" + (selected ? " selected" : "");
    div.style.left = `${left}px`;
    div.style.width = `${Math.max(width, 4)}px`;
    const span = document.createElement("span");
    span.textContent = label;
    div.appendChild(span);
    div.addEventListener("click", (e) => { e.stopPropagation(); onClick(); });
    track.appendChild(div);
  }

  function renderRuler(duration) {
    const ruler = document.getElementById("timeline-ruler");
    ruler.querySelectorAll(".tick").forEach((t) => t.remove());
    for (let s = 0; s <= Math.ceil(duration); s += 2) {
      const tick = document.createElement("div");
      tick.className = "tick";
      tick.style.left = `${s * PX_PER_SEC}px`;
      tick.textContent = formatTime(s);
      ruler.appendChild(tick);
    }
  }

  function render(project, timelineTime, selected, onSelect) {
    const clips = ordered(project.clips || []);
    const duration = totalDuration(project);
    lastDuration = duration;
    const contentWidth = duration * PX_PER_SEC;
    document.getElementById("timeline-content").style.width = `${contentWidth}px`;

    renderRuler(duration);
    document.getElementById("playhead").style.left = `${timelineTime * PX_PER_SEC}px`;
    document.getElementById("timeline-time").textContent =
      `${formatTimeDeci(timelineTime)} / ${formatTimeDeci(duration)}`;
    updateSliceButton();
    renderAudioTrack(contentWidth);

    const scrollEl = document.getElementById("timeline-scroll");
    if (!scrollEl.dataset.sliceBound) {
      scrollEl.dataset.sliceBound = "1";
      scrollEl.addEventListener("scroll", updateSliceButton);
    }

    const videoTrack = clearTrack("row-video");
    let acc = 0;
    for (const c of clips) {
      const d = clipDuration(c);
      const name = c.file_path.split(/[\\/]/).pop();
      const isSel = !!selected && selected.type === "video" && selected.item.id === c.id;
      addBlock(videoTrack, acc * PX_PER_SEC, d * PX_PER_SEC, name, isSel, () => onSelect({ type: "video", item: c }));
      acc += d;
    }

    const textTrack = clearTrack("row-text");
    for (const b of project.text_blocks || []) {
      const isSel = !!selected && selected.type === "text" && selected.item.id === b.id;
      addBlock(textTrack, b.start * PX_PER_SEC, (b.end - b.start) * PX_PER_SEC, b.heading, isSel,
        () => onSelect({ type: "text", item: b }));
    }

    const capTrack = clearTrack("row-captions");
    const groups = project.captions ? groupWords(project.captions.words) : [];
    groups.forEach((g, i) => {
      const start = g[0].t_start, end = g[g.length - 1].t_end;
      const label = g.map((w) => w.text).join(" ");
      const isSel = !!selected && selected.type === "caption" && selected.groupIndex === i;
      addBlock(capTrack, start * PX_PER_SEC, (end - start) * PX_PER_SEC, label, isSel,
        () => onSelect({ type: "caption", item: g, groupIndex: i }));
    });
  }

  return { render, groupWords, timeAtX, tick };
})();

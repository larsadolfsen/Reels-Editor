// Timeline strip: pure row-position math (mirrors app/timeline.py) + rendering for
// ruler/playhead/VIDEO/TEXT/CAPTIONS rows into the DOM ids defined in index.html.
// Fixed pixels-per-second scale (not stretched to container width) so content is always
// readable; #timeline-scroll provides horizontal scroll when content exceeds the viewport.
// Exposes window.Timeline.{render, groupWords, timeAtX}. Depends on Preview (preview.js).
window.Timeline = (() => {
  const PX_PER_SEC = 60;

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
    const contentWidth = duration * PX_PER_SEC;
    document.getElementById("timeline-content").style.width = `${contentWidth}px`;

    renderRuler(duration);
    document.getElementById("playhead").style.left = `${timelineTime * PX_PER_SEC}px`;

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

  return { render, groupWords, timeAtX };
})();

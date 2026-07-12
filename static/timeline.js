// Timeline strip: pure row-position math (mirrors app/timeline.py) + rendering for
// ruler/playhead/VIDEO/TEXT/CAPTIONS rows into the DOM ids defined in index.html.
// Exposes window.Timeline.{render, groupWords, timeAtX}. Depends on Preview (preview.js).
window.Timeline = (() => {
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

  function timeAtX(clips, rulerRect, clientX) {
    const duration = Math.max(sequenceDuration(ordered(clips)), 1);
    const frac = Math.min(Math.max((clientX - rulerRect.left) / rulerRect.width, 0), 1);
    return frac * duration;
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

  function renderRuler(duration, pxPerSec) {
    const ruler = document.getElementById("timeline-ruler");
    ruler.querySelectorAll(".tick").forEach((t) => t.remove());
    for (let s = 0; s <= Math.ceil(duration); s += 2) {
      const tick = document.createElement("div");
      tick.className = "tick";
      tick.style.left = `${s * pxPerSec}px`;
      tick.textContent = formatTime(s);
      ruler.appendChild(tick);
    }
  }

  function render(project, timelineTime, selected, onSelect) {
    const clips = ordered(project.clips || []);
    const duration = Math.max(sequenceDuration(clips), 1);
    const trackWidth = document.getElementById("timeline-ruler").clientWidth || 1;
    const pxPerSec = trackWidth / duration;

    renderRuler(duration, pxPerSec);
    document.getElementById("playhead").style.left = `${88 + timelineTime * pxPerSec}px`;

    const videoTrack = clearTrack("row-video");
    let acc = 0;
    for (const c of clips) {
      const d = clipDuration(c);
      const name = c.file_path.split(/[\\/]/).pop();
      const isSel = !!selected && selected.type === "video" && selected.item.id === c.id;
      addBlock(videoTrack, acc * pxPerSec, d * pxPerSec, name, isSel, () => onSelect({ type: "video", item: c }));
      acc += d;
    }

    const textTrack = clearTrack("row-text");
    for (const b of project.text_blocks || []) {
      const isSel = !!selected && selected.type === "text" && selected.item.id === b.id;
      addBlock(textTrack, b.start * pxPerSec, (b.end - b.start) * pxPerSec, b.heading, isSel,
        () => onSelect({ type: "text", item: b }));
    }

    const capTrack = clearTrack("row-captions");
    const groups = project.captions ? groupWords(project.captions.words) : [];
    groups.forEach((g, i) => {
      const start = g[0].t_start, end = g[g.length - 1].t_end;
      const label = g.map((w) => w.text).join(" ");
      const isSel = !!selected && selected.type === "caption" && selected.groupIndex === i;
      addBlock(capTrack, start * pxPerSec, (end - start) * pxPerSec, label, isSel,
        () => onSelect({ type: "caption", item: g, groupIndex: i }));
    });
  }

  return { render, groupWords, timeAtX };
})();

# Timeline Strip + Contextual Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the multi-track timeline strip (ruler + playhead + VIDEO/TEXT/CAPTIONS rows) below the stage, and a right-side contextual panel that shows a clicked block's fields — UI-only, no new backend routes or data-creation capability.

**Architecture:** Two new pure-render JS modules (`timeline.js`, `context-panel.js`) plus a pure seed helper (`seed.js`), wired together from the existing `editor.js` hub, exactly mirroring how `preview.js` already mirrors `app/timeline.py`. No backend, model, or route changes.

**Tech Stack:** Vanilla HTML/JS/CSS, no build step, no JS test runner (existing project convention — UI JS is a stated untested layer, verified manually).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-12-timeline-strip-design.md` — read it first.
- Every source file starts with a 2–3 line header comment (what it does, what it exposes, key dependencies).
- One purpose per file, ~100–400 lines.
- No new backend routes, no new data-creation UI. Only seed data + relocate/surface existing fields.
- `app/main.py` untouched.
- Run `pytest -q` after every task (guards HTML/JS breakage even though this plan touches no Python) — must stay green.
- Commit after every task on the current branch; push.
- Canvas/timeline math: mirror `app/timeline.py`'s `ordered`/`clip_duration`/`sequence_duration` exactly as `static/preview.js` already does — do not introduce a third divergent copy of this math beyond the one new mirror in `timeline.js` (row layout needs its own copy for pixel math; keep it structurally identical to `preview.js`'s).

## File Structure

```
static/
  index.html                       # modify: add #timeline-strip, #context-panel, new script tags
  editor.js                        # modify: seed call, remove inline trim UI, wire selection state
  preview.js                       # modify: add Preview.seek(t)
  timeline.js                      # new: pure row-position math + ruler/playhead/row rendering
  context-panel.js                 # new: right-panel content for video/text/caption selection
  seed.js                          # new: pure seedDefaults(project) -> project
  css/
    components/
      timeline.css                 # new: ruler, rows, blocks, playhead, ticks
      context-panel.css            # new: right panel layout
```

---

### Task 1: Seed default text block + caption line

**Files:**
- Create: `static/seed.js`
- Modify: `static/index.html:37` (add script tag before `editor.js`), `static/editor.js` (call seed after `ensureProject()`)

**Interfaces:**
- Consumes: `project.text_blocks`, `project.captions` (existing `Project` shape from `app/models.py`, unchanged).
- Produces: `window.seedDefaults(project) -> project` — pure, mutates and returns the same object. Later tasks (`timeline.js`) read `project.text_blocks[0]` and `project.captions.words` assuming this ran first.

- [ ] **Step 1: Write `static/seed.js`**

```js
// Seeds placeholder text/caption data so the timeline UI has something to show
// before real creation flows (text style panel, transcription) exist.
// Exposes window.seedDefaults(project) -> project (mutates and returns project).
function seedDefaults(project) {
  if (project.text_blocks.length === 0) {
    project.text_blocks.push({
      id: crypto.randomUUID().replaceAll("-", ""),
      heading: "HOOK",
      subheading: "",
      preset_id: "seed",
      start: 0,
      end: 2,
    });
  }
  if (!project.captions) {
    const sampleWords = ["okay", "so", "nobody", "talks", "about", "this"];
    let t = 0;
    const words = sampleWords.map((text) => {
      const w = { id: crypto.randomUUID().replaceAll("-", ""), text, t_start: t, t_end: t + 0.55 };
      t += 0.65;
      return w;
    });
    project.captions = { id: crypto.randomUUID().replaceAll("-", ""), words };
  }
  return project;
}
```

- [ ] **Step 2: Wire it into `static/editor.js`.** Find the IIFE at the bottom of the file:

```js
(async () => {
  project = await ensureProject();
  document.getElementById("project-name").textContent = project.name;
  renderClipList();
  Preview.load(project);
})();
```

Replace with:

```js
(async () => {
  project = await ensureProject();
  const before = JSON.stringify(project);
  seedDefaults(project);
  if (JSON.stringify(project) !== before) await saveProject();
  document.getElementById("project-name").textContent = project.name;
  renderClipList();
  Preview.load(project);
})();
```

- [ ] **Step 3: Add the script tag.** In `static/index.html`, before the existing `<script src="/static/preview.js">` line, add:

```html
<script src="/static/seed.js"></script>
```

(Load order: `seed.js` → `preview.js` → `editor.js`, since `editor.js`'s IIFE calls `seedDefaults`.)

- [ ] **Step 4: Run `pytest -q`.** Expected: unchanged, still all green (no Python touched).

- [ ] **Step 5: See it.** Run `.venv/Scripts/python -m uvicorn app.main:app --reload`, open `http://127.0.0.1:8000`, open the browser devtools console, and run:

```js
project.text_blocks.length === 1 && project.text_blocks[0].heading === "HOOK"
project.captions.words.length === 6
```

Both must print `true`. Reload the page — values must stay the same (seed only runs once, then persists via the existing `PUT`).

- [ ] **Step 6: Commit + push.**

```bash
git add static/seed.js static/editor.js static/index.html
git commit -m "feat: seed placeholder text block and caption line"
git push
```

---

### Task 2: Timeline strip skeleton (HTML + CSS, empty rows)

**Files:**
- Modify: `static/index.html` (add `#timeline-strip` markup inside `#stage-wrap`, add `#context-panel` as a sibling of `#stage-wrap`, add `timeline.css`/`context-panel.css` link tags)
- Create: `static/css/components/timeline.css`, `static/css/components/context-panel.css`

**Interfaces:**
- Produces: the DOM ids `timeline-strip`, `playhead`, `timeline-ruler`, `row-text`, `row-captions`, `row-video`, `context-panel` that Tasks 3 and 4 render into.

- [ ] **Step 1: Add markup to `static/index.html`.** Inside `#stage-wrap`, after the `#export-result` div, add:

```html
      <div id="timeline-strip">
        <div id="playhead"></div>
        <div id="timeline-ruler"></div>
        <div class="timeline-row" data-row="text">
          <div class="row-label">TEXT</div>
          <div class="row-track" id="row-text"></div>
        </div>
        <div class="timeline-row" data-row="captions">
          <div class="row-label">CAPTIONS</div>
          <div class="row-track" id="row-captions"></div>
        </div>
        <div class="timeline-row" data-row="video">
          <div class="row-label">VIDEO</div>
          <div class="row-track" id="row-video"></div>
        </div>
      </div>
```

Then, as a sibling of `#stage-wrap` (i.e. still inside `<main>`, after `</section>` that closes `#stage-wrap`), add:

```html
    <aside id="context-panel" hidden></aside>
```

- [ ] **Step 2: Add the CSS link tags.** In the `<head>`, after the existing `stage.css` link, add:

```html
<link rel="stylesheet" href="/static/css/components/timeline.css">
<link rel="stylesheet" href="/static/css/components/context-panel.css">
```

- [ ] **Step 3: Write `static/css/components/timeline.css`**

```css
/* Timeline strip: ruler, playhead, VIDEO/TEXT/CAPTIONS rows below the stage. */
/* Exposes #timeline-strip and children only. Depends on tokens.css. */
#timeline-strip {
  position: relative;
  align-self: stretch;
  width: 100%;
  max-width: 640px;
  background: var(--surface);
  border: 1px solid var(--border-soft);
  border-radius: 4px;
  padding: var(--space-2) 0;
  font-family: var(--font-ui);
}

#playhead {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 88px;
  width: 1px;
  background: var(--accent);
  pointer-events: none;
  z-index: 2;
}

#timeline-ruler {
  position: relative;
  height: 20px;
  margin: 0 var(--space-3) var(--space-2) 88px;
  border-bottom: 1px solid var(--border-soft);
  cursor: pointer;
}

.tick {
  position: absolute;
  top: 0;
  font-size: 9px;
  color: var(--text-dim);
  transform: translateX(-50%);
}

.timeline-row {
  display: flex;
  align-items: center;
  min-height: 32px;
  border-top: 1px solid var(--border-soft);
}

.row-label {
  width: 88px;
  flex-shrink: 0;
  padding-left: var(--space-2);
  font-size: 10px;
  letter-spacing: 0.03em;
  color: var(--text-dim);
}

.row-track {
  position: relative;
  flex: 1;
  height: 26px;
  margin-right: var(--space-3);
}

.timeline-block {
  position: absolute;
  top: 2px;
  height: 22px;
  border-radius: 3px;
  border: 1px solid var(--border);
  background: var(--bg-2);
  overflow: hidden;
  cursor: pointer;
  display: flex;
  align-items: center;
}

.timeline-block span {
  font-size: 9.5px;
  color: #C7C8CA;
  padding: 0 7px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.timeline-block.selected { border-color: var(--accent); }
```

- [ ] **Step 4: Write `static/css/components/context-panel.css`**

```css
/* Right-side contextual panel: shows the selected timeline block's fields. */
/* Exposes #context-panel and children only. Depends on tokens.css. */
#context-panel {
  width: 280px;
  flex-shrink: 0;
  background: var(--surface);
  border-left: 1px solid var(--border-soft);
  padding: var(--space-3) 14px;
  overflow-y: auto;
}

#context-panel[hidden] { display: none; }

#context-panel h3 {
  font-family: var(--font-ui);
  font-size: 10.5px;
  letter-spacing: 0.06em;
  color: var(--text-dim);
  margin: 0 0 var(--space-3);
}

#context-panel label {
  display: block;
  font-size: 11px;
  color: var(--text-muted);
  margin-bottom: var(--space-1);
  margin-top: var(--space-2);
}

#context-panel input[type="text"],
#context-panel input[type="number"] {
  width: 100%;
}

#context-panel .field-row { display: flex; gap: var(--space-2); }
#context-panel .field-row > div { flex: 1; }

#context-panel .readonly-text {
  font-size: 12.5px;
  color: var(--text);
  line-height: 1.5;
  background: var(--bg-2);
  border: 1px solid var(--border-soft);
  border-radius: 3px;
  padding: var(--space-2);
}
```

- [ ] **Step 5: Run `pytest -q`.** Expected: still green.

- [ ] **Step 6: See it.** Reload the editor. A bordered strip appears below the stage with three empty labeled rows (TEXT, CAPTIONS, VIDEO) and a thin ruler line above them; no blocks yet (Task 3 adds those). The layout should not visibly break the existing stage/panel.

- [ ] **Step 7: Commit + push.**

```bash
git add static/index.html static/css/components/timeline.css static/css/components/context-panel.css
git commit -m "feat: timeline strip and context panel skeleton"
git push
```

---

### Task 3: Ruler, playhead, and VIDEO/TEXT/CAPTIONS row rendering

**Files:**
- Create: `static/timeline.js`
- Modify: `static/preview.js` (add `seek`), `static/editor.js` (call `Timeline.render` on load/tick/edit, wire ruler click-to-seek), `static/index.html` (script tag)

**Interfaces:**
- Consumes: `Preview.locate`, `Preview.load` (existing, from Task 3 of the original plan); `project.clips`/`text_blocks`/`captions` (seeded by Task 1 of this plan).
- Produces: `window.Timeline.render(project, timelineTime, selected, onSelect)`, `window.Timeline.groupWords(words, max=4)`, `window.Timeline.timeAtX(clips, rulerRect, clientX)`. `Preview.seek(t)` (added to `preview.js`'s returned object). `selected` and `onSelect` are consumed fully in Task 4; this task passes `null` for `selected` and a no-op for `onSelect` so blocks render but clicking does nothing yet.

- [ ] **Step 1: Write `static/timeline.js`**

```js
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
```

- [ ] **Step 2: Add `seek` to `static/preview.js`.** In the `Preview` IIFE, add this function above the final `return`:

```js
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
```

Change the final line from:

```js
  return { load, locate, sequenceDuration };
```

to:

```js
  return { load, locate, sequenceDuration, seek };
```

- [ ] **Step 3: Wire rendering into `static/editor.js`.** Add a `renderTimeline()` function (selection state comes in Task 4 — for now it's always `null`/no-op):

```js
function renderTimeline() {
  const t = parseFloat(document.getElementById("time").textContent) || 0;
  Timeline.render(project, t, null, () => {});
}
```

Call it at the end of the startup IIFE (after `Preview.load(project);`) and after every place that already calls `Preview.load(project)` or `saveProject()` following a mutation (`applyTrim`, `moveClip`, `addClip`). Also call it on every playback tick — add this near the bottom of `editor.js`:

```js
player.addEventListener("timeupdate", renderTimeline);
```

Wire the ruler click-to-seek, also in `editor.js`:

```js
document.getElementById("timeline-ruler").addEventListener("click", (e) => {
  const rect = e.currentTarget.getBoundingClientRect();
  const t = Timeline.timeAtX(project.clips, rect, e.clientX);
  Preview.seek(t);
});
```

- [ ] **Step 4: Add the script tag.** In `static/index.html`, add `<script src="/static/timeline.js"></script>` after the `preview.js` tag and before `editor.js` (it depends on nothing from `editor.js`, but `editor.js` calls into it).

- [ ] **Step 5: Run `pytest -q`.** Expected: still green.

- [ ] **Step 6: See it.** Reload the editor with at least one real clip added:
  - VIDEO row shows one block per clip, proportional in width to its trimmed duration, labeled with the filename.
  - TEXT row shows one block labeled "HOOK" spanning the first ~2 seconds.
  - CAPTIONS row shows two blocks (4 words, then 2 words) spanning the seeded caption range.
  - Press play: the vertical playhead line moves left-to-right in sync with `#time`.
  - Click anywhere on the ruler: playback jumps to that point (still within a clip's real bounds).

- [ ] **Step 7: Commit + push.**

```bash
git add static/timeline.js static/preview.js static/editor.js static/index.html
git commit -m "feat: render timeline ruler, playhead, and VIDEO/TEXT/CAPTIONS rows"
git push
```

---

### Task 4: Contextual panel — click a block, edit its fields

**Files:**
- Create: `static/context-panel.js`
- Modify: `static/editor.js` (selection state, remove inline trim UI from `renderClipList`, wire `onSelect`)
- Modify: `static/index.html` (script tag)

**Interfaces:**
- Consumes: `Timeline.render`'s `onSelect` callback shape (`{type: "video"|"text"|"caption", item, groupIndex?}`, defined in Task 3); `clampTrim` (existing, in `editor.js`).
- Produces: `window.ContextPanel.show(selection, callbacks)` where `callbacks = {onChange: () => void}` is called after any field edit so `editor.js` can `saveProject()` and re-render; `window.ContextPanel.hide()`.

- [ ] **Step 1: Write `static/context-panel.js`**

```js
// Right-side contextual panel: renders the selected timeline block's editable fields.
// Exposes window.ContextPanel.{show, hide}. Depends on DOM id #context-panel from index.html.
window.ContextPanel = (() => {
  const panel = document.getElementById("context-panel");

  function clear() {
    panel.innerHTML = "";
  }

  function heading(text) {
    const h = document.createElement("h3");
    h.textContent = text;
    panel.appendChild(h);
  }

  function numberField(labelText, value, onCommit) {
    const label = document.createElement("label");
    label.textContent = labelText;
    panel.appendChild(label);
    const input = document.createElement("input");
    input.type = "number";
    input.step = "0.1";
    input.value = value.toFixed(1);
    input.addEventListener("change", () => onCommit(parseFloat(input.value)));
    panel.appendChild(input);
    return input;
  }

  function textField(labelText, value, onCommit) {
    const label = document.createElement("label");
    label.textContent = labelText;
    panel.appendChild(label);
    const input = document.createElement("input");
    input.type = "text";
    input.value = value;
    input.addEventListener("change", () => onCommit(input.value));
    panel.appendChild(input);
    return input;
  }

  function showVideo(clip, clipDuration, onChange) {
    heading("VIDEO CLIP");
    const path = document.createElement("div");
    path.className = "readonly-text";
    path.textContent = clip.file_path;
    panel.appendChild(path);

    const row = document.createElement("div");
    row.className = "field-row";
    panel.appendChild(row);

    const inWrap = document.createElement("div");
    const outWrap = document.createElement("div");
    row.appendChild(inWrap);
    row.appendChild(outWrap);

    const dur = clipDuration;
    const inInput = document.createElement("input");
    inInput.type = "number"; inInput.step = "0.1"; inInput.value = clip.in_point.toFixed(1);
    const outInput = document.createElement("input");
    outInput.type = "number"; outInput.step = "0.1"; outInput.value = clip.out_point.toFixed(1);

    const inLabel = document.createElement("label"); inLabel.textContent = "IN"; inWrap.appendChild(inLabel);
    inWrap.appendChild(inInput);
    const outLabel = document.createElement("label"); outLabel.textContent = "OUT"; outWrap.appendChild(outLabel);
    outWrap.appendChild(outInput);

    function apply() {
      const t = clampTrim(parseFloat(inInput.value), parseFloat(outInput.value), dur);
      clip.in_point = t.in_point; clip.out_point = t.out_point;
      inInput.value = t.in_point.toFixed(1); outInput.value = t.out_point.toFixed(1);
      onChange();
    }
    inInput.addEventListener("change", apply);
    outInput.addEventListener("change", apply);

    const setIn = document.createElement("button");
    setIn.textContent = "Set in from playhead";
    setIn.addEventListener("click", () => { inInput.value = player.currentTime.toFixed(1); apply(); });
    const setOut = document.createElement("button");
    setOut.textContent = "Set out from playhead";
    setOut.addEventListener("click", () => { outInput.value = player.currentTime.toFixed(1); apply(); });
    panel.appendChild(setIn);
    panel.appendChild(setOut);
  }

  function showText(block, onChange) {
    heading("TEXT BLOCK");
    textField("HEADING", block.heading, (v) => { block.heading = v; onChange(); });
    textField("SUBHEADING", block.subheading || "", (v) => { block.subheading = v; onChange(); });
    const row = document.createElement("div");
    row.className = "field-row";
    panel.appendChild(row);
    const startWrap = document.createElement("div"); row.appendChild(startWrap);
    const endWrap = document.createElement("div"); row.appendChild(endWrap);
    const startLabel = document.createElement("label"); startLabel.textContent = "START"; startWrap.appendChild(startLabel);
    const startInput = document.createElement("input");
    startInput.type = "number"; startInput.step = "0.1"; startInput.value = block.start.toFixed(1);
    startInput.addEventListener("change", () => { block.start = parseFloat(startInput.value); onChange(); });
    startWrap.appendChild(startInput);
    const endLabel = document.createElement("label"); endLabel.textContent = "END"; endWrap.appendChild(endLabel);
    const endInput = document.createElement("input");
    endInput.type = "number"; endInput.step = "0.1"; endInput.value = block.end.toFixed(1);
    endInput.addEventListener("change", () => { block.end = parseFloat(endInput.value); onChange(); });
    endWrap.appendChild(endInput);
  }

  function showCaption(group) {
    heading(`CAPTION · ${group[0].t_start.toFixed(1)}–${group[group.length - 1].t_end.toFixed(1)}`);
    const text = document.createElement("div");
    text.className = "readonly-text";
    text.textContent = group.map((w) => w.text).join(" ");
    panel.appendChild(text);
    const note = document.createElement("div");
    note.className = "readonly-text";
    note.style.marginTop = "8px";
    note.textContent = "Word-level editing and re-transcription land in a later task.";
    panel.appendChild(note);
  }

  function show(selection, { onChange }) {
    clear();
    panel.hidden = false;
    if (selection.type === "video") {
      showVideo(selection.item, selection.clipDuration, onChange);
    } else if (selection.type === "text") {
      showText(selection.item, onChange);
    } else if (selection.type === "caption") {
      showCaption(selection.item);
    }
  }

  function hide() {
    panel.hidden = true;
    clear();
  }

  return { show, hide };
})();
```

- [ ] **Step 2: Wire selection state into `static/editor.js`.** Add near the top (with the other module-level state):

```js
let selected = null;
```

Replace the `renderTimeline` function written in Task 3 with a version that passes real selection state:

```js
function renderTimeline() {
  const t = parseFloat(document.getElementById("time").textContent) || 0;
  Timeline.render(project, t, selected, onTimelineSelect);
}

function onTimelineSelect({ type, item, groupIndex }) {
  if (type === "video") {
    selected = { type, item, clipDuration: clipDurations[item.id] ?? item.out_point };
  } else {
    selected = { type, item, groupIndex };
  }
  ContextPanel.show(selected, { onChange: async () => { await saveProject(); renderTimeline(); Preview.load(project); } });
  renderTimeline();
}
```

- [ ] **Step 3: Remove the inline trim UI from `renderClipList`.** In `static/editor.js`, replace the whole `renderClipList` function body's per-clip block (everything from `const dur = clipDurations[c.id]...` through `li.appendChild(br);`) so the function becomes:

```js
function renderClipList() {
  const list = document.getElementById("clip-list");
  list.innerHTML = "";
  const ordered = [...project.clips].sort((a, b) => a.order - b.order);
  ordered.forEach((c, i) => {
    const li = document.createElement("li");
    const label = document.createElement("span");
    label.textContent = c.file_path + " ";
    li.appendChild(label);

    const up = document.createElement("button");
    up.textContent = "▲";
    up.disabled = i === 0;
    up.addEventListener("click", () => moveClip(c, ordered[i - 1]));
    const down = document.createElement("button");
    down.textContent = "▼";
    down.disabled = i === ordered.length - 1;
    down.addEventListener("click", () => moveClip(c, ordered[i + 1]));
    li.appendChild(up);
    li.appendChild(down);

    list.appendChild(li);
  });
}
```

(`clampTrim` stays in `editor.js` — `context-panel.js` calls it as a global function, same file scope as before.)

- [ ] **Step 4: Add the script tag.** In `static/index.html`, add `<script src="/static/context-panel.js"></script>` after `timeline.js` and before `editor.js`.

- [ ] **Step 5: Run `pytest -q`.** Expected: still green.

- [ ] **Step 6: See it.**
  - Click a VIDEO block → right panel shows the file path and IN/OUT fields; editing OUT and pressing Tab/Enter updates the block's width on the timeline and the preview still trims correctly (same behavior as the old inline fields, just relocated).
  - Click the TEXT block → right panel shows HEADING/SUBHEADING/START/END; editing HEADING updates the block's label on the TEXT row live.
  - Click a CAPTIONS block → right panel shows the group's text and time range, read-only.
  - Left clip list no longer shows in/out inputs, only filename + reorder arrows.

- [ ] **Step 7: Commit + push.**

```bash
git add static/context-panel.js static/editor.js static/index.html
git commit -m "feat: contextual right panel for timeline block selection"
git push
```

---

## Verification (whole feature)

1. `pytest -q` — all green (unchanged from before this plan; guards HTML/JS breakage).
2. End-to-end by hand: add 2+ real clips → timeline shows ruler, playhead, VIDEO blocks proportional to duration, seeded TEXT block, seeded CAPTIONS blocks → click each row type → right panel shows correct fields → edit a video's OUT point from the panel → preview/timeline reflect it → click ruler → playback seeks.
3. Update `CLAUDE.md`'s codebase map and inventory to list `timeline.js`, `context-panel.js`, `seed.js`, and the two new CSS files, in the final commit of the plan (fold into Task 4's commit).

## Known limitations (accepted for this milestone)

- Blocks are click-to-select only — no drag-resize/reorder on the strip itself (existing trim fields and ▲▼ reorder still own that).
- CAPTIONS content is seeded placeholder text, not real transcription (Task 10 of the parent plan).
- No text style controls (font/color/position) yet — that's the original Task 7 (now "7b") of the parent plan, unchanged and still pending.
- Only one text block is ever seeded; there is still no UI to add a second one.

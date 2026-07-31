# Transcript Sidebar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an always-visible, editor-only transcript view beside the video stage that shows the caption transcript as flowing sentences (active sentence dark, others grey, active word in an accent color), auto-scrolling during playback, with click-to-seek on any word.

**Architecture:** A pure JS module (`transcript-sentences.js`) groups the flat `CaptionWord[]` list into sentences on `.`/`!`/`?`. A self-registered DOM module (`transcript-sidebar.js`) builds one `<div>`/`<span>` per sentence/word into a new `#transcript-sidebar` element (a sibling of a new `#stage-column` wrapper inside `#stage-wrap`, which changes from a centered column to a row), subscribes to the existing `Preview.onTimeUpdate` hook to toggle highlight classes and auto-scroll every tick, and wires per-word click-to-seek via the existing `Preview.seek(t)`. Two single-line hooks — inside `preview.js`'s `load()` and `panel-captions.js`'s `renderCaptionPreview()` — trigger a structural rebuild everywhere captions already get re-rendered (project load/restore, word add/edit/delete, clip delete/reorder resync, auto-caption), so no other call site needs editing.

**Tech Stack:** Vanilla JS (no build step, no framework), CSS custom properties from `static/css/tokens.css`, `node --test` for the pure module.

## Global Constraints

- No JS build step/bundler; icons via `UI.icon()` only (none needed for this feature).
- No inline `style="..."` attributes in `static/index.html` or JS-rendered markup — all styling via `static/css/**` classes.
- Every `static/*.js` and `static/css/**/*.css` file opens with a one/two-line header comment.
- One function/feature per file; no grouping into catch-all files.
- Pure logic modules expose both `window.X` (browser) and `module.exports` (node --test), guarded by `typeof` checks.
- This feature is editor-display-only: no changes to `app/*.py`, no export/ASS changes, no new `Project`/`CaptionTrack` model fields.

---

### Task 1: `transcript-sentences.js` — pure sentence grouping

**Files:**
- Create: `static/transcript-sentences.js`
- Test: `tests/js/transcript-sentences.test.js`

**Interfaces:**
- Produces: `window.TranscriptSentences.groupBySentence(words: CaptionWord[]) -> Array<{start: number, end: number, words: CaptionWord[]}>`. `CaptionWord` shape used here: `{id, text, t_start, t_end}` (only `text`/`t_start`/`t_end` are read).

- [ ] **Step 1: Write the failing tests**

Create `tests/js/transcript-sentences.test.js`:

```js
// Pure sentence-grouping over a flat CaptionWord[] list, used by the transcript sidebar
// (static/transcript-sidebar.js) to render paragraph-style captions instead of raw word lists.
const test = require("node:test");
const assert = require("node:assert");
const { groupBySentence } = require("../../static/transcript-sentences.js");

function w(text, t_start, t_end) {
  return { id: text, text, t_start, t_end };
}

test("groupBySentence: splits into groups ending at ./!/?", () => {
  const words = [
    w("Hello", 0, 0.3), w("there.", 0.3, 0.6),
    w("How", 0.6, 0.8), w("are", 0.8, 1.0), w("you?", 1.0, 1.3),
  ];
  const result = groupBySentence(words);
  assert.strictEqual(result.length, 2);
  assert.deepStrictEqual(result[0].words.map((x) => x.text), ["Hello", "there."]);
  assert.deepStrictEqual(result[1].words.map((x) => x.text), ["How", "are", "you?"]);
});

test("groupBySentence: sets start/end from the first/last word in each group", () => {
  const words = [w("Hi.", 1.5, 2.0), w("Bye.", 3.0, 3.5)];
  const result = groupBySentence(words);
  assert.deepStrictEqual(result, [
    { start: 1.5, end: 2.0, words: [words[0]] },
    { start: 3.0, end: 3.5, words: [words[1]] },
  ]);
});

test("groupBySentence: a trailing run with no terminal punctuation still forms a final group", () => {
  const words = [w("Done.", 0, 0.5), w("but", 0.5, 0.7), w("trailing", 0.7, 1.0)];
  const result = groupBySentence(words);
  assert.strictEqual(result.length, 2);
  assert.deepStrictEqual(result[1].words.map((x) => x.text), ["but", "trailing"]);
  assert.strictEqual(result[1].start, 0.5);
  assert.strictEqual(result[1].end, 1.0);
});

test("groupBySentence: exclamation and question marks also end a sentence", () => {
  const words = [w("Wait!", 0, 0.3), w("Really?", 0.3, 0.6)];
  const result = groupBySentence(words);
  assert.strictEqual(result.length, 2);
});

test("groupBySentence: empty word list returns an empty array", () => {
  assert.deepStrictEqual(groupBySentence([]), []);
});

test("groupBySentence: one long run-on sentence with no punctuation is a single group", () => {
  const words = [w("one", 0, 0.2), w("two", 0.2, 0.4), w("three", 0.4, 0.6)];
  const result = groupBySentence(words);
  assert.strictEqual(result.length, 1);
  assert.strictEqual(result[0].words.length, 3);
});

test("groupBySentence: does not mutate the input array or its words", () => {
  const words = [w("Hi.", 0, 0.5)];
  const snapshot = JSON.stringify(words);
  groupBySentence(words);
  assert.strictEqual(JSON.stringify(words), snapshot);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/js/transcript-sentences.test.js`
Expected: FAIL — `Cannot find module '../../static/transcript-sentences.js'`

- [ ] **Step 3: Implement `static/transcript-sentences.js`**

```js
// Pure sentence-grouping over a flat CaptionWord[] list: splits into groups ending at any word
// whose text ends in ".", "!", or "?" — a trailing run with no terminal punctuation still forms
// a final group so no words are dropped. Consumed by static/transcript-sidebar.js. No Python
// mirror: editor-display-only, not part of export/ASS rendering.
(() => {
  function buildSentence(words) {
    return { start: words[0].t_start, end: words[words.length - 1].t_end, words };
  }

  function groupBySentence(words) {
    const sentences = [];
    let current = [];
    for (const word of words) {
      current.push(word);
      if (/[.!?]$/.test(word.text.trim())) {
        sentences.push(buildSentence(current));
        current = [];
      }
    }
    if (current.length > 0) sentences.push(buildSentence(current));
    return sentences;
  }

  const api = { groupBySentence };
  if (typeof window !== "undefined") window.TranscriptSentences = api;
  if (typeof module !== "undefined") module.exports = api;
})();
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/js/transcript-sentences.test.js`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add static/transcript-sentences.js tests/js/transcript-sentences.test.js
git commit -m "Add pure sentence-grouping helper for the transcript sidebar"
```

---

### Task 2: Layout scaffolding — `#stage-column` / `#transcript-sidebar`

**Files:**
- Modify: `static/index.html` (lines ~52-73, the `#stage-wrap` block)
- Modify: `static/css/components/stage.css` (lines 1-14, the `#stage-wrap` rule)
- Create: `static/css/components/transcript-sidebar.css`
- Modify: `static/index.html` (stylesheet `<link>` block, ~line 38)

**Interfaces:**
- Produces: DOM elements `#stage-column` (wraps existing `#stage` + `#transport`) and `#transcript-sidebar` (empty, populated by Task 3), both children of `#stage-wrap`.

- [ ] **Step 1: Restructure `index.html`'s stage markup**

In `static/index.html`, the current block (~line 52-73) is:

```html
    <div id="center-col">
      <section id="stage-wrap">
        <div id="stage">
          <video id="player" class="stage-media"></video>
          <img id="image-player" class="stage-media stage-hidden">
          <div id="overlay"></div>
          <div id="safe-zones" hidden></div>
        </div>
        <div id="transport">
          ...
        </div>
      </section>
```

Change it to wrap `#stage` + `#transport` in a new `#stage-column`, and add `#transcript-sidebar` as its sibling:

```html
    <div id="center-col">
      <section id="stage-wrap">
        <div id="stage-column">
          <div id="stage">
            <video id="player" class="stage-media"></video>
            <img id="image-player" class="stage-media stage-hidden">
            <div id="overlay"></div>
            <div id="safe-zones" hidden></div>
          </div>
          <div id="transport">
            ...
          </div>
        </div>
        <div id="transcript-sidebar" hidden></div>
      </section>
```

(Leave every line inside the old `#transport` block exactly as-is — only the wrapping `<div id="stage-column">`/`</div>` and the new `<div id="transcript-sidebar" hidden></div>` are added. `hidden` starts true; Task 3's `render()` clears it once there are captions.)

- [ ] **Step 2: Move the centering styles from `#stage-wrap` to `#stage-column`, make `#stage-wrap` a row**

In `static/css/components/stage.css`, replace:

```css
#stage-wrap {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-3);
  background: var(--bg-0);
  padding: var(--space-4);
  min-width: 0;
  min-height: 0;
}
```

with:

```css
#stage-wrap {
  flex: 1;
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  background: var(--bg-0);
  padding: var(--space-4);
  min-width: 0;
  min-height: 0;
}

#stage-column {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-3);
  height: 100%;
  min-width: 0;
  min-height: 0;
}
```

- [ ] **Step 3: Create `static/css/components/transcript-sidebar.css`**

```css
/* #transcript-sidebar: the paragraph-style caption transcript beside the stage (editor-only, not exported). */
/* Exposes #transcript-sidebar and its .transcript-sentence/.transcript-word children. Depends on tokens.css. */
#transcript-sidebar {
  flex: 1;
  min-width: 0;
  max-width: 480px;
  height: 100%;
  overflow-y: auto;
  margin-left: var(--space-4);
  padding: var(--space-2) 0;
  font-family: var(--font-content);
  font-size: var(--fs-lg);
  line-height: 1.6;
}

.transcript-sentence {
  color: var(--text-muted);
  margin-bottom: var(--space-2-5);
  transition: color var(--transition-fade);
}

.transcript-sentence.active {
  color: var(--text);
}

.transcript-word {
  cursor: pointer;
}

.transcript-word:hover {
  text-decoration: underline;
}

.transcript-word.active-word {
  color: var(--accent-gold);
}
```

- [ ] **Step 4: Link the new stylesheet in `index.html`**

In `static/index.html`, add after the `stage.css` link (~line 10):

```html
<link rel="stylesheet" href="/static/css/components/stage.css">
<link rel="stylesheet" href="/static/css/components/transcript-sidebar.css">
```

- [ ] **Step 5: Manually verify the layout with no JS changes yet**

Run: `.venv/Scripts/python -m uvicorn app.main:app --reload`
Open `http://127.0.0.1:8000`, open any existing project (or create one). Confirm:
- The video stage still renders centered, same size as before.
- No visible layout shift or console errors (the `#transcript-sidebar` div is present but empty/`hidden`, so invisible).

- [ ] **Step 6: Commit**

```bash
git add static/index.html static/css/components/stage.css static/css/components/transcript-sidebar.css
git commit -m "Add #stage-column/#transcript-sidebar layout scaffolding"
```

---

### Task 3: `transcript-sidebar.js` — rendering, highlighting, click-to-seek

**Files:**
- Create: `static/transcript-sidebar.js`
- Modify: `static/index.html` (script tags, ~line 811 area)
- Modify: `static/preview.js` (`load()`, ~line 292-326)
- Modify: `static/panel-captions.js` (`renderCaptionPreview()`, ~line 63-67)
- Test: `tests/js/transcript-sidebar-hooks.test.js` (source-shape guard, mirrors `tests/js/preview-load-refreshes-overlays.test.js`)

**Interfaces:**
- Consumes: `TranscriptSentences.groupBySentence(words)` (Task 1); `window.Preview.{onTimeUpdate(fn), seek(t), currentTimelineTime()}` (existing, `static/preview.js`); `project.captions.words` (existing model).
- Produces: `window.TranscriptSidebar.render(project)` — rebuilds the sentence/word DOM from `project.captions.words` (or hides the sidebar if there are none) and repaints the highlight for the current time. Called by `preview.js`'s `load()` and `panel-captions.js`'s `renderCaptionPreview()`.

- [ ] **Step 1: Implement `static/transcript-sidebar.js`**

```js
// Renders the transcript sidebar (#transcript-sidebar, static/css/components/transcript-sidebar.css):
// one <div class="transcript-sentence"> per sentence (static/transcript-sentences.js), one
// <span class="transcript-word"> per word. Self-registers onto Preview.onTimeUpdate to toggle
// .active/.active-word classes and auto-scroll every playback tick, so no caller has to drive a
// render loop. render(project) does the structural rebuild and is called from preview.js's load()
// and panel-captions.js's renderCaptionPreview() — the two places captions already get re-rendered
// on every structural change (project load/restore, word add/edit/delete, clip delete/reorder
// resync via caption-clip-sync.js, auto-caption completion).
window.TranscriptSidebar = (() => {
  const container = document.getElementById("transcript-sidebar");
  let sentenceEls = []; // [{ sentence, el }], aligned with the current sentence list
  let wordEls = [];     // [{ word, el }], flat across all sentences
  let activeSentenceIndex = -1;

  function render(project) {
    const words = (project.captions && project.captions.words) || [];
    const sentences = TranscriptSentences.groupBySentence(words);

    container.innerHTML = "";
    sentenceEls = [];
    wordEls = [];
    activeSentenceIndex = -1;

    if (sentences.length === 0) {
      container.hidden = true;
      return;
    }
    container.hidden = false;

    sentences.forEach((sentence) => {
      const sentenceDiv = document.createElement("div");
      sentenceDiv.className = "transcript-sentence";
      sentence.words.forEach((word, i) => {
        const span = document.createElement("span");
        span.className = "transcript-word";
        span.textContent = word.text + (i < sentence.words.length - 1 ? " " : "");
        span.addEventListener("click", () => Preview.seek(word.t_start));
        sentenceDiv.appendChild(span);
        wordEls.push({ word, el: span });
      });
      container.appendChild(sentenceDiv);
      sentenceEls.push({ sentence, el: sentenceDiv });
    });

    updateHighlight(Preview.currentTimelineTime());
  }

  function updateHighlight(timelineTime) {
    if (sentenceEls.length === 0) return;

    const newIndex = sentenceEls.findIndex(
      ({ sentence }) => timelineTime >= sentence.start && timelineTime < sentence.end);
    if (newIndex !== activeSentenceIndex) {
      sentenceEls.forEach(({ el }, i) => el.classList.toggle("active", i === newIndex));
      activeSentenceIndex = newIndex;
      if (newIndex >= 0) {
        sentenceEls[newIndex].el.scrollIntoView({ block: "center", behavior: "smooth" });
      }
    }

    wordEls.forEach(({ word, el }) => {
      const isActive = timelineTime >= word.t_start && timelineTime < word.t_end;
      el.classList.toggle("active-word", isActive);
    });
  }

  Preview.onTimeUpdate(updateHighlight);

  return { render };
})();
```

- [ ] **Step 2: Register the script tags in `index.html`**

In `static/index.html`, after the `preview.js` tag:

```html
<script src="/static/preview.js"></script>
<script src="/static/transcript-sentences.js"></script>
<script src="/static/transcript-sidebar.js"></script>
```

- [ ] **Step 3: Hook the structural rebuild into `preview.js`'s `load()`**

In `static/preview.js`, inside `function load(project) { ... }` (~line 292-326), add the call right after the existing `PreviewAudio.load(project);` line:

```js
    PreviewAudio.load(project);
    TranscriptSidebar.render(project);
```

- [ ] **Step 4: Hook the structural rebuild into `panel-captions.js`'s `renderCaptionPreview()`**

In `static/panel-captions.js`, replace:

```js
function renderCaptionPreview() {
  if (window.Preview && Preview.renderCaptions) {
    Preview.renderCaptions(project, project.text_presets, Preview.currentTimelineTime());
  }
}
```

with:

```js
function renderCaptionPreview() {
  if (window.Preview && Preview.renderCaptions) {
    Preview.renderCaptions(project, project.text_presets, Preview.currentTimelineTime());
  }
  if (window.TranscriptSidebar) TranscriptSidebar.render(project);
}
```

- [ ] **Step 5: Write the failing guard tests**

Create `tests/js/transcript-sidebar-hooks.test.js`:

```js
// Guard test pinning the two integration points that keep the transcript sidebar (see
// static/transcript-sidebar.js) in sync with caption changes: preview.js's load() and
// panel-captions.js's renderCaptionPreview() both DOM-bound files this project's dependency-free
// `node --test` setup can't exercise behaviorally, so this pins the source-level call instead —
// losing either one means the sidebar silently goes stale after a project load/restore or a
// caption word edit.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

function functionBody(src, signature, label) {
  const start = src.indexOf(signature);
  assert.notStrictEqual(start, -1, `${label} no longer defines ${signature}`);
  let depth = 0;
  for (let i = src.indexOf("{", start); i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}" && --depth === 0) return src.slice(start, i + 1);
  }
  throw new Error(`unbalanced braces in ${label}`);
}

test("preview.js's load() rebuilds the transcript sidebar", () => {
  const source = fs.readFileSync(path.join(__dirname, "../../static/preview.js"), "utf8");
  const body = functionBody(source, "function load(project) {", "preview.js");
  assert.match(body, /TranscriptSidebar\.render\(project\)/,
    "load() must call TranscriptSidebar.render(project), or the sidebar goes stale after project load/restore");
});

test("panel-captions.js's renderCaptionPreview() rebuilds the transcript sidebar", () => {
  const source = fs.readFileSync(path.join(__dirname, "../../static/panel-captions.js"), "utf8");
  const body = functionBody(source, "function renderCaptionPreview() {", "panel-captions.js");
  assert.match(body, /TranscriptSidebar\.render\(project\)/,
    "renderCaptionPreview() must call TranscriptSidebar.render(project), or word edits/auto-caption go stale");
});
```

- [ ] **Step 6: Run the guard tests to verify they pass**

Run: `node --test tests/js/transcript-sidebar-hooks.test.js`
Expected: PASS (2 tests) — Steps 3/4 already made the source changes these tests pin.

- [ ] **Step 7: Run the full JS test suite**

Run: `node --test "tests/js/**/*.test.js"`
Expected: PASS, no regressions.

- [ ] **Step 8: Commit**

```bash
git add static/transcript-sidebar.js static/index.html static/preview.js static/panel-captions.js tests/js/transcript-sidebar-hooks.test.js
git commit -m "Render the transcript sidebar and wire it into caption re-render points"
```

---

### Task 4: Manual verification in the browser

**Files:** none (no code changes — this is a live-verification pass, per project convention that JS-rendered UI is checked in the browser, not just by `node --test`).

- [ ] **Step 1: Start the server and open a throwaway test project with existing captions**

Run: `.venv/Scripts/python -m uvicorn app.main:app --reload`

Open `http://127.0.0.1:8000`, open (or create, via a short clip + Auto-caption) a **throwaway** test project — not a real project, per this codebase's convention that the app's unload autosave can flush in-memory test mutations to disk.

- [ ] **Step 2: Verify layout**

Confirm the transcript sidebar appears to the right of the video stage, filling the space that used to be empty, with plain text on the app background (no border/box), and that the video stage is still full height and correctly positioned.

- [ ] **Step 3: Verify sentence grouping and highlighting during playback**

Press play. Confirm:
- The transcript shows full sentences (not single words with timestamps).
- The currently-playing sentence is bright/dark text; other sentences are grey.
- Within the active sentence, the current word is highlighted in the gold accent color and updates as playback proceeds.
- The view auto-scrolls to keep the active sentence visible as playback continues past the initially-visible sentences.

- [ ] **Step 4: Verify click-to-seek**

While paused (or during playback), click a word further down in the transcript. Confirm the playhead (and video frame) jumps to that word's start time, and the transcript's active-sentence highlight updates accordingly.

- [ ] **Step 5: Verify it stays in sync after edits**

In the CAPTIONS panel's Closed-caption tab, edit a word's text or delete a word. Confirm the transcript sidebar's sentence grouping updates to match (no stale/duplicate words). Run Auto-caption on a clip with no existing transcript and confirm the sidebar populates once transcription completes.

- [ ] **Step 6: Verify the empty state**

Open (or create) a project with no captions at all. Confirm the transcript sidebar area is empty/invisible and the video stage centers as it did before this feature.

- [ ] **Step 7: Report results**

Note in the session (no commit needed) whether all checks passed, or list what failed for follow-up.

---

### Task 5: Update the codebase map

**Files:**
- Modify: `CLAUDE.md` (Codebase map section — File structure tree and Inventory)

- [ ] **Step 1: Add File structure tree entries**

In `CLAUDE.md`'s `## File structure` tree, under the `static/` block, add one-line entries (matching the existing style/format of neighboring entries) for:
- `transcript-sentences.js` — pure sentence-grouping helper (Task 1)
- `transcript-sidebar.js` — the rendering/highlighting/click-to-seek module (Task 3)
- `css/components/transcript-sidebar.css` — the sidebar's styling (Task 2)

Also update the existing `index.html` entry's prose to mention the new `#stage-column`/`#transcript-sidebar` structure inside `#stage-wrap`, and the existing `stage.css` entry to mention the row-layout change.

- [ ] **Step 2: Add an Inventory entry**

Under `## Inventory`, add a new subsection (e.g. `### Transcript sidebar`) following the format of neighboring feature subsections (short description + the files that implement it, one line each), referencing the design spec at `docs/superpowers/specs/2026-07-31-transcript-sidebar-design.md`.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "Update codebase map for the transcript sidebar feature"
```

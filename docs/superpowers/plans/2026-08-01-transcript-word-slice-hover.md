# Transcript Word Hover Slice-Toolbar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hovering a word in the transcript sidebar reveals a popover toolbar with a scissors button that slices the MAIN clip sequence at that word's start time.

**Architecture:** A new `static/transcript-word-slice.js` wires one delegated `mouseover` listener on `#transcript-sidebar`, lazily attaching the existing `UI.popoverToolbar` component to a hovered word span (once per span, only when a slice there would currently be valid), reusing the existing `Timeline.sliceClip`/`Timeline.isSliceDisabled` helpers and the same save/reload sequence the timeline's own scissors button already uses.

**Tech Stack:** Vanilla JS (no framework, no bundler), existing `UI.popoverToolbar`/`Timeline` globals, CSS via the existing component stylesheet convention.

## Global Constraints

- No JS build step/bundler — icons come from `UI.icon(name, {size})`, never hand-inlined `<svg>` markup.
- No inline `style="..."` attributes in `static/index.html` or JS-rendered markup — styling lives in `static/css/**` component files.
- Word's `t_start` is the cut point (not `t_end`).
- After a successful slice, the playhead seeks to the cut point (matches the existing `#slice-action` timeline button).
- A word whose slice would be a no-op (`Timeline.isSliceDisabled` true) must not show the toolbar at all — eligibility is rechecked fresh on every hover, not cached.
- This is thin DOM-wiring UI code with no new pure logic — per the project's stated exception for thin UI layers, it is verified manually in the browser rather than via an automated test (the pure helpers it calls, `Timeline.isSliceDisabled`/`sliceClip`, are already covered by `tests/js/timeline-slice.test.js`).

---

### Task 1: Wire the hover slice-toolbar onto transcript words

**Files:**
- Modify: `static/transcript-sidebar.js` (the word-span-building loop inside `render()`)
- Create: `static/transcript-word-slice.js`
- Modify: `static/css/components/transcript-sidebar.css` (`.transcript-word` rule)
- Modify: `static/index.html` (script tag insertion)

**Interfaces:**
- Consumes: `UI.popoverToolbar(anchorEl, buttons)` (`static/ui-popover-toolbar.js`, unchanged, returns the toolbar element — not used here); `Timeline.isSliceDisabled(clips, t, eps=0.05)` and `Timeline.sliceClip(clips, t, eps=0.05) -> {clips, newId}` (`static/timeline-slice.js`, unchanged); `Preview.load(project)`, `Preview.seek(t)` (`static/preview.js`, unchanged); `project`, `saveProject()`, `renderTimeline()` (globals owned by `static/editor.js`, unchanged).
- Produces: no new exported symbols — this task is terminal DOM wiring, nothing later depends on it.

- [ ] **Step 1: Add `dataset.tStart` to each transcript word span**

In `static/transcript-sidebar.js`, find the `sentence.words.forEach((word, i) => { ... })` loop inside `render()` (currently builds the `span` and appends it). Add one line setting `span.dataset.tStart` right after the span is created, so the timestamp is readable off the DOM element itself:

```javascript
      sentence.words.forEach((word, i) => {
        const span = document.createElement("span");
        span.className = "transcript-word";
        span.dataset.tStart = word.t_start;
        span.textContent = word.text + (i < sentence.words.length - 1 ? " " : "");
        span.addEventListener("click", () => Preview.seek(word.t_start));
        sentenceDiv.appendChild(span);
        wordEls.push({ word, el: span });
      });
```

- [ ] **Step 2: Create `static/transcript-word-slice.js`**

```javascript
// Hover-to-slice on the transcript sidebar: hovering a .transcript-word span (static/
// transcript-sidebar.js) lazily reveals a UI.popoverToolbar (static/ui-popover-toolbar.js) with a
// scissors button, wired only once per span (on the first hover where slicing there is currently
// valid) so a long transcript's hundreds of words don't all get DOM/listeners up front. Clicking
// slices the MAIN clip sequence at that word's t_start via Timeline.sliceClip (static/timeline-
// slice.js), mirroring that file's own #slice-action click handler's save/reload sequence.
// Reaches into editor.js's project/saveProject/renderTimeline globals and the Preview global at
// call time — same documented approach static/timeline-slice.js itself uses.
(() => {
  const container = document.getElementById("transcript-sidebar");

  container.addEventListener("mouseover", (e) => {
    const span = e.target.closest(".transcript-word");
    if (!span) return;

    const tStart = parseFloat(span.dataset.tStart);
    if (Timeline.isSliceDisabled(project.clips, tStart)) return;
    if (span.dataset.sliceToolbarBound) return;
    span.dataset.sliceToolbarBound = "true";

    UI.popoverToolbar(span, [{
      icon: "scissors",
      title: "Slice main clip here",
      onClick: async () => {
        const { newId } = Timeline.sliceClip(project.clips, tStart);
        if (!newId) return;               // boundary / empty timeline -> harmless no-op
        await saveProject();
        Preview.load(project);
        Preview.seek(tStart);             // Preview.load resets the clock to 0; seek back so the
        renderTimeline();                 // playhead lands where the cut was made
      },
    }]);
  });
})();
```

- [ ] **Step 3: Add `position: relative` to `.transcript-word`**

In `static/css/components/transcript-sidebar.css`, the existing `.transcript-word` rule:

```css
.transcript-word {
  cursor: pointer;
  border-radius: var(--radius-sm);
  padding: 1px 2px;
  margin: -1px -2px;
  border: var(--border-width) solid transparent;
  border-left-width: 3px;
}
```

becomes:

```css
.transcript-word {
  position: relative;
  cursor: pointer;
  border-radius: var(--radius-sm);
  padding: 1px 2px;
  margin: -1px -2px;
  border: var(--border-width) solid transparent;
  border-left-width: 3px;
}
```

(`UI.popoverToolbar`'s chip is `position: absolute`, so its anchor needs a positioning context — the component already adds the `ui-popover-toolbar-anchor` class itself, no other CSS change needed.)

- [ ] **Step 4: Add the script tag to `static/index.html`**

Find this line (loads `static/timeline-slice.js`):

```html
<script src="/static/timeline-slice.js"></script>
```

Add the new script immediately after it:

```html
<script src="/static/timeline-slice.js"></script>
<script src="/static/transcript-word-slice.js"></script>
```

- [ ] **Step 5: Manually verify in the browser**

Run: `.venv/Scripts/python -m uvicorn app.main:app --reload`

Open `http://127.0.0.1:8000` on a project that has transcribed captions (or run Auto-caption on a clip with speech first). Then:

1. Hover a word in the transcript sidebar mid-way through the MAIN clip sequence — a small scissors toolbar should fade in above the word after a brief pause.
2. Click it — the MAIN clip should split at that word's start time (visible as a new block boundary in the timeline's VIDEO/MAIN row), and the playhead should land exactly at that word's start.
3. Hover a word very close to an existing clip boundary (e.g. right after a slice you just made) — the toolbar should NOT appear (matches `Timeline.isSliceDisabled`'s 0.05s tolerance).
4. If the transcript runs longer than the MAIN clip sequence's total duration, hover a word past the end of the video — the toolbar should NOT appear there either.
5. Confirm the timeline's own `#slice-action` scissors button (unrelated to this change) still works as before.

- [ ] **Step 6: Commit**

```bash
git add static/transcript-sidebar.js static/transcript-word-slice.js static/css/components/transcript-sidebar.css static/index.html
git commit -m "$(cat <<'EOF'
Add hover slice-toolbar to transcript sidebar words

Hovering a transcript word now reveals a scissors button (via the
existing UI.popoverToolbar component) that slices the MAIN clip
sequence at that word's start time, mirroring the timeline's own
scissors button.
EOF
)"
```

---

## Codebase map update

After Task 1 lands, `CLAUDE.md`'s codebase map must be updated in the same commit (per the project's file-structure convention): add an entry for `static/transcript-word-slice.js` under the file tree (near `transcript-sidebar.js`) and a short note in the "Transcript sidebar" inventory section describing the new hover-slice wiring and its `dataset.tStart`/`dataset.sliceToolbarBound` convention on `.transcript-word` spans.

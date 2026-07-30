# Caption/Clip Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Caption words stay aligned with the MAIN video clip they overlap in time — deleting a clip deletes its captions and closes the gap, reordering a clip re-times its captions with it, and inserting a clip mid-sequence shifts later captions to make room.

**Architecture:** A new pure, dependency-free JS module (`static/caption-clip-sync.js`, same pattern as `static/format-run-write.js`/`static/box-mask.js`) exposes three functions computing caption timing changes from clip timing changes. It's wired into the three existing frontend clip-mutation call sites (`panel-video.js`'s `deleteClip`/`moveClipTo`, `clip-sequence.js`'s `insertClipIntoSequence`) — no backend or data-model changes.

**Tech Stack:** Vanilla JS (no build step), `node --test` for pure-function unit tests, Python/pytest untouched (no backend changes in this feature).

## Global Constraints

- No new persisted fields — clip/caption association is always recomputed from `t_start`/`t_end` vs. clip timeline ranges, never stored (per spec's "Grouping basis").
- Text blocks and video/image boxes are explicitly out of scope — do not touch `project.text_blocks`, `project.video_boxes`, or `project.image_boxes` in this feature.
- Every new/modified file gets or keeps its 2–3 line header comment (project convention).
- `static/caption-clip-sync.js` must follow the `format-run-write.js` dual-export pattern: `window.CaptionClipSync` in the browser, `module.exports` for `node --test`.
- `CLAUDE.md`'s codebase map/inventory must be updated in the same commit that adds or changes the described behavior.

---

### Task 1: `caption-clip-sync.js` — `clipRanges()`

**Files:**
- Create: `static/caption-clip-sync.js`
- Create: `tests/js/caption-clip-sync.test.js`
- Modify: `static/index.html:776` (add script tag)

**Interfaces:**
- Produces: `window.CaptionClipSync.clipRanges(clips: ClipLayer[]) -> {id: string, start: number, end: number}[]` — one entry per clip, sorted by `.order`, each clip's speed-scaled duration `(out_point - in_point) / (speed || 1)` accumulated into a running start/end (mirrors `app/timeline.py`'s `clip_starts`).

- [ ] **Step 1: Write the failing tests**

Create `tests/js/caption-clip-sync.test.js`:

```javascript
// Pure timeline-splice + per-clip-delta helpers keeping caption words aligned with the MAIN
// clip they overlap when a clip is deleted, moved, or a new clip is inserted mid-sequence.
const test = require("node:test");
const assert = require("node:assert");
const { clipRanges } = require("../../static/caption-clip-sync.js");

test("clipRanges: accumulates timeline start/end in order", () => {
  const clips = [
    { id: "a", in_point: 0, out_point: 5, order: 0 },
    { id: "b", in_point: 0, out_point: 3, order: 1 },
    { id: "c", in_point: 0, out_point: 2, order: 2 },
  ];
  assert.deepStrictEqual(clipRanges(clips), [
    { id: "a", start: 0, end: 5 },
    { id: "b", start: 5, end: 8 },
    { id: "c", start: 8, end: 10 },
  ]);
});

test("clipRanges: respects .order over array position", () => {
  const clips = [
    { id: "b", in_point: 0, out_point: 3, order: 1 },
    { id: "a", in_point: 0, out_point: 5, order: 0 },
  ];
  assert.deepStrictEqual(clipRanges(clips), [
    { id: "a", start: 0, end: 5 },
    { id: "b", start: 5, end: 8 },
  ]);
});

test("clipRanges: speed scales duration down for speed > 1", () => {
  const clips = [{ id: "a", in_point: 0, out_point: 10, order: 0, speed: 2 }];
  assert.deepStrictEqual(clipRanges(clips), [{ id: "a", start: 0, end: 5 }]);
});

test("clipRanges: missing speed defaults to 1", () => {
  const clips = [{ id: "a", in_point: 2, out_point: 6, order: 0 }];
  assert.deepStrictEqual(clipRanges(clips), [{ id: "a", start: 0, end: 4 }]);
});

test("clipRanges: empty clip list returns empty array", () => {
  assert.deepStrictEqual(clipRanges([]), []);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/js/caption-clip-sync.test.js`
Expected: FAIL — `Cannot find module '../../static/caption-clip-sync.js'`

- [ ] **Step 3: Create the module with `clipRanges()`**

Create `static/caption-clip-sync.js`:

```javascript
// Pure timeline-splice + per-clip-delta helpers keeping caption words aligned with the MAIN
// clip they overlap: shiftCaptionsAfterEdit() handles a clip delete/insert as one splice point,
// resyncCaptionsAfterReorder() handles drag-reorder (a non-monotonic permutation) via per-clip
// deltas. Pure: exposes window.CaptionClipSync in the browser and module.exports for node --test.
(() => {
  // Mirrors app/timeline.py's clip_starts: one {id, start, end} per clip, in .order, using each
  // clip's speed-scaled timeline duration (out_point - in_point) / speed.
  function clipRanges(clips) {
    const ordered = [...clips].sort((a, b) => a.order - b.order);
    let acc = 0;
    return ordered.map((c) => {
      const duration = (c.out_point - c.in_point) / (c.speed || 1);
      const range = { id: c.id, start: acc, end: acc + duration };
      acc += duration;
      return range;
    });
  }

  const api = { clipRanges };
  if (typeof window !== "undefined") window.CaptionClipSync = api;
  if (typeof module !== "undefined") module.exports = api;
})();
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/js/caption-clip-sync.test.js`
Expected: PASS (5 tests)

- [ ] **Step 5: Register the script tag**

In `static/index.html`, after line 776 (`<script src="/static/format-run-write.js"></script>`), add:

```html
<script src="/static/caption-clip-sync.js"></script>
```

- [ ] **Step 6: Commit**

```bash
git add static/caption-clip-sync.js tests/js/caption-clip-sync.test.js static/index.html
git commit -m "feat: add clipRanges() for caption/clip sync"
```

---

### Task 2: `caption-clip-sync.js` — `shiftCaptionsAfterEdit()`

**Files:**
- Modify: `static/caption-clip-sync.js`
- Modify: `tests/js/caption-clip-sync.test.js`

**Interfaces:**
- Consumes: nothing from Task 1's `clipRanges` (independent function in the same file).
- Produces: `window.CaptionClipSync.shiftCaptionsAfterEdit(words: CaptionWord[], editStart: number, oldDuration: number, newDuration: number) -> CaptionWord[]` — a new array. Words with `t_start` in `[editStart, editStart + oldDuration)` are dropped; words with `t_start >= editStart + oldDuration` get `t_start`/`t_end` shifted by `delta = newDuration - oldDuration`; words before `editStart` pass through unchanged. Delete usage: `oldDuration = <deleted clip duration>, newDuration = 0`. Insert usage: `oldDuration = 0, newDuration = <inserted clip duration>`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/js/caption-clip-sync.test.js` (update the `require` line first):

```javascript
const { clipRanges, shiftCaptionsAfterEdit } = require("../../static/caption-clip-sync.js");
```

```javascript
test("shiftCaptionsAfterEdit (delete): removes words inside the deleted range", () => {
  const words = [
    { id: "1", text: "a", t_start: 5, t_end: 5.4 },
    { id: "2", text: "b", t_start: 7, t_end: 7.4 },
  ];
  const result = shiftCaptionsAfterEdit(words, 5, 3, 0);
  assert.deepStrictEqual(result, []);
});

test("shiftCaptionsAfterEdit (delete): leaves earlier words untouched and shifts later ones left", () => {
  const words = [
    { id: "1", text: "before", t_start: 1, t_end: 1.4 },
    { id: "2", text: "inside", t_start: 6, t_end: 6.4 },
    { id: "3", text: "after", t_start: 10, t_end: 10.4 },
  ];
  // Clip deleted was [5, 8) — 3 seconds long.
  const result = shiftCaptionsAfterEdit(words, 5, 3, 0);
  assert.deepStrictEqual(result, [
    { id: "1", text: "before", t_start: 1, t_end: 1.4 },
    { id: "3", text: "after", t_start: 7, t_end: 7.4 },
  ]);
});

test("shiftCaptionsAfterEdit (delete): deleting the last clip removes with nothing to shift", () => {
  const words = [
    { id: "1", text: "before", t_start: 1, t_end: 1.4 },
    { id: "2", text: "inside", t_start: 6, t_end: 6.4 },
  ];
  const result = shiftCaptionsAfterEdit(words, 5, 3, 0);
  assert.deepStrictEqual(result, [{ id: "1", text: "before", t_start: 1, t_end: 1.4 }]);
});

test("shiftCaptionsAfterEdit (insert): words before the drop point are untouched", () => {
  const words = [{ id: "1", text: "before", t_start: 1, t_end: 1.4 }];
  const result = shiftCaptionsAfterEdit(words, 5, 0, 2.5);
  assert.deepStrictEqual(result, [{ id: "1", text: "before", t_start: 1, t_end: 1.4 }]);
});

test("shiftCaptionsAfterEdit (insert): words at/after the drop point shift right", () => {
  const words = [
    { id: "1", text: "at-point", t_start: 5, t_end: 5.4 },
    { id: "2", text: "after", t_start: 8, t_end: 8.4 },
  ];
  const result = shiftCaptionsAfterEdit(words, 5, 0, 2.5);
  assert.deepStrictEqual(result, [
    { id: "1", text: "at-point", t_start: 7.5, t_end: 7.9 },
    { id: "2", text: "after", t_start: 10.5, t_end: 10.9 },
  ]);
});

test("shiftCaptionsAfterEdit: returns a new array, does not mutate the input", () => {
  const words = [{ id: "1", text: "a", t_start: 1, t_end: 1.4 }];
  const result = shiftCaptionsAfterEdit(words, 5, 0, 2.5);
  assert.notStrictEqual(result, words);
  assert.strictEqual(words[0].t_start, 1);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/js/caption-clip-sync.test.js`
Expected: FAIL — `shiftCaptionsAfterEdit is not a function`

- [ ] **Step 3: Implement `shiftCaptionsAfterEdit()`**

In `static/caption-clip-sync.js`, add inside the IIFE (after `clipRanges`):

```javascript
  // One splice-point edit on the flat caption timeline, covering both delete and insert:
  // delete passes newDuration=0 (removes the range, shifts what follows left by oldDuration);
  // insert passes oldDuration=0 (nothing to remove, shifts what follows right by newDuration).
  function shiftCaptionsAfterEdit(words, editStart, oldDuration, newDuration) {
    const editEnd = editStart + oldDuration;
    const delta = newDuration - oldDuration;
    return words
      .filter((w) => !(w.t_start >= editStart && w.t_start < editEnd))
      .map((w) => {
        if (w.t_start >= editEnd) {
          return { ...w, t_start: w.t_start + delta, t_end: w.t_end + delta };
        }
        return w;
      });
  }
```

Update the exports at the bottom of the file:

```javascript
  const api = { clipRanges, shiftCaptionsAfterEdit };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/js/caption-clip-sync.test.js`
Expected: PASS (all tests from Task 1 and Task 2)

- [ ] **Step 5: Commit**

```bash
git add static/caption-clip-sync.js tests/js/caption-clip-sync.test.js
git commit -m "feat: add shiftCaptionsAfterEdit() for caption/clip sync"
```

---

### Task 3: `caption-clip-sync.js` — `resyncCaptionsAfterReorder()`

**Files:**
- Modify: `static/caption-clip-sync.js`
- Modify: `tests/js/caption-clip-sync.test.js`

**Interfaces:**
- Consumes: `clipRanges()` output shape from Task 1 (`{id, start, end}[]`) as its `oldRanges`/`newRanges` parameters.
- Produces: `window.CaptionClipSync.resyncCaptionsAfterReorder(words: CaptionWord[], oldRanges: {id,start,end}[], newRanges: {id,start,end}[]) -> CaptionWord[]` — a new array. For each word, finds the owning range in `oldRanges` by `t_start` containment (`start <= t_start < end`), looks up that same clip id in `newRanges`, and shifts the word by `newRange.start - oldRange.start`. A word with no owning range in `oldRanges` (or whose clip id is missing from `newRanges`) passes through unchanged.

- [ ] **Step 1: Write the failing tests**

Update the `require` line in `tests/js/caption-clip-sync.test.js`:

```javascript
const { clipRanges, shiftCaptionsAfterEdit, resyncCaptionsAfterReorder } = require("../../static/caption-clip-sync.js");
```

Append:

```javascript
test("resyncCaptionsAfterReorder: shifts each word by its owning clip's own delta", () => {
  // Old order: A(0-5), B(5-8), C(8-10). New order after moving C to the front: C(0-2), A(2-7), B(7-10).
  const oldRanges = [
    { id: "a", start: 0, end: 5 },
    { id: "b", start: 5, end: 8 },
    { id: "c", start: 8, end: 10 },
  ];
  const newRanges = [
    { id: "c", start: 0, end: 2 },
    { id: "a", start: 2, end: 7 },
    { id: "b", start: 7, end: 10 },
  ];
  const words = [
    { id: "1", text: "in-a", t_start: 1, t_end: 1.4 },
    { id: "2", text: "in-b", t_start: 6, t_end: 6.4 },
    { id: "3", text: "in-c", t_start: 9, t_end: 9.4 },
  ];
  const result = resyncCaptionsAfterReorder(words, oldRanges, newRanges);
  assert.deepStrictEqual(result, [
    { id: "1", text: "in-a", t_start: 3, t_end: 3.4 },     // A moved 0 -> 2, delta +2
    { id: "2", text: "in-b", t_start: 8, t_end: 8.4 },     // B moved 5 -> 7, delta +2
    { id: "3", text: "in-c", t_start: 1, t_end: 1.4 },     // C moved 8 -> 0, delta -8
  ]);
});

test("resyncCaptionsAfterReorder: a word exactly on a clip boundary resolves to the later clip", () => {
  const oldRanges = [
    { id: "a", start: 0, end: 5 },
    { id: "b", start: 5, end: 8 },
  ];
  const newRanges = [
    { id: "b", start: 0, end: 3 },
    { id: "a", start: 3, end: 8 },
  ];
  const words = [{ id: "1", text: "boundary", t_start: 5, t_end: 5.4 }];
  // t_start=5 belongs to B (half-open [5,8)), which moved 5 -> 0, delta -5.
  const result = resyncCaptionsAfterReorder(words, oldRanges, newRanges);
  assert.deepStrictEqual(result, [{ id: "1", text: "boundary", t_start: 0, t_end: 0.4 }]);
});

test("resyncCaptionsAfterReorder: a word outside every old range is left unchanged", () => {
  const oldRanges = [{ id: "a", start: 0, end: 5 }];
  const newRanges = [{ id: "a", start: 0, end: 5 }];
  const words = [{ id: "1", text: "past-end", t_start: 9, t_end: 9.4 }];
  const result = resyncCaptionsAfterReorder(words, oldRanges, newRanges);
  assert.deepStrictEqual(result, [{ id: "1", text: "past-end", t_start: 9, t_end: 9.4 }]);
});

test("resyncCaptionsAfterReorder: returns a new array, does not mutate the input", () => {
  const oldRanges = [{ id: "a", start: 0, end: 5 }];
  const newRanges = [{ id: "a", start: 2, end: 7 }];
  const words = [{ id: "1", text: "a", t_start: 1, t_end: 1.4 }];
  const result = resyncCaptionsAfterReorder(words, oldRanges, newRanges);
  assert.notStrictEqual(result, words);
  assert.strictEqual(words[0].t_start, 1);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/js/caption-clip-sync.test.js`
Expected: FAIL — `resyncCaptionsAfterReorder is not a function`

- [ ] **Step 3: Implement `resyncCaptionsAfterReorder()`**

In `static/caption-clip-sync.js`, add inside the IIFE (after `shiftCaptionsAfterEdit`):

```javascript
  function findOwningRange(ranges, t) {
    return ranges.find((r) => t >= r.start && t < r.end) || null;
  }

  // Drag-reorder is a non-monotonic permutation (unlike delete/insert's single splice point):
  // each word is shifted by its own owning clip's start delta, found by matching clip id between
  // the pre- and post-reorder clipRanges() snapshots.
  function resyncCaptionsAfterReorder(words, oldRanges, newRanges) {
    const newById = new Map(newRanges.map((r) => [r.id, r]));
    return words.map((w) => {
      const oldRange = findOwningRange(oldRanges, w.t_start);
      if (!oldRange) return w;
      const newRange = newById.get(oldRange.id);
      if (!newRange) return w;
      const delta = newRange.start - oldRange.start;
      if (delta === 0) return w;
      return { ...w, t_start: w.t_start + delta, t_end: w.t_end + delta };
    });
  }
```

Update the exports at the bottom of the file:

```javascript
  const api = { clipRanges, shiftCaptionsAfterEdit, resyncCaptionsAfterReorder };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/js/caption-clip-sync.test.js`
Expected: PASS (all tests from Tasks 1–3)

- [ ] **Step 5: Update the codebase map**

In `CLAUDE.md`, in the `static/` file-structure tree, insert a new line after line 54 (the `clip-sequence.js` entry):

```
  caption-clip-sync.js  # window.CaptionClipSync.{clipRanges, shiftCaptionsAfterEdit, resyncCaptionsAfterReorder} (added 2026-07-30, caption/clip sync): pure helpers keeping caption words aligned with the MAIN clip they overlap in time — clipRanges(clips) mirrors app/timeline.py's clip_starts walk; shiftCaptionsAfterEdit(words, editStart, oldDuration, newDuration) handles a delete or insert as one splice point (delete: newDuration=0, insert: oldDuration=0); resyncCaptionsAfterReorder(words, oldRanges, newRanges) shifts each word by its owning clip's own start delta, for drag-reorder's non-monotonic permutation. No new persisted fields — the clip/caption relationship is always recomputed from timestamps, never stored. Consumed by panel-video.js's deleteClip()/moveClipTo() and clip-sequence.js's insertClipIntoSequence()
```

- [ ] **Step 6: Commit**

```bash
git add static/caption-clip-sync.js tests/js/caption-clip-sync.test.js CLAUDE.md
git commit -m "feat: add resyncCaptionsAfterReorder() for caption/clip sync"
```

---

### Task 4: Wire caption sync into `deleteClip()`

**Files:**
- Modify: `static/panel-video.js:121-149` (`deleteClip` function)

**Interfaces:**
- Consumes: `window.CaptionClipSync.shiftCaptionsAfterEdit(words, editStart, oldDuration, newDuration)` (Task 2).

- [ ] **Step 1: Update `deleteClip()`**

In `static/panel-video.js`, replace the `deleteClip` function (lines 121–149):

```javascript
  // Removes a clip from the sequence: shifts project.captions.words to close the gap the deleted
  // clip's range leaves (removing any words that fell inside it), renumbers the remaining clips'
  // `order` so no gaps appear, drops its clipDurations cache entry, clears selection back to a
  // neutral panel, and if the playhead was inside the deleted clip's timeline range, seeks it to
  // that clip's former start (clamped to the shorter post-delete sequence duration).
  async function deleteClip(clipId) {
    const c = project.clips.find((x) => x.id === clipId);
    if (!c) return;

    const ordered = [...project.clips].sort((a, b) => a.order - b.order);
    let start = 0;
    for (const clip of ordered) {
      if (clip.id === c.id) break;
      start += (clip.out_point - clip.in_point) / (clip.speed || 1);
    }
    const duration = (c.out_point - c.in_point) / (c.speed || 1);
    const wasInside = (() => {
      const t = parseFloat(document.getElementById("time").textContent) || 0;
      return t >= start && t < start + duration;
    })();

    if (project.captions) {
      project.captions.words = CaptionClipSync.shiftCaptionsAfterEdit(project.captions.words, start, duration, 0);
    }

    project.clips = project.clips.filter((x) => x.id !== clipId);
    project.clips.sort((a, b) => a.order - b.order).forEach((x, i) => { x.order = i; });
    delete clipDurations[clipId];

    await saveProject();
    Preview.load(project);
    MediaPanel.render();
    openFilesPanel();

    if (wasInside) {
      const newTotal = Preview.sequenceDuration(project.clips);
      Preview.seek(newTotal > 0 ? Math.min(start, Math.max(0, newTotal - 0.001)) : 0);
    }
  }
```

(This factors the duplicated `(c.out_point - c.in_point) / (c.speed || 1)` expression into a `duration` variable, reused by both `wasInside` and the new caption-sync call.)

- [ ] **Step 2: Manually verify**

Start the dev server: `.venv/Scripts/python -m uvicorn app.main:app --reload`, open `http://127.0.0.1:8000`. Per project convention, verify on a throwaway project (never real project data) — create a new project via the picker.

1. Import 2 short video clips with audio, append both to the VIDEO sequence.
2. Run auto-caption (AUDIO panel's Auto tab) so `project.captions.words` is populated across both clips.
3. Note which caption words fall on the second clip (check the CAPTIONS timeline row / stage captions).
4. Select the first clip, open its VIDEO panel, click Delete.
5. Confirm: captions that were on the first clip are gone; captions that were on the second clip are now shifted earlier and still readable/in-sync with the remaining (now only) clip's content on the stage.

- [ ] **Step 3: Commit**

```bash
git add static/panel-video.js
git commit -m "feat: shift captions when a clip is deleted"
```

---

### Task 5: Wire caption sync into `insertClipIntoSequence()`

**Files:**
- Modify: `static/clip-sequence.js:14-68` (`insertClipIntoSequence` function)

**Interfaces:**
- Consumes: `window.CaptionClipSync.shiftCaptionsAfterEdit(words, editStart, oldDuration, newDuration)` (Task 2).

- [ ] **Step 1: Update `insertClipIntoSequence()`**

In `static/clip-sequence.js`, in the `insertClipIntoSequence` function, replace the final two lines (currently):

```javascript
  project.clips.push(newClip);
  return newClip;
}
```

with:

```javascript
  project.clips.push(newClip);

  const insertedDuration = (newClip.out_point - newClip.in_point) / (newClip.speed || 1);
  if (project.captions) {
    project.captions.words = CaptionClipSync.shiftCaptionsAfterEdit(project.captions.words, dropTime, 0, insertedDuration);
  }

  return newClip;
}
```

Also update the function's header comment (currently lines 9–13) to mention caption sync:

```javascript
// Inserts a new main-sequence ClipLayer at `dropTime` from any source carrying
// media_id/file_path/in_point/out_point (a video box or a media-library drag): if the
// drop point lands inside an existing clip, that clip splits into two (same media, trimmed
// halves) with the new clip inserted between them; otherwise it inserts at the nearest clip
// boundary. Shifts any project.captions.words at/after dropTime later by the inserted clip's
// duration, so existing captions stay aligned with the clips they were on (see
// caption-clip-sync.js). Mutates project.clips in place; returns the new clip.
```

- [ ] **Step 2: Manually verify**

Using the same throwaway project from Task 4 (or a fresh one):

1. Import 2 video clips, append both to the sequence, run auto-caption.
2. Import a third clip into the media library (don't add it to the sequence yet).
3. Drag the third clip from the FILES panel onto the middle of the VIDEO row's second clip, splitting it and inserting the new clip there.
4. Confirm: captions that were before the drop point are unchanged; captions that were after the drop point (in the second half of the split clip) are now shifted later by the inserted clip's duration and still line up with their original clip content on the stage.

- [ ] **Step 3: Commit**

```bash
git add static/clip-sequence.js
git commit -m "feat: shift captions when a clip is inserted mid-sequence"
```

---

### Task 6: Wire caption sync into `moveClipTo()`

**Files:**
- Modify: `static/panel-video.js:162-173` (`moveClipTo` function)

**Interfaces:**
- Consumes: `window.CaptionClipSync.clipRanges(clips)` (Task 1) and `window.CaptionClipSync.resyncCaptionsAfterReorder(words, oldRanges, newRanges)` (Task 3).

- [ ] **Step 1: Update `moveClipTo()`**

In `static/panel-video.js`, replace the `moveClipTo` function (lines 162–173):

```javascript
  // Reindexes project.clips so `clipId` ends up at position `newIndex` (0-based, among clips
  // ordered by `.order`), renumbering every clip's `.order` to 0..n-1 gap-free. `newIndex` is
  // clamped to the valid range. Re-times project.captions.words to follow their clips: each
  // word shifts by its own owning clip's start delta (see caption-clip-sync.js), since a reorder
  // is a non-monotonic permutation, not a single splice point. Shared by the VIDEO panel's
  // move-up/down buttons and the timeline's drag-to-reorder gesture (static/timeline-clip-drag.js).
  async function moveClipTo(clipId, newIndex) {
    const list = [...project.clips].sort((a, b) => a.order - b.order);
    const from = list.findIndex((c) => c.id === clipId);
    if (from === -1) return;
    const clamped = Math.max(0, Math.min(newIndex, list.length - 1));
    const oldRanges = CaptionClipSync.clipRanges(list);
    const [moved] = list.splice(from, 1);
    list.splice(clamped, 0, moved);
    list.forEach((c, i) => { c.order = i; });
    if (project.captions) {
      const newRanges = CaptionClipSync.clipRanges(list);
      project.captions.words = CaptionClipSync.resyncCaptionsAfterReorder(project.captions.words, oldRanges, newRanges);
    }
    await saveProject();
    Preview.load(project);
    renderTimeline();
  }
```

- [ ] **Step 2: Manually verify**

Using the same throwaway project:

1. With 3 clips in the sequence and captions across all of them (from Tasks 4/5's setup, or a fresh 3-clip project with auto-caption run), open the VIDEO panel for the last clip and click the move-up button (or drag its timeline block earlier).
2. Confirm: the captions that were on the moved clip now appear at its new, earlier position on the CAPTIONS timeline row and stage; the captions on the clips it passed over have shifted later to make room; scrubbing through the whole timeline shows every caption still lining up with the correct clip's content.

- [ ] **Step 3: Commit**

```bash
git add static/panel-video.js
git commit -m "feat: re-time captions when a clip is reordered"
```

---

### Task 7: Full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Run the full JS test suite**

Run: `node --test "tests/js/**/*.test.js"`
Expected: PASS, all tests including the new `caption-clip-sync.test.js` file.

- [ ] **Step 2: Run the full Python test suite**

Run: `.venv/Scripts/python -m pytest -q`
Expected: PASS (no backend files were changed, so this confirms no regression).

- [ ] **Step 3: Manual regression check — delete/insert/move with no captions**

On the same throwaway project (or a fresh one with clips but no captions, i.e. `project.captions` is `null`/unset), delete a clip, insert a clip mid-sequence, and reorder a clip. Confirm no console errors — the `if (project.captions)` guards in Tasks 4–6 must no-op cleanly when there's no caption track yet.

- [ ] **Step 4: Confirm the codebase map is current**

Re-read `CLAUDE.md`'s `caption-clip-sync.js` entry (added in Task 3) and confirm it still accurately describes the finished module's three functions and its three call sites — no edits expected if Tasks 4–6 didn't change the module's public API, but check.

- [ ] **Step 5: Commit if anything changed**

```bash
git add -A
git commit -m "chore: verification pass for caption/clip sync"
```

(Skip this commit if Steps 1–4 found nothing to change.)

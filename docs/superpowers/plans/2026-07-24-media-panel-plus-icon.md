# MEDIA Panel Plus Icon Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "+" icon to each MEDIA panel row that adds the item straight onto the project — appending a video clip to the end of the VIDEO timeline sequence, or creating a new IMAGE BOX (PiP overlay) for an image.

**Architecture:** Two tiny plumbing exposures first (expose `panel-image-box.js`'s private `createImageBox` on `window.ImageBoxPanel`; add a new `appendMediaClipToSequence(m)` helper to `clip-sequence.js`), then wire a plus-icon button into `panel-media.js`'s row rendering that calls one or the other based on `m.kind`.

**Tech Stack:** Vanilla JS, no build step, no bundler. No JS test runner exists in this repo (`tests/` is pytest-only, backend). Verification is manual via the app's browser preview.

## Global Constraints

- No new CSS — reuse the existing `.icon-btn.clip-action` class already applied to the rename/trash buttons in the same row (`static/css/components/style-panel.css`).
- No new data model fields — only create instances of the existing `ClipLayer` (via `insertClipIntoSequence`) and `ImageBoxLayer` (via `createImageBox`) shapes.
- Do not modify `static/editor.js`'s `#row-video` drop handler (drag-and-drop) — out of scope, keep the diff scoped to the new button.
- Icon markup follows the project's Lucide-icon convention: `viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"`.
- Verify manually in the browser preview against a **throwaway test project**, never real project data (the app's unload handler flushes in-memory state to disk on every navigation).
- Every edited file's header comment must stay accurate to its new responsibilities (project convention).
- Update the codebase map in `CLAUDE.md` (`static/panel-image-box.js`, `static/clip-sequence.js`, `static/panel-media.js` entries) in the final task's commit, per this repo's "map must stay current" rule.

---

### Task 1: Expose `createImageBox` from the IMAGE BOX panel

**Files:**
- Modify: `static/panel-image-box.js:172` (just before/alongside the existing `window.ImageBoxPanel.render = render;` line)

**Interfaces:**
- Consumes: nothing new — `createImageBox(mediaItem)` already exists as a private function inside this file's IIFE (defined at `static/panel-image-box.js:39`), taking a `MediaItem`-shaped object (`{id, file_path, ...}`) and returning `Promise<ImageBoxLayer>` (the pushed box, already appended to `project.image_boxes`).
- Produces: `window.ImageBoxPanel.createImageBox(mediaItem) -> Promise<box>` for Task 3 to call.

- [ ] **Step 1: Add the export line**

In `static/panel-image-box.js`, find:

```js
  window.ImageBoxPanel.render = render;
})();
```

Replace with:

```js
  window.ImageBoxPanel.render = render;
  window.ImageBoxPanel.createImageBox = createImageBox;
})();
```

- [ ] **Step 2: Update the file's header comment**

Find the header comment at the top of `static/panel-image-box.js` (lines 1-7), specifically this line:

```js
// live in project.image_boxes (see app/models.py's ImageBoxLayer). Mirrors panel-video-box.js;
```

Replace with:

```js
// live in project.image_boxes (see app/models.py's ImageBoxLayer). Mirrors panel-video-box.js;
// createImageBox() is also exposed as window.ImageBoxPanel.createImageBox so the MEDIA panel's
// plus-icon "add to timeline" button (static/panel-media.js) can create a box directly;
```

- [ ] **Step 3: Manual verification**

Start the dev server:

```bash
.venv/Scripts/python -m uvicorn app.main:app --reload
```

Open the app in the browser preview against a throwaway test project that has at least one image imported into its media library. Open the browser console and run:

```js
ImageBoxPanel.createImageBox(project.media_library.find(m => m.kind === "image")).then(box => console.log(box, project.image_boxes.includes(box)))
```

Expected: logs a box object with `id`/`media_id`/`x`/`y`/`width`/`height`/`start`/`duration` fields, and `true` for the `includes` check. (This mutates the in-memory project only — do not call `saveProject()` — so no need to clean it up before continuing to Task 2.)

- [ ] **Step 4: Commit**

```bash
git add static/panel-image-box.js
git commit -m "feat: expose ImageBoxPanel.createImageBox for reuse outside the panel"
```

---

### Task 2: Add `appendMediaClipToSequence` to clip-sequence.js

**Files:**
- Modify: `static/clip-sequence.js` (add new function after `stitchVideoBoxIntoSequence`, before `importMedia`)

**Interfaces:**
- Consumes: `insertClipIntoSequence(source, dropTime)` (existing, `static/clip-sequence.js:13`, returns the new `ClipLayer`); `Preview.sequenceDuration(clips)` (existing, `static/preview.js`); `clipDurations` (existing global object in `static/editor.js:5`); `saveProject()`, `renderTimeline()` (existing globals); `runAutoCaption()` (existing global, `static/panel-captions.js:121`).
- Produces: `appendMediaClipToSequence(m) -> Promise<ClipLayer>` for Task 3 to call, where `m` is a `MediaItem`-shaped object (`{id, file_path, duration, kind, ...}`).

- [ ] **Step 1: Add the function**

In `static/clip-sequence.js`, find:

```js
// Drag-to-stitch: a video box dropped on the VIDEO row becomes a sequence clip and stops
// being a box. Position/size/z_index are dropped (meaningless for a full-frame clip).
function stitchVideoBoxIntoSequence(box, dropTime) {
  insertClipIntoSequence(box, dropTime);
  project.video_boxes = project.video_boxes.filter((v) => v.id !== box.id);
}

async function importMedia() {
```

Replace with:

```js
// Drag-to-stitch: a video box dropped on the VIDEO row becomes a sequence clip and stops
// being a box. Position/size/z_index are dropped (meaningless for a full-frame clip).
function stitchVideoBoxIntoSequence(box, dropTime) {
  insertClipIntoSequence(box, dropTime);
  project.video_boxes = project.video_boxes.filter((v) => v.id !== box.id);
}

// Appends a media-library item as a new clip at the end of the main VIDEO sequence — the drop
// point is always past every existing clip, so insertClipIntoSequence never needs to split.
// Shared by the MEDIA panel's plus-icon "add to timeline" button (static/panel-media.js, video
// rows only; image rows create an IMAGE BOX instead, see panel-image-box.js's createImageBox).
async function appendMediaClipToSequence(m) {
  const dropTime = Preview.sequenceDuration(project.clips);
  const clip = insertClipIntoSequence(
    { media_id: m.id, file_path: m.file_path, in_point: 0, out_point: m.duration },
    dropTime,
  );
  clipDurations[clip.id] = m.duration;
  await saveProject();
  Preview.load(project);
  renderTimeline();
  if (m.kind !== "image") await runAutoCaption();
  return clip;
}

async function importMedia() {
```

- [ ] **Step 2: Update the file's header comment**

Find the header comment at the top of `static/clip-sequence.js` (lines 1-6):

```js
// Sequence-mutation helpers for the main VIDEO clip track: inserting a new clip at a drop point
// (splitting an existing clip if needed) and converting a video box into a sequence clip.
// Also imports one or more media files via the native multi-select file picker straight into
// the media library (no timeline insert — the user drags library items onto the timeline
// themselves). Plain globals shared with editor.js's drag/drop wiring; reaches into editor.js's
// `project`/`saveProject` globals.
```

Replace with:

```js
// Sequence-mutation helpers for the main VIDEO clip track: inserting a new clip at a drop point
// (splitting an existing clip if needed), converting a video box into a sequence clip, and
// appending a media-library item straight to the end of the sequence (used by the MEDIA panel's
// plus-icon button, static/panel-media.js). Also imports one or more media files via the native
// multi-select file picker straight into the media library (no timeline insert — the user drags
// library items onto the timeline themselves). Plain globals shared with editor.js's drag/drop
// wiring; reaches into editor.js's `project`/`saveProject` globals.
```

- [ ] **Step 3: Manual verification**

With the dev server still running (from Task 1), reload the throwaway test project in the browser and run in the console:

```js
appendMediaClipToSequence(project.media_library.find(m => m.kind !== "image" && m.kind !== "audio")).then(clip => console.log(clip, project.clips.includes(clip)))
```

Expected: logs a clip object with `id`/`media_id`/`in_point`/`out_point`/`order` fields, `true` for the `includes` check, and the VIDEO row in the timeline strip visibly grows by one block at the end (this call does persist via `saveProject()` — since this is a throwaway project that's fine).

- [ ] **Step 4: Commit**

```bash
git add static/clip-sequence.js
git commit -m "feat: add appendMediaClipToSequence helper for the MEDIA panel plus icon"
```

---

### Task 3: Wire the plus icon into panel-media.js

**Files:**
- Modify: `static/panel-media.js` (`buildRow(m)` function, currently lines 84-173)
- Modify: `CLAUDE.md` (codebase map entries for `panel-media.js`, `clip-sequence.js`, `panel-image-box.js`)

**Interfaces:**
- Consumes: `appendMediaClipToSequence(m)` (Task 2, global function); `ImageBoxPanel.createImageBox(m)` (Task 1, `window.ImageBoxPanel.createImageBox`); `showPanel(type)` and `ImageBoxPanel.render(selectedId)` (existing globals, `static/panel-nav.js:8`, `static/panel-image-box.js`); `saveProject()`, `renderTimeline()` (existing globals).
- Produces: nothing new for later tasks — this is the final user-facing wiring.

- [ ] **Step 1: Add the plus-icon button to `buildRow`**

In `static/panel-media.js`, find:

```js
    const actions = document.createElement("div");
    actions.className = "clip-actions";
    const renameBtn = document.createElement("button");
```

Replace with:

```js
    const actions = document.createElement("div");
    actions.className = "clip-actions";

    const addBtn = document.createElement("button");
    addBtn.type = "button";
    addBtn.className = "icon-btn clip-action";
    addBtn.title = m.kind === "image" ? "Add as image box" : "Add to timeline";
    addBtn.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>';
    addBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      if (m.kind === "image") {
        const box = await ImageBoxPanel.createImageBox(m);
        await saveProject();
        renderTimeline();
        showPanel("image-box");
        ImageBoxPanel.render(box.id);
      } else {
        await appendMediaClipToSequence(m);
      }
    });
    actions.appendChild(addBtn);

    const renameBtn = document.createElement("button");
```

- [ ] **Step 2: Update the file's header comment**

Find the header comment at the top of `static/panel-media.js` (lines 1-10):

```js
// FILES/MEDIA context-panel section: media-library list (thumbnail, name, duration),
// grouped by type (videos, then images, each with a small section label — omitted when that
// group is empty), click-to-select, hover-reveal inline rename (pencil icon) and remove (trash
// icon, disabled with a usage-count chip when the media item is referenced by any ClipLayer).
// Clip rows use UI.listRow()/list-row.css (static/ui-list-row.js) for shared card styling
// (background/border/hover/selected); section-label rows are untouched by it. A "no audio" icon
// is shown for clips with no audio stream (m.has_audio === false) and, for video clips that do
// have a stream, also when its cached waveform peaks are all silent (checkSilentAudio, added
// 2026-07-23 — an audio stream can technically exist but carry no actual sound).
// Exposes window.MediaPanel.render().
```

Replace with:

```js
// FILES/MEDIA context-panel section: media-library list (thumbnail, name, duration),
// grouped by type (videos, then images, each with a small section label — omitted when that
// group is empty), click-to-select, hover-reveal inline rename (pencil icon), remove (trash
// icon, disabled with a usage-count chip when the media item is referenced by any ClipLayer),
// and a plus icon (added 2026-07-24) that adds the item directly: a video row appends a new
// clip to the end of the VIDEO timeline sequence (appendMediaClipToSequence, clip-sequence.js);
// an image row creates a new IMAGE BOX overlay (ImageBoxPanel.createImageBox, panel-image-box.js)
// and opens the IMAGE BOX panel with it selected.
// Clip rows use UI.listRow()/list-row.css (static/ui-list-row.js) for shared card styling
// (background/border/hover/selected); section-label rows are untouched by it. A "no audio" icon
// is shown for clips with no audio stream (m.has_audio === false) and, for video clips that do
// have a stream, also when its cached waveform peaks are all silent (checkSilentAudio, added
// 2026-07-23 — an audio stream can technically exist but carry no actual sound).
// Exposes window.MediaPanel.render().
```

- [ ] **Step 3: Manual verification — video row**

Reload the throwaway test project's editor page in the browser (fresh load, not just console). Hover a VIDEOS row in the FILES panel; confirm three icons now show on hover (plus, pencil, trash) with the plus icon leftmost. Click the plus icon on a video row. Confirm:
- A new block appears at the end of the timeline's VIDEO row.
- No panel switch occurs (FILES panel stays open).
- The MEDIA panel's usage-count chip for that row increments (or appears) since the item is now referenced by one more clip.

- [ ] **Step 4: Manual verification — image row**

Hover an IMAGES row; click its plus icon. Confirm:
- The right-hand panel switches to IMAGE BOX, showing the newly created box selected (fields populated: START 0, DURATION 3, WIDTH 1080, HEIGHT derived from the image's aspect ratio).
- A new lane appears in the timeline's merged overlays row labeled "IMAGE BOX".
- The stage shows the new image box's resize handles.

- [ ] **Step 5: Update the codebase map**

In `CLAUDE.md`, update the three inline file-purpose entries to match the new header comments:

1. In the `File structure` tree, find the `panel-media.js` entry (single-line description starting `panel-media.js          # FILES/MEDIA context-panel section...`) and update it to mention the plus icon, mirroring the new file header from Step 2 above (keep it to one added clause, don't restate the whole header).
2. Similarly update the one-line `clip-sequence.js` entry to mention `appendMediaClipToSequence`.
3. Similarly update the one-line `panel-image-box.js` entry to mention the exposed `createImageBox`.

- [ ] **Step 6: Commit**

```bash
git add static/panel-media.js CLAUDE.md
git commit -m "feat: add plus icon to MEDIA panel rows for one-click add-to-timeline"
```

---

---

### Task 4: Wire the plus icon for AUDIO rows

**Context:** Added after Tasks 1-3 landed, when merging `origin/main` (25 commits ahead) surfaced
an unrelated change already on main — `fix: show audio files in the FILES panel media list`
(commit `a3f4f23`) — that adds an "AUDIO" group to the FILES list alongside VIDEOS/IMAGES.
Tasks 1-3's plus icon only branched on `m.kind === "image"` vs. else (treating "else" as always
video), so after the merge an audio row's plus icon would wrongly call
`appendMediaClipToSequence(m)` and try to insert the audio file as a VIDEO-track `ClipLayer`.
See the spec's "Addendum: audio rows" section
(`docs/superpowers/specs/2026-07-24-media-panel-plus-icon-design.md`) for the decision record:
an audio row's plus icon sets/replaces `Project.music` (same effect as the AUDIO panel's
"ADD MUSIC"/"Replace"), then opens the AUDIO panel.

**Files:**
- Modify: `static/panel-media.js` (the `addBtn` click handler added in Task 3, currently at
  approximately lines 138-155)

**Interfaces:**
- Consumes: `AudioPanel.render()` (existing, `static/panel-audio.js`, already exposed on
  `window.AudioPanel`); `showPanel(type)` (existing global, `static/panel-nav.js`); `saveProject()`,
  `renderTimeline()` (existing globals). `Project.music`'s shape, mirrored from
  `static/panel-audio.js`'s `addMusic()`: `{id: <new uuid>, media_id: <string>, volume: 0.3,
  muted: false}`.
- Produces: nothing new for later tasks — this is the final piece of the feature.

- [ ] **Step 1: Add the audio branch**

In `static/panel-media.js`, find the `addBtn` click handler (added by Task 3):

```js
    addBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      if (m.kind === "image") {
        const box = await ImageBoxPanel.createImageBox(m);
        await saveProject();
        renderTimeline();
        showPanel("image-box");
        ImageBoxPanel.render(box.id);
        // ImageBoxPanel.render()'s ImageBoxPreview.setSelectedImageBox() call alone only updates
        // which box is selected, it doesn't itself trigger a render pass (same gap documented on
        // ImageBoxPreview.setOnActivate in editor.js) — without this, the new box never mounts
        // into #overlay, so it renders invisibly with no resize handles until the next unrelated
        // stage render.
        ImageBoxPreview.render(project.image_boxes, Preview.currentTimelineTime());
      } else {
        await appendMediaClipToSequence(m);
      }
    });
```

Replace with:

```js
    addBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      if (m.kind === "image") {
        const box = await ImageBoxPanel.createImageBox(m);
        await saveProject();
        renderTimeline();
        showPanel("image-box");
        ImageBoxPanel.render(box.id);
        // ImageBoxPanel.render()'s ImageBoxPreview.setSelectedImageBox() call alone only updates
        // which box is selected, it doesn't itself trigger a render pass (same gap documented on
        // ImageBoxPreview.setOnActivate in editor.js) — without this, the new box never mounts
        // into #overlay, so it renders invisibly with no resize handles until the next unrelated
        // stage render.
        ImageBoxPreview.render(project.image_boxes, Preview.currentTimelineTime());
      } else if (m.kind === "audio") {
        // Mirrors static/panel-audio.js's addMusic()/replaceMusic() — one music track only (v1),
        // so this always replaces any existing Project.music rather than erroring or disabling.
        project.music = { id: crypto.randomUUID().replaceAll("-", ""), media_id: m.id, volume: 0.3, muted: false };
        await saveProject();
        renderTimeline();
        showPanel("audio");
        AudioPanel.render();
      } else {
        await appendMediaClipToSequence(m);
      }
    });
```

- [ ] **Step 2: Update the button's title for audio rows**

In the same file, find:

```js
    addBtn.title = m.kind === "image" ? "Add as image box" : "Add to timeline";
```

Replace with:

```js
    addBtn.title = m.kind === "image" ? "Add as image box" : m.kind === "audio" ? "Add audio" : "Add to timeline";
```

- [ ] **Step 3: Update the file's header comment**

Find:

```js
// and a plus icon (added 2026-07-24) that adds the item directly: a video row appends a new
// clip to the end of the VIDEO timeline sequence (appendMediaClipToSequence, clip-sequence.js);
// an image row creates a new IMAGE BOX overlay (ImageBoxPanel.createImageBox, panel-image-box.js)
// and opens the IMAGE BOX panel with it selected.
```

Replace with:

```js
// and a plus icon (added 2026-07-24) that adds the item directly: a video row appends a new
// clip to the end of the VIDEO timeline sequence (appendMediaClipToSequence, clip-sequence.js);
// an image row creates a new IMAGE BOX overlay (ImageBoxPanel.createImageBox, panel-image-box.js)
// and opens the IMAGE BOX panel with it selected; an audio row sets/replaces Project.music with
// that file (mirrors panel-audio.js's addMusic()/replaceMusic(), one music track only) and opens
// the AUDIO panel.
```

- [ ] **Step 4: Manual verification**

Start the dev server if not already running, open the browser preview against a **throwaway test
project** (never the real project — check `GET /api/projects` first), with at least one audio
media item in its library (`kind: "audio"`, pushed the same way `static/panel-audio.js`'s
`importMusicFile()` does — probe a real local audio file via `Api.probeMedia`/`/api/probe`, push
`{id, file_path, duration, has_audio, kind: "audio"}` into `project.media_library`).

Reload the page fresh. Confirm the FILES panel now shows an "AUDIO" section-label row (from
main's `a3f4f23` change) with your test audio row underneath it, hover it, and confirm the plus
icon's title reads "Add audio". Click it. Confirm:
- `project.music` is now set: `{id, media_id: <your test item's id>, volume: 0.3, muted: false}`.
- The right-hand panel switches to AUDIO, showing the file name and a 100%/unmuted detail view (0.3 → 30%).
- Repeat by adding a *second* audio item's plus icon (a different `kind: "audio"` media item) and
  confirm `project.music.media_id` updates to the second item's id (replace behavior, not a second
  track).

Delete the throwaway project when done (`DELETE /api/projects/{id}`).

- [ ] **Step 5: Commit**

```bash
git add static/panel-media.js
git commit -m "feat: plus icon on AUDIO rows sets/replaces Project.music"
```

---

## Self-Review Notes

- **Spec coverage:** Video-append behavior (Task 2 + Task 3 Step 1/3), image-box-creation behavior (Task 1 + Task 3 Step 1/4), reuse of existing helpers (all three tasks lean on `insertClipIntoSequence`/`createImageBox`/`showPanel` rather than duplicating logic), no new CSS (Task 3 reuses `.icon-btn.clip-action`), no new data model (confirmed — no model file touched), manual-verification-only testing strategy (each task's Step 3/4 is a manual check, matching the spec's stated testing approach) — all covered.
- **Placeholder scan:** No TBD/TODO markers; every step has literal code or literal verification commands.
- **Type consistency:** `appendMediaClipToSequence(m)` (Task 2) takes a `MediaItem`-shaped object and is called with `m` in Task 3 — consistent. `ImageBoxPanel.createImageBox(mediaItem)` (Task 1, unchanged signature) is called with `m` in Task 3 — consistent. Both return the created entity (`ClipLayer` / `ImageBoxLayer`), matching how Task 3 uses the return value (`box.id` for `ImageBoxPanel.render`).
- **Task 4 addendum (2026-07-29):** added after merging `origin/main` surfaced a real gap — main's unrelated `a3f4f23` change added an AUDIO group to the FILES list that Tasks 1-3 never accounted for, so an audio row's plus icon would have wrongly tried to insert the file as a VIDEO clip. Task 4 covers this per the spec's "Addendum: audio rows" section. `project.music`'s shape in Task 4 (`{id, media_id, volume: 0.3, muted: false}`) matches `static/panel-audio.js`'s `addMusic()` exactly — verified by reading that file.

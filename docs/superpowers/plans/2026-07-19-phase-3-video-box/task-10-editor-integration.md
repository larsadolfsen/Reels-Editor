### Task 10: editor.js integration, drag-to-stitch, and finishing the branch

**Status:** not started

**Depends on:** Tasks 1–9, all merged. This is the phase's visual-review checkpoint task — by the end of this task the whole feature must be fully wired and demonstrable in the browser, per the roadmap's "no half-wired features" rule.

**Files:**
- Modify: `static/editor.js`
- Modify: `static/timeline.js`

**Interfaces:**
- Consumes: everything produced by Tasks 1–9.
- Produces: a fully working Video Box feature; no new public interfaces (this is the glue layer).

- [ ] **Step 1: Replace the scaffolded panel-open functions with real selection-aware ones**

In `static/editor.js`, replace the stub `openVideoBoxPanel`/`openLayersPanel` added in Task 2 with:

```js
function openVideoBoxPanel() {
  selected = { type: "video-box", item: null };
  showPanel("video-box");
  VideoBoxPanel.render(null);
  renderTimeline();
}

function openLayersPanel() {
  selected = { type: "layers" };
  showPanel("layers");
  LayersPanel.render();
  renderTimeline();
}
```

(These now call the real `VideoBoxPanel`/`LayersPanel` unconditionally instead of the `if (window.X)` guards — by this point in the plan both files exist.)

- [ ] **Step 2: Reset video-box selection/handles when switching away from that panel**

In `static/editor.js`'s `showPanel(type)`, add a second reset line alongside the existing text-block one:

```js
function showPanel(type) {
  if (type !== "text") Preview.setSelectedTextBlock(null, null);
  if (type !== "video-box") VideoBoxPreview.setSelectedVideoBox(null, null);
  document.getElementById("style-panel").hidden = false;
  ["files", "video", "text", "captions", "video-box", "layers", "settings", "export", "projects"].forEach((t) => {
    document.getElementById(`panel-${t}`).hidden = t !== type;
  });
}
```

- [ ] **Step 3: Add the "video-box" case to onTimelineSelect**

In `static/editor.js`'s `onTimelineSelect`, add a new branch (after the existing `"caption"` branch):

```js
  } else if (type === "caption") {
    document.querySelector(".caption-preview-box").textContent = item.map((w) => w.text).join(" ");
    showPanel("captions");
  } else if (type === "video-box") {
    showPanel("video-box");
    VideoBoxPanel.render(item.id);
  }
```

- [ ] **Step 4: Keep video boxes in sync everywhere the text preview refreshes**

In `static/editor.js`, change `renderTextPreview()` to also refresh video boxes, so every existing call site (BOX panel edits, drag/resize end, initial load) stays in sync the same way text already does:

```js
function renderTextPreview() {
  Preview.renderText(project, project.text_presets, Preview.currentTimelineTime());
  VideoBoxPreview.render(project.video_boxes, Preview.currentTimelineTime());
}
```

- [ ] **Step 5: Make VIDEO BOX timeline blocks draggable (source side of drag-to-stitch)**

In `static/timeline.js`'s `render()`, extend the video-box block loop (from Task 7) to mark each block draggable and stash the box's id on `dragstart`:

```js
    const videoBoxTrack = clearTrack("row-videobox");
    for (const v of project.video_boxes || []) {
      const isSel = !!selected && selected.type === "video-box" && selected.item.id === v.id;
      const name = v.file_path.split(/[\\/]/).pop();
      addBlock(videoBoxTrack, v.start * PX_PER_SEC, (videoBoxEnd(v) - v.start) * PX_PER_SEC, name, isSel,
        () => onSelect({ type: "video-box", item: v }));
      const el = videoBoxTrack.lastElementChild;
      el.draggable = true;
      el.addEventListener("dragstart", (e) => e.dataTransfer.setData("text/video-box-id", v.id));
    }
```

- [ ] **Step 6: Add the pure split/insert/renumber helper**

In `static/editor.js`, add this function (near `moveClip`/`addClip`):

```js
// Converts a video box into a main-sequence ClipLayer at `dropTime` (drag-to-stitch): if the
// drop point lands inside an existing clip, that clip splits into two (same media, trimmed
// halves) with the new clip inserted between them; otherwise it inserts at the nearest clip
// boundary. Keeps the box's in_point/out_point; position/size/z_index are dropped (meaningless
// for a full-frame sequence clip). Mutates project.clips/project.video_boxes in place.
function stitchVideoBoxIntoSequence(box, dropTime) {
  const ordered = [...project.clips].sort((a, b) => a.order - b.order);
  let acc = 0;
  let splitClip = null;
  let splitAt = 0;
  let insertOrder = ordered.length; // default: past the end of the sequence

  for (const c of ordered) {
    const d = c.out_point - c.in_point;
    if (dropTime < acc + d) {
      splitClip = c;
      splitAt = c.in_point + (dropTime - acc);
      insertOrder = c.order;
      break;
    }
    acc += d;
  }

  // Dropping essentially at a clip's own start point needs no split — just insert before it.
  if (splitClip && Math.abs(splitAt - splitClip.in_point) < 0.01) {
    insertOrder = splitClip.order;
    for (const c of project.clips) if (c.order >= insertOrder) c.order += 1;
    splitClip = null;
  } else if (splitClip) {
    for (const c of project.clips) if (c.order > splitClip.order) c.order += 2;
    const secondHalf = {
      id: crypto.randomUUID().replaceAll("-", ""),
      media_id: splitClip.media_id,
      file_path: splitClip.file_path,
      in_point: splitAt,
      out_point: splitClip.out_point,
      order: splitClip.order + 2,
    };
    splitClip.out_point = splitAt;
    project.clips.push(secondHalf);
    insertOrder = splitClip.order + 1;
  } else {
    for (const c of project.clips) if (c.order >= insertOrder) c.order += 1;
  }

  project.clips.push({
    id: crypto.randomUUID().replaceAll("-", ""),
    media_id: box.media_id,
    file_path: box.file_path,
    in_point: box.in_point,
    out_point: box.out_point,
    order: insertOrder,
  });

  project.video_boxes = project.video_boxes.filter((v) => v.id !== box.id);
}
```

- [ ] **Step 7: Wire the VIDEO row as a drop target**

In `static/editor.js`, add this once near the other one-time listener registrations at the bottom of the file (alongside the existing `timeline-ruler`/`playhead-grip` listeners):

```js
document.getElementById("row-video").addEventListener("dragover", (e) => e.preventDefault());
document.getElementById("row-video").addEventListener("drop", async (e) => {
  e.preventDefault();
  const boxId = e.dataTransfer.getData("text/video-box-id");
  if (!boxId) return;
  const box = project.video_boxes.find((v) => v.id === boxId);
  if (!box) return;
  const rect = document.getElementById("row-video").getBoundingClientRect();
  const dropTime = Timeline.timeAtX(project.clips, rect, e.clientX);
  stitchVideoBoxIntoSequence(box, dropTime);
  await saveProject();
  Preview.load(project);
  renderTimeline();
  if (selected && selected.type === "video-box" && selected.item && selected.item.id === boxId) {
    openFilesPanel(); // the selected box no longer exists — fall back to a safe default panel
  }
});
```

- [ ] **Step 8: Run the full backend test suite**

Run: `.venv/Scripts/python -m pytest -q`
Expected: PASS (this task is JS-only, but confirms no accidental drift)

- [ ] **Step 9: Manual end-to-end verification**

Start the dev server (`.venv/Scripts/python -m uvicorn app.main:app --reload`), open the browser, and work through the full feature:

1. Import at least one video clip (FILES panel) if the project has none.
2. Open VIDEO BOX in the left rail → "+ ADD VIDEO BOX" → pick the imported clip. Confirm a video box appears top-left, full canvas width, playing muted, and a matching block appears in the timeline's new VIDEO BOX row.
3. Drag the box on stage to move it; drag a resize handle — confirm the aspect ratio stays locked and the box's TRIM/TIME/SIZE & POSITION fields in the panel update to match.
4. Add a text block (TEXT panel) with a heading. Open LAYERS — confirm both the text block and the video box are listed. Drag the video box above the text block in the list; confirm the video box now visually covers the text on stage. Drag it back below; confirm text is visible again.
5. Export the project (EXPORT panel) and open the resulting mp4 — confirm the video box appears at the right position/time/stacking order, matching the preview.
6. Drag the video box's timeline block onto the main VIDEO row, mid-way through an existing clip. Confirm: the original clip is now two clips in the VIDEO row, the video box's clip is inserted between them (playing the box's trimmed content), the VIDEO BOX row's block is gone, and the right-hand panel falls back to FILES without erroring.
7. Confirm no existing feature regressed: text styling, captions placeholder, project switching, export without any video boxes present.

- [ ] **Step 10: Commit**

```bash
git add static/editor.js static/timeline.js
git commit -m "feat: wire Video Box end-to-end (panels, drag-to-stitch, cross-layer preview sync)"
```

- [ ] **Step 11: Run superpowers:finishing-a-development-branch**

Use the `superpowers:finishing-a-development-branch` skill to decide how to integrate this work (merge to `main` and push, open a PR, or other cleanup).

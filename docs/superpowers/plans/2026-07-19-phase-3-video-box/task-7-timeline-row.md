### Task 7: Timeline VIDEO BOX row rendering

**Status:** not started

**Depends on:** Task 1 (merged, for the `VideoBoxLayer` shape) and Task 2 (merged, for the `row-videobox` DOM id). Independent of Tasks 3–6, 8–9.

**Files:**
- Modify: `static/timeline.js`

**Interfaces:**
- Consumes: DOM id `row-videobox` (Task 2), `project.video_boxes` (Task 1).
- Produces: `Timeline.render(...)` now also renders video-box blocks; clicking one calls the existing `onSelect({type: "video-box", item})` callback (same shape as the existing `"text"`/`"caption"`/`"video"` selection types) — consumed by Task 10's `editor.js` `onTimelineSelect`.

- [ ] **Step 1: Add a video-box-end helper mirroring the Python side**

In `static/timeline.js`, add this helper near the top (after `sequenceDuration`), mirroring `app/timeline.py`'s `video_box_end`:

```js
  function videoBoxEnd(v) {
    return v.start + (v.out_point - v.in_point);
  }
```

- [ ] **Step 2: Include video-box ends in totalDuration**

In `totalDuration(project)`, add a loop alongside the existing text-block and caption loops:

```js
  function totalDuration(project) {
    const clips = ordered(project.clips || []);
    let d = sequenceDuration(clips);
    for (const b of project.text_blocks || []) d = Math.max(d, b.end);
    for (const v of project.video_boxes || []) d = Math.max(d, videoBoxEnd(v));
    for (const w of (project.captions || {}).words || []) d = Math.max(d, w.t_end);
    return Math.max(d, 1);
  }
```

- [ ] **Step 3: Render the VIDEO BOX row's blocks**

In `render(project, timelineTime, selected, onSelect)`, add a new block loop after the existing `textTrack` loop and before the `capTrack` loop (matching the row's position between CAPTIONS and VIDEO in the DOM — order of these loops doesn't affect visual row position, which is fixed by the `row-videobox` element's place in `index.html`, but keeping the loop here mirrors the TEXT row's pattern):

```js
    const videoBoxTrack = clearTrack("row-videobox");
    for (const v of project.video_boxes || []) {
      const isSel = !!selected && selected.type === "video-box" && selected.item.id === v.id;
      const name = v.file_path.split(/[\\/]/).pop();
      addBlock(videoBoxTrack, v.start * PX_PER_SEC, (videoBoxEnd(v) - v.start) * PX_PER_SEC, name, isSel,
        () => onSelect({ type: "video-box", item: v }));
    }
```

- [ ] **Step 4: Update the module header comment**

Update `static/timeline.js`'s header comment (lines 1-3) to mention the new row: `// Timeline strip: pure row-position math (mirrors app/timeline.py) + rendering for` / `// toolbar (zoom/time readout)/ruler/playhead/playhead-handle box/TEXT/CAPTIONS/VIDEO BOX/VIDEO/AUDIO` / `// rows into the DOM ids defined in index.html. ...` (keep the rest of the existing comment as-is).

- [ ] **Step 5: Manual verification**

Full click-to-select verification needs Task 10's `onTimelineSelect` wiring for the new `"video-box"` type — for this task alone, start the dev server, open the browser, and confirm in the console that calling `Timeline.render(project, 0, null, () => {})` with a project object containing a `video_boxes: [{id: "x", file_path: "test.mp4", in_point: 0, out_point: 2, start: 1, z_index: 0}]` array renders one block into `#row-videobox` at the expected horizontal position (roughly `1 * 60 = 60px` from the left, per `PX_PER_SEC`).

- [ ] **Step 6: Commit**

```bash
git add static/timeline.js
git commit -m "feat: render video boxes in the timeline strip's VIDEO BOX row"
```

**Next session:** This task is independent and complete on its own. If continuing in the same session, move to Task 8 (`docs/superpowers/plans/2026-07-19-phase-3-video-box/task-8-panel-video-box.md`), which is unrelated/independent. If dispatching separately, this should be subagent-driven with the same prompt shape as the other Batch 2 tasks.

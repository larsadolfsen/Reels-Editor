# Slice Clip (increment 1 of Slice + Timeline Editing) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** The timeline scissors button (`#slice-action`, "coming soon" today) cuts the video clip under the playhead into two clips at that point.

**Scope note:** This is the **Slice** sub-feature of the [Slice + Timeline Editing design](../specs/2026-07-20-slice-timeline-editing-design.md). Zoom and drag-to-reorder (the design's other two sub-features) and the slice-button *disabled* visual state are deliberately NOT in this increment — `slice_clip`'s own boundary/out-of-range guard makes an always-enabled button safe (a click at a boundary or empty timeline is a harmless no-op). They remain on the backlog.

**Architecture:** A pure `slice_clip(clips, t)` in `app/timeline.py` next to `locate()` is the canonical, pytest-covered logic; a JS mirror in a new `static/timeline-slice.js` (one-function-per-file convention) runs at button-click time and mutates `project.clips`. Both halves reference the same `MediaItem` and inherit the source clip's `fill_mode`/`speed`.

**Tech Stack:** Python/Pydantic/pytest (canonical fn), vanilla JS (mirror + wiring), ffmpeg (unaffected — slice just makes two normal clips).

## Global Constraints
- Splitting clip `c` at source-time `s` (from `locate`): the first clip keeps `in_point..s`; the second is a NEW `ClipLayer` (`new_id()`, same `media_id`/`file_path`, `s..out_point`, `order = c.order + 1`, same `fill_mode`/`speed`); every clip with `order > c.order` shifts +1 first.
- No-op (return clips unchanged, id `None`) when `t` is in no clip (`locate` raises `ValueError`) or `s` is within ε = 0.05 (source-seconds) of `c.in_point` or `c.out_point`.
- No data-model change. Slice creates a standard `ClipLayer`; both halves share the `MediaItem`.
- Full backend suite (`.venv/Scripts/python -m pytest -q`) must stay green (191 baseline → 191 + new slice tests).

---

### Task 1: `slice_clip()` in app/timeline.py + pytest

**Files:**
- Modify: `app/timeline.py` (add `slice_clip`, after `locate`)
- Test: `tests/test_timeline.py`

**Interfaces:**
- Produces: `slice_clip(clips: list[ClipLayer], t: float, eps: float = 0.05) -> tuple[list[ClipLayer], str | None]`.

- [ ] **Step 1: Write the failing tests**

Add to `tests/test_timeline.py` (uses the existing `c(i, o, order)` helper: `ClipLayer(media_id=f"m{order}", file_path=f"{order}.mp4", in_point=i, out_point=o, order=order)`):

```python
from app.timeline import slice_clip

def test_slice_mid_clip_splits_into_two():
    clips = [c(0, 4, 0), c(0, 4, 1)]              # two 4s clips
    out, new_id = slice_clip(clips, 1.0)          # t=1.0 -> 1s into clip0 (source 1.0)
    assert new_id is not None and len(out) == 3
    by_order = sorted(out, key=lambda x: x.order)
    assert [x.order for x in by_order] == [0, 1, 2]     # contiguous
    first, second = by_order[0], by_order[1]
    assert (first.in_point, first.out_point) == (0, 1.0)
    assert (second.in_point, second.out_point) == (1.0, 4.0)
    assert second.id == new_id and second.id != first.id
    assert second.media_id == first.media_id           # same source media
    assert by_order[2].order == 2                       # the old clip1 shifted 1 -> 2

def test_slice_at_boundary_is_noop():
    clips = [c(0, 4, 0)]
    out, new_id = slice_clip(clips, 0.0)          # exactly at start
    assert new_id is None and len(out) == 1
    out, new_id = slice_clip(clips, 4.0)          # exactly at end (beyond -> ValueError path)
    assert new_id is None and len(out) == 1

def test_slice_within_epsilon_of_boundary_is_noop():
    clips = [c(0, 4, 0)]
    out, new_id = slice_clip(clips, 0.03)         # < eps from start
    assert new_id is None and len(out) == 1

def test_slice_empty_clips_is_noop():
    out, new_id = slice_clip([], 1.0)
    assert new_id is None and out == []

def test_slice_trimmed_clip_uses_source_time():
    clips = [c(2, 6, 0)]                          # in=2, out=6, timeline duration 4
    out, new_id = slice_clip(clips, 1.0)          # 1s timeline -> source 3.0
    by_order = sorted(out, key=lambda x: x.order)
    assert (by_order[0].in_point, by_order[0].out_point) == (2, 3.0)
    assert (by_order[1].in_point, by_order[1].out_point) == (3.0, 6.0)

def test_slice_carries_fill_mode_and_speed():
    src = ClipLayer(media_id="m0", file_path="a.mp4", in_point=0, out_point=4, order=0, fill_mode="fill", speed=2.0)
    out, new_id = slice_clip([src], 1.0)          # 2x -> 1s timeline maps to source 2.0
    by_order = sorted(out, key=lambda x: x.order)
    assert by_order[0].out_point == 2.0 and by_order[1].in_point == 2.0
    assert all(x.fill_mode == "fill" and x.speed == 2.0 for x in by_order)
```

- [ ] **Step 2: Run to verify they fail**

Run: `.venv/Scripts/python -m pytest tests/test_timeline.py -q` — Expected: FAIL (`slice_clip` not defined).

- [ ] **Step 3: Implement `slice_clip`**

In `app/timeline.py`, after `locate`:

```python
def slice_clip(clips: list[ClipLayer], t: float, eps: float = 0.05) -> tuple[list[ClipLayer], str | None]:
    """Split the clip under timeline-time t into two clips at that point (source-time from locate).
    First clip keeps in_point..s; the second is a new ClipLayer (s..out_point) inserted right after,
    later orders shifted +1. No-op (clips unchanged, None) when t is in no clip or within eps
    (source-seconds) of a boundary. Both halves share media/file/fill_mode/speed."""
    try:
        c, s = locate(clips, t)
    except ValueError:
        return clips, None
    if abs(s - c.in_point) < eps or abs(c.out_point - s) < eps:
        return clips, None
    for other in clips:
        if other.order > c.order:
            other.order += 1
    new_clip = ClipLayer(
        media_id=c.media_id, file_path=c.file_path,
        in_point=s, out_point=c.out_point, order=c.order + 1,
        fill_mode=c.fill_mode, speed=c.speed,
    )
    c.out_point = s
    clips.append(new_clip)
    return clips, new_clip.id
```

- [ ] **Step 4: Run tests**

Run: `.venv/Scripts/python -m pytest tests/test_timeline.py -q` — Expected: PASS.
Run: `.venv/Scripts/python -m pytest -q` — Expected: PASS (191 + 6 new).

- [ ] **Step 5: Commit**

```bash
git add app/timeline.py tests/test_timeline.py
git commit -m "feat: pure slice_clip() splitting a clip at the playhead"
```

---

### Task 2: JS mirror + slice-button wiring

**Files:**
- Create: `static/timeline-slice.js`
- Modify: `static/index.html` (load the new script after `preview.js`; retitle `#slice-action`)
- Modify: `CLAUDE.md` (map: note `slice_clip` in Timeline + the new file)

**Interfaces:**
- Consumes: `Preview.locate(clips, t) -> {clip, src, acc} | null`, `Preview.currentTimelineTime()`, globals `project`/`saveProject`/`renderTimeline`/`Preview.load`.
- Produces: `Timeline.sliceClip(clips, t, eps=0.05) -> { clips, newId }` (pure mirror).

- [ ] **Step 1: Create `static/timeline-slice.js`**

```javascript
// Timeline slice: pure Timeline.sliceClip (JS mirror of app.timeline.slice_clip) + wiring for the
// #slice-action scissors button, which cuts the video clip under the playhead in two. Reaches into
// editor.js's project/saveProject/renderTimeline and Preview globals. Depends on Preview.locate.
window.Timeline = window.Timeline || {};

// Splits the clip under timeline-time t at that point. Mutates `clips` in place; returns { clips, newId }.
// No-op (newId null) when t is in no clip or within eps (source-seconds) of a boundary.
Timeline.sliceClip = function (clips, t, eps = 0.05) {
  const loc = Preview.locate(clips, t);
  if (!loc) return { clips, newId: null };
  const c = loc.clip, s = loc.src;
  if (Math.abs(s - c.in_point) < eps || Math.abs(c.out_point - s) < eps) return { clips, newId: null };
  clips.forEach((o) => { if (o.order > c.order) o.order += 1; });
  const newId = crypto.randomUUID().replaceAll("-", "");
  clips.push({
    id: newId, media_id: c.media_id, file_path: c.file_path,
    in_point: s, out_point: c.out_point, order: c.order + 1,
    fill_mode: c.fill_mode, speed: c.speed,
  });
  c.out_point = s;
  return { clips, newId };
};

document.getElementById("slice-action").addEventListener("click", async () => {
  const { newId } = Timeline.sliceClip(project.clips, Preview.currentTimelineTime());
  if (!newId) return;                 // boundary / empty timeline -> harmless no-op
  await saveProject();
  Preview.load(project);
  renderTimeline();
});
```

- [ ] **Step 2: Load the script + retitle the button in index.html**

In `static/index.html`, add after the `preview.js` `<script>` tag (so `Preview.locate` exists — though it's only called at click time):

```html
    <script src="/static/timeline-slice.js"></script>
```

And change `#slice-action`'s title from "Slice (coming soon)" to "Slice at playhead":

```html
        <span id="slice-action" class="slice-icon-btn" title="Slice at playhead">
```

- [ ] **Step 3: Confirm backend still green + report (controller does live verify)**

No JS test harness. Run `.venv/Scripts/python -m pytest -q` once (expect 191 + 6 = 197 — Task 1's tests; this task adds no Python) and report. Do NOT open a browser — the controller does live verification.

- [ ] **Step 4: Update the map + commit**

In `CLAUDE.md`: under Timeline, note `slice_clip` (backend) + `static/timeline-slice.js` (mirror + `#slice-action` wiring); mention the scissors button now slices.

```bash
git add static/timeline-slice.js static/index.html CLAUDE.md
git commit -m "feat: wire slice-at-playhead scissors button (JS mirror + click handler)"
```

## Controller live-verification checklist (throwaway project)
- [ ] With ≥1 clip and the playhead mid-clip, clicking the scissors splits it into two clips (timeline VIDEO row shows one more block; both play back seamlessly; both independently trimmable).
- [ ] Clicking with the playhead at a clip boundary or on an empty timeline does nothing (no error).
- [ ] Sliced halves survive reload (persisted) and export as a normal sequence.
- [ ] No console errors.

## Deferred to later increments (still on backlog)
- Slice-button *disabled* visual state at boundaries/empty timeline.
- Zoom (−/+ buttons, pxPerSecond, scroll, playhead auto-scroll).
- Drag-to-reorder clip blocks.

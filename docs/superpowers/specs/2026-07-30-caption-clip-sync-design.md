# Caption/clip sync — design

Date: 2026-07-30

## Problem

Captions (`Project.captions.words`, each a `CaptionWord{id, text, t_start, t_end}`) are timed against the overall project timeline, with no link back to any specific MAIN video clip. When a clip is deleted, reordered (drag-and-drop), or a new clip is inserted mid-sequence, `project.clips` changes but `project.captions.words` does not — captions can end up over the wrong clip, or reference video that no longer exists.

## Goal

Captions should "follow" the MAIN video clip they overlap in time:
- Deleting a clip deletes the captions that fell inside its timeline range, and captions after it shift earlier to close the gap.
- Reordering a clip (drag-and-drop) re-times its captions along with it.
- Inserting a new clip mid-sequence (drag-split) shifts captions after the insertion point later, to stay aligned with the clips they belong to.

Scope is captions only — text blocks and video/image box layers are not touched by this feature.

## Grouping basis

A caption word "belongs" to whichever clip's timeline range contains its `t_start`, computed on the fly from the word's timestamp vs. each clip's timeline start/end. No new data field is added to `CaptionWord` or `ClipLayer` — this is pure derived behavior, not a stored relationship. A word whose `t_start` lands exactly on a clip boundary is assigned to the clip that contains it under start-time containment (the same "does this point fall in this clip's range" logic `app/timeline.py`'s `locate()` already uses).

## New module: `static/caption-clip-sync.js`

Pure, dependency-free (like `box-mask.js`/`text-case.js`), unit-testable via `node --test` with no DOM. Exposes `window.CaptionClipSync`:

- **`clipRanges(clips) -> [{id, start, end}]`** — JS mirror of the timeline-start math in `app/timeline.py` (clips sorted by `.order`, each clip's speed-scaled duration `(out_point - in_point) / speed` accumulated into a running start/end). One entry per clip, in timeline order.

- **`shiftCaptionsAfterEdit(words, editStart, oldDuration, newDuration) -> words'`** — a single splice-point operation covering both delete and insert, since both are edits at one point in the flat timeline:
  - Words with `t_start` in `[editStart, editStart + oldDuration)` are removed (only relevant when `oldDuration > 0`, i.e. a delete).
  - Words with `t_start >= editStart + oldDuration` have `t_start`/`t_end` shifted by `delta = newDuration - oldDuration`.
  - Words entirely before `editStart` are untouched.
  - Delete usage: `oldDuration = <deleted clip's duration>, newDuration = 0`.
  - Insert usage: `oldDuration = 0, newDuration = <inserted clip's duration>`.

- **`resyncCaptionsAfterReorder(words, oldRanges, newRanges) -> words'`** — for drag-and-drop reordering, which is a non-monotonic permutation and can't be expressed as one splice point. `oldRanges`/`newRanges` are `clipRanges()` output for the same set of clip ids, captured before and after the reorder. For each word: find the owning clip in `oldRanges` (`t_start` containment), look up that same clip id's entry in `newRanges`, and shift the word by `newRange.start - oldRange.start`. A word that doesn't fall inside any old range (edge case — e.g. a caption manually placed past the end of the clip sequence) is left unchanged.

All three functions return new arrays (no in-place mutation), consistent with the rest of the pure-function modules in this codebase.

## Wiring into existing mutation sites

1. **`static/panel-video.js` `VideoPanel.deleteClip(clipId)`** — already computes the deleted clip's timeline `start` (by summing preceding clips' durations) before removing it. Also compute its duration, and — if `project.captions` is set — call `CaptionClipSync.shiftCaptionsAfterEdit(project.captions.words, start, duration, 0)` and assign the result back to `project.captions.words`, before the clip is spliced out of `project.clips`.

2. **`static/clip-sequence.js` `insertClipIntoSequence(source, dropTime)`** — after determining the drop time and the inserted clip's duration, and if `project.captions` is set, call `CaptionClipSync.shiftCaptionsAfterEdit(project.captions.words, dropTime, 0, insertedDuration)` and assign back. This single call point covers both direct FILES-panel drag-inserts and the video-box-to-timeline stitch path (`stitchVideoBoxIntoSequence`), since both funnel through `insertClipIntoSequence`.

3. **`static/panel-video.js` `VideoPanel.moveClipTo(clipId, newIndex)`** — capture `CaptionClipSync.clipRanges(project.clips)` before splicing/renumbering `.order`, perform the reorder as today, capture `clipRanges(project.clips)` again after, then — if `project.captions` is set — call `CaptionClipSync.resyncCaptionsAfterReorder(project.captions.words, oldRanges, newRanges)` and assign back.

Each site is a small, local change: capture old state, run the existing mutation, call the sync helper, save. No changes to `app/models.py`, `app/timeline.py`, or any backend route — this stays a frontend-only concern, matching how clip delete/move/insert already work today (mutate in-memory `project`, then generic `saveProject()` → `PUT /api/projects/{id}`).

## Out of scope

- Text blocks (`TextBlockLayer`) and video/image boxes (`VideoBoxLayer`/`ImageBoxLayer`) are untouched by this feature — their timing stays independent of clip mutations, same as today.
- No new persisted data (`CaptionWord` gets no `clip_id` field) — the clip/caption relationship is always recomputed from timestamps.
- Appending a clip at the end of the sequence (`appendMediaClipToSequence`) needs no caption shift — nothing after it exists to shift.
- Backend `/auto-slice/apply` already has its own independent caption-shift logic (`app/auto_slice.py`'s `_cut_caption_words`) for the silence/filler-cut feature — this design does not touch or reuse that backend path, since clip delete/move/insert are frontend-only mutations.

## Testing

`tests/js/caption-clip-sync.test.js` (pure, `node --test`, mirrors the style of other `tests/js/*.test.js` files):
- `clipRanges`: correct start/end for a sequence of clips, including speed-scaled durations.
- `shiftCaptionsAfterEdit` (delete): words fully inside the deleted range are removed; words after shift left by the deleted duration; words before are untouched; deleting the last clip (nothing after) is a no-op beyond removal.
- `shiftCaptionsAfterEdit` (insert): words before the drop point are untouched; words at/after the drop point shift right by the inserted duration.
- `resyncCaptionsAfterReorder`: moving a clip earlier/later in the sequence shifts its own caption group by its clip's delta, and shifts other affected clips' caption groups by theirs; a word on a clip boundary resolves to the correct clip; a word outside all ranges is left unchanged.

No backend/Python tests are needed since no backend code changes.

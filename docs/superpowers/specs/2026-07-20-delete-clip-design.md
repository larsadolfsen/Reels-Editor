# Delete Clip — Design

**Status:** brainstormed 2026-07-20, ready to plan. No open questions.

## What / Why

There is currently **no way to remove a clip from the timeline at all**. Add one.

## Design

- VIDEO panel gains a "Delete clip" button (Lucide trash icon, outline/danger styling) below trim/reorder.
- Delete key deletes the selected clip when `selected.type === "clip"` and focus is not in an input/contentEditable (same guard as existing shortcuts; shared with the text-block Delete key from the multi-text item).
- Deleting removes the `ClipLayer` from `project.clips`, renumbers `order` on the rest, clears selection, saves, re-renders timeline/preview. The `MediaItem` stays in the library (removal from the library is the separate media-library-management item).
- If the playhead was inside the deleted clip, seek to the deleted clip's former start (clamped to the new duration).

## Data model

None.

## Tasks

1. `deleteClip(clipId)` in `editor.js` (mutation + renumber + seek fix) + VIDEO panel button.
2. Delete-key wiring in the global keyboard handler.

## Testing

Pure JS mutation — manual verification: delete mid-sequence clip → remaining clips close the gap, playback and export match; Delete key works only with a clip selected; library row remains. `pytest -q` green (no backend change).

## Out of scope

- Removing the media-library item (see media-library-management).
- Undo of the delete (covered globally by the undo/redo item).

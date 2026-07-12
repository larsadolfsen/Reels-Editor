# Timeline strip + contextual panel — design

**Status:** approved for planning
**Supersedes/amends:** `docs/superpowers/plans/2026-07-09-first-reel.md` Task 7 — split into 7a (this) and 7b (original style-panel scope, unchanged, done after this).

## Goal

Add the multi-track timeline strip from the north-star mockup
(`docs/superpowers/specs/assets/2026-07-10-design-foundation-mockup.html:416-500`) below the stage: a
ruler with playhead, a VIDEO row, a TEXT row, and a CAPTIONS row. Clicking a block in any row opens a
right-side contextual panel showing that item's existing fields.

**This is UI-only.** No new backend routes, no new data-creation capability. Every field shown already
exists on the `Project` model (`app/models.py`); this task only surfaces it and relocates the existing
trim controls into the new panel.

## What existing code this reuses

- `app/timeline.py`: `ordered`, `clip_duration`, `sequence_duration`, `locate` — already mirrored once in
  `static/preview.js`; the timeline strip's video-row math and playhead-seek math reuse that same mirrored
  logic (no third copy — `timeline.js` imports the row-position formulas, `preview.js` keeps owning
  playback).
- `static/editor.js`: `clampTrim`, the trim `applyTrim` logic, `moveClip` — relocated into
  `context-panel.js`, not rewritten.
- `models.TextBlockLayer` (`heading`, `subheading`, `start`, `end`, `preset_id`) and `models.CaptionTrack`
  / `CaptionWord` (`text`, `t_start`, `t_end`) — already defined, just unused by any UI until now.

## Seed data

Per the project's "show real sample data" rule: today `text_blocks` and `captions` are always empty on
every project, so the TEXT/CAPTIONS rows would render blank. `static/seed.js` exports a pure
`seedDefaults(project) -> project` that, only when the respective list is empty, adds:

- One `TextBlockLayer`: `heading: "HOOK"`, `subheading: ""`, `preset_id: "seed"` (placeholder — no
  `TextPreset` is created or saved; nothing reads this id today), `start: 0`, `end: 2`.
- One `CaptionTrack` with 6 `CaptionWord`s spanning ~0–4s (e.g. "okay so nobody talks about this"), timed
  so `groupWords` (below) splits them into two ~4/2-word blocks, matching the mockup's row look.

`editor.js` calls `seedDefaults(project)` once after `ensureProject()`, then `saveProject()` if it changed
anything (id sets are shallow-compared by list length). This is seed data, not a feature: there is still no
UI to create a second text block or re-run transcription.

## Components

### `static/timeline.js` — pure math + row rendering

Mirrors `app/timeline.py`'s row-position math (duration → pixel offset/width) the same way `preview.js`
already mirrors `locate`. Exposes:

- `Timeline.render(project, timelineTime, onSelect)` — draws the ruler (tick every second, label every
  5s), the playhead (`left = timelineTime / sequenceDuration * trackWidth`), and the three rows into
  `#timeline-strip`. Each block gets a click handler calling `onSelect({type, item})`.
- `groupWords(words, max=4)` — pure, chunks a flat `CaptionWord[]` into line-groups for the CAPTIONS row
  (JS preview of the function Task 12 adds server-side in `app/ass_render.py`; no server change here).
- Dragging the ruler/playhead calls the same seek path `preview.js` already exposes (`player.currentTime =
  ...`), so scrubbing works without new playback logic.

### `static/context-panel.js` — right-side panel

- `ContextPanel.show({type, item})` — swaps `#context-panel`'s content:
  - `type: "video"` → file path (read-only) + in/out numeric fields + "Set in/out from playhead" buttons
    (the exact controls removed from `editor.js`'s per-row clip list).
  - `type: "text"` → heading, subheading, start, end fields (start/end editing is new *plumbing* reuse of
    existing model fields, not a new capability — the fields already exist and are already sent on every
    `PUT`).
  - `type: "caption"` → the group's text, read-only, plus its time range. No per-word editing (that's Task
    11).
- `ContextPanel.hide()` — called when nothing is selected (initial state, or clicking empty timeline space).

### `editor.js` changes

- Remove per-row trim inputs from `renderClipList` (list becomes: filename + ▲▼ reorder only).
- Add `selected = null` state; clicking a block sets it and calls `ContextPanel.show`; edits inside the
  panel mutate `project` in place, call `saveProject()`, and re-render `Timeline` + `Preview` as needed.
- Call `seedDefaults` once at startup (see above).

### `index.html` / CSS

- New `#timeline-strip` section under `#stage-wrap`, full content width (mockup's CENTER column).
- New `#context-panel` aside, right of the stage (mockup's RIGHT column) — hidden (`display:none`) until a
  block is selected.
- `static/css/components/timeline.css` (ruler, rows, blocks, playhead) and
  `static/css/components/context-panel.css`, following the existing one-file-per-component convention.

## Data flow

```
project (client state, same object editor.js already holds)
  -> seedDefaults(project)          [once, on load, only if empty]
  -> Timeline.render(project, t)    [every playback tick + every edit]
       click block -> onSelect({type, item})
                         -> ContextPanel.show({type, item})
                              edit field -> mutate project -> saveProject() (PUT, existing route)
                                         -> Timeline.render() again (block moved/relabeled)
```

No new HTTP calls. No schema changes.

## Testing

Stated untested layer, per existing project convention ("UI JS is a stated untested layer: keep it thin,
verify manually"). `groupWords` and the row-position math in `timeline.js` are pure functions and *could*
be unit tested, but this project has no JS test runner configured yet — introducing one is out of scope for
a UI-only task. Verification is manual: run the server, load the editor, confirm ruler/playhead/rows render
with seeded + real clip data, confirm clicking each row type opens the correct contextual panel fields,
confirm trim edits from the panel still work exactly as before (same underlying logic, new location).

## Out of scope (explicitly deferred)

- Drag-resize/reorder of blocks directly on the timeline (existing number-input trim and ▲▼ reorder still
  own this).
- Real caption data / transcription (Task 10/11) — the seeded caption line is placeholder display data only.
- Text style controls (font, color, position) — original Task 7 (now 7b), unchanged, comes after this.
- Burning the seeded text block into export (Task 9) — export path (`app/main.py` `export_project`) is
  untouched by this task.

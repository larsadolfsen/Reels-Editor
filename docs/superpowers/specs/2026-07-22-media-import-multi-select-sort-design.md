# Media import: multi-select + sort by type

Date: 2026-07-22

## Problem

Importing media currently opens a single-file native picker (`pick_file`) that
also immediately drops the imported clip onto the timeline sequence. Users
want to (a) select multiple video/image files in one dialog, and (b) see the
MEDIA panel list grouped by type (videos, then images) rather than in raw
import order.

## Scope

- Native file picker becomes multi-select.
- Imported files land in the media library only — not auto-appended to the
  VIDEO timeline sequence (existing single-click-import behavior of also
  inserting a `ClipLayer` is dropped; users drag from the MEDIA panel onto the
  timeline as they already can for any library item).
- MEDIA panel list groups videos before images, each group preceded by a
  small label (`VIDEOS` / `IMAGES`), omitted if that group is empty.
- No `MediaItem`/`Project` schema changes — `MediaItem.kind` already exists
  and already distinguishes `"video"` from `"image"`.

## Design

### Backend

- `app/media.py`: rename `pick_file()` → `pick_files() -> list[str]`, switch
  `filedialog.askopenfilename` to `filedialog.askopenfilenames` (same
  filetypes filter, dialog title updated to "Import Media"). Returns an empty
  list if the user cancels (rather than `None`).
- `app/main.py`: route `GET /api/pick-file` → `GET /api/pick-files`, response
  `{"paths": list[str]}`.

### Frontend API

- `static/api-pick-file.js` → `static/api-pick-files.js`:
  `Api.pickFiles() -> Promise<string[]>`, `GET /api/pick-files`.
- `static/index.html` script tag updated to the renamed file.

### Import flow

- `static/clip-sequence.js`: `addClip()` → `importMedia()`.
  - Calls `Api.pickFiles()`; no-ops if the result is empty.
  - For each path, sequentially: `Api.probeMedia(path)` → skip with no crash
    if probe fails for that one file (others still import) → push a
    `MediaItem` (`id`, `file_path`, `duration`, `has_audio`, `kind`) onto
    `project.media_library`.
  - No `ClipLayer` is created for any imported file (removes the previous
    "also insert into `project.clips`" behavior).
  - After the loop: one `saveProject()` call, one `MediaPanel.render()` call.
  - `#add-clip` button label changes from "IMPORT VIDEO" to "IMPORT MEDIA"
    (`static/index.html`); listener rewired to `importMedia`.

### MEDIA panel grouping

- `static/panel-media.js`: `render()` partitions `project.media_library` into
  `videos = media_library.filter(m => m.kind !== "image")` (treats missing/
  legacy `kind` as video, matching the existing default) and
  `images = media_library.filter(m => m.kind === "image")`. Renders videos'
  rows first, then images' rows, preserving each group's existing relative
  (import) order. A label row (plain text, reusing `.style-group-label`
  styling) is inserted directly above each group, but only when that group
  is non-empty — an empty group renders nothing, including its label.
  Selection/rename/delete/drag-to-timeline behavior per row is unchanged.
- `static/css/components/style-panel.css`: add `.clip-section-label` rule
  mirroring `.style-group-label` (font, size, letter-spacing, muted color),
  scoped for use inside `#clip-list` (an `<ol>`) as a non-interactive,
  non-draggable `<li>`.

## Testing

- No unit-testable surface changes on the Python side beyond the rename
  (`pick_files` still opens a real OS dialog — same untestable status as
  today's `pick_file`; not covered by `tests/test_media.py` today and stays
  that way).
- Frontend has no existing JS test harness in this project (manual
  browser verification is how UI wiring is checked project-wide) — this
  change will be verified manually in the running app: import multiple
  files at once, confirm they land in the media library grouped by type with
  correct labels, and confirm nothing is auto-added to the timeline.

## Out of scope

- Any change to `MediaItem`/`Project` data model.
- Sorting within a type group (alphabetical, by date, etc.) beyond
  preserving import order.
- Changing how items already on the timeline (`ClipLayer`s) are ordered or
  displayed.

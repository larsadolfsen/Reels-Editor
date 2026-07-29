# MEDIA panel plus icon — add item to timeline

## Purpose

Each row in the MEDIA panel's FILES list (`static/panel-media.js`) currently gets onto the
timeline only by drag-and-drop onto the VIDEO row. This adds a one-click "+" icon to each row
as a faster alternative, with kind-specific behavior:

- **Video row** — appends the clip to the end of the main VIDEO sequence.
- **Image row** — creates a new IMAGE BOX (picture-in-picture overlay) containing that image,
  positioned at the playhead-independent default (start 0, full width, 3s duration — same
  default as adding a box from inside the IMAGE BOX panel), and opens the IMAGE BOX panel with
  the new box selected so the user can immediately reposition/resize/retime it.

Rationale: a full-frame image dropped straight onto the VIDEO sequence competes with the
existing image/photo clip feature that's meant for full-screen images; but a plus-icon
shortcut from the FILES list is more naturally read as "put this on top of what's already
there" for images specifically, matching the IMAGE BOX (PiP) feature added earlier this session.

## Reused code

- `insertClipIntoSequence(source, dropTime)` (`static/clip-sequence.js`) — used with
  `dropTime = Preview.sequenceDuration(project.clips)` so the new clip always lands past every
  existing clip (append, never split).
- `createImageBox(mediaItem)` (`static/panel-image-box.js`) — currently private to that file's
  IIFE; exposed as `window.ImageBoxPanel.createImageBox` so the MEDIA panel can call it without
  duplicating the aspect-probe + box-construction logic.
- `showPanel("image-box")` / `ImageBoxPanel.render(box.id)` (`static/panel-nav.js`,
  `static/panel-image-box.js`) — same panel-switch-and-select pattern already used when picking
  a media item from inside the IMAGE BOX panel's own picker.
- `.icon-btn.clip-action` styling (`static/css/components/style-panel.css`) — already applied to
  the rename/trash icons in the same row; the new plus icon reuses it, no new CSS.
- `runAutoCaption()` (`static/panel-captions.js`) — re-transcribes the sequence after a video
  clip is appended, mirroring the existing VIDEO-row drag-and-drop path
  (`static/editor.js`'s `#row-video` drop handler).

## New code

- `appendMediaClipToSequence(m)` — new function in `static/clip-sequence.js` (its documented
  scope is exactly "sequence-mutation helpers for the main VIDEO clip track"). Wraps
  `insertClipIntoSequence` + `clipDurations` cache write + save/reload/re-render + conditional
  auto-caption, so the plus-icon handler in `panel-media.js` stays a one-line call. Not wired
  into the existing drag-and-drop drop handler in `editor.js` — that handler already has working,
  tested-by-use logic and touching it is out of scope for this change.
- A plus icon button (Lucide "plus": two lines forming a cross) added to each row's
  `.clip-actions` group in `static/panel-media.js`, inserted before the existing rename button.
  Click handler branches on `m.kind === "image"`.

## Data model

No changes. No new fields, no new entities — this only creates instances of the existing
`ClipLayer` (via `insertClipIntoSequence`) and `ImageBoxLayer` (via `createImageBox`) shapes.

## Behavior detail

**Video row click:**
1. `appendMediaClipToSequence(m)` — appends at `Preview.sequenceDuration(project.clips)`,
   caches `clipDurations[clip.id] = m.duration`, saves, `Preview.load(project)`,
   `renderTimeline()`, then `runAutoCaption()` (since it's not an image).
2. No panel switch — matches today's drag-and-drop, which doesn't navigate away from FILES either.
3. Can be clicked repeatedly / with existing usage — same as drag-and-drop, no disabling.

**Image row click:**
1. `ImageBoxPanel.createImageBox(m)` — probes the image's aspect ratio, builds the box
   (`start: 0, duration: 3.0, x: 0, y: 0, width: 1080, height: derived`), pushes to
   `project.image_boxes`.
2. `saveProject()`, `renderTimeline()`.
3. `showPanel("image-box"); ImageBoxPanel.render(box.id);` — switches the right panel to
   IMAGE BOX with the new box selected and its resize handles live on stage.

## Error handling

No new failure modes: `insertClipIntoSequence` and `createImageBox` already handle their own
edge cases (empty sequence, aspect-probe failure defaulting to 16:9). No network calls beyond
the existing `saveProject()`/aspect-probe `<img>` load, both already error-tolerant in their
current implementations.

## Testing

No JS test framework exists in this repo (`tests/` is pytest-only, covering `app/*.py`; the
frontend has no build step or test runner). This change is thin UI wiring over already-existing,
already-manually-verified helper functions (`insertClipIntoSequence`, `createImageBox`), so no
new pure logic is introduced that would benefit from a unit test. Verified manually via the
browser preview: add a video clip via plus icon and confirm it appears at the end of the VIDEO
timeline row; add an image via plus icon and confirm a new IMAGE BOX lane appears and the
IMAGE BOX panel opens with it selected.

## Addendum: audio rows (2026-07-29)

While this feature was mid-implementation, `origin/main` gained an unrelated change (`fix: show
audio files in the FILES panel media list`) that adds an "AUDIO" group to the FILES list
alongside VIDEOS/IMAGES — audio media items (`kind === "audio"`) weren't listed there before, so
this feature's original design never considered them. Merging that change in means an audio
row's plus icon needs its own defined behavior instead of silently falling into the video-row
branch (which would wrongly try to insert it as a VIDEO-track `ClipLayer`).

**Decision:** an audio row's plus icon sets/replaces `Project.music` with that file — the same
effect as the AUDIO panel's "ADD MUSIC" / "Replace" buttons (`static/panel-audio.js`'s
`addMusic()`/`replaceMusic()`) — then opens the AUDIO panel. The app supports one music track
only (v1, per `panel-audio.js`'s own header comment), so this always replaces any existing
`Project.music` rather than erroring or being disabled; the audio file doesn't have to be
literal background music (could be a short sound effect used as the one music slot), so the
button's title reads "Add audio" rather than "Add as music" — same underlying mechanism either
way, no new data model.

**Reused code:** `static/panel-audio.js`'s `addMusic()`/`replaceMusic()` logic is duplicated
inline (not extracted into a shared export) because the existing functions both call
`importMusicFile()` first (native file-picker + probe), which the MEDIA-panel case doesn't need
— the media item already exists in `project.media_library`. The new branch is a ~4-line
`project.music = {...}` assignment mirroring exactly what `addMusic()` builds
(`{id: new_id(), media_id: m.id, volume: 0.3, muted: false}`), then `saveProject()`,
`renderTimeline()`, `showPanel("audio")`, `AudioPanel.render()`.

No new data model, no new CSS. Verified manually the same way as the other two branches.

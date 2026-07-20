# Codebase map — TikTok-Reels

Local web editor that assembles 4–6 mp4 clips into one vertical reel with trim, editable karaoke captions, a preset-styled heading block, and picture-in-picture video boxes, exported to 1080×1920 mp4. Multi-project: a full-screen picker at cold start plus an in-editor PROJECTS panel (open/rename/duplicate/delete). See `docs/superpowers/specs/2026-07-09-first-reel-design.md` and `docs/superpowers/plans/2026-07-09-first-reel.md`.

## Run commands

- Tests: `.venv/Scripts/python -m pytest -q`
- Server: `.venv/Scripts/python -m uvicorn app.main:app --reload` (then open http://127.0.0.1:8000)
- Setup: `python -m venv .venv && .venv/Scripts/pip install -e .[dev]`
- Requires `ffmpeg`/`ffprobe` on PATH for clip probing/export (not required for `pytest`, which mocks subprocess calls).

## Conventions

- No JS build step/bundler — icon SVGs are hand-inlined directly in markup. When an icon is needed, use [Lucide](https://lucide.dev) icon paths (copy the `<path>` markup from lucide.dev; keep the existing `viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"` wrapper style already used for play/pause/restart/step/bold/italic/underline icons).
- Reusable JS logic — UI components (`window.UI.*`) and API/service calls (`window.Api.*`) — each live in their own file, one function/component per file; never grouped into a shared `*-components.js`-style catch-all.
- Prefer small units that each own one feature or function over broad shared abstractions — microcomponents on the frontend, small focused modules on the backend (e.g. `media.py`/`timeline.py`/`ass_render.py`/`font_metrics.py`/`ffmpeg_cmd.py` staying separate rather than merging). Default to a new small file rather than extending an existing multi-purpose one.
- Every `static/*.js` and `static/css/**/*.css` file opens with a one- or two-line comment stating that file's purpose/role, so its job is clear without reading the whole file. Keep this comment current when a file's role changes.
- No inline `style="..."` attributes in `static/index.html` or JS-rendered markup — all styling lives in `static/css/**` component files as classes, even for small one-off tweaks.

## File structure

```
app/
  __init__.py       # package marker
  main.py           # FastAPI app wiring only (routes -> modules, static mount)
  models.py         # Pydantic data model (Project, ProjectSummary, MediaItem, ClipLayer, VideoBoxLayer, TextPreset, FormatRun, TextBlockLayer, CaptionWord, CaptionTrack)
  store.py          # project JSON persistence (save/load/list/delete) + global presets.json
  media.py           # ffprobe command building/duration parsing, serves media files
  timeline.py         # pure sequence math (order, durations, timeline time -> clip+source time)
  ass_render.py        # ASS subtitle generation: text-block dialogue (styles + \pos/\fad entrance); captions land in Task 12
  font_metrics.py       # ASS export word-wrap: pure wrap_text() + Pillow/fontTools measurement adapter for the vendored fonts
  ffmpeg_cmd.py         # pure ffmpeg export-command builder: trim/scale/pad/concat + optional ASS burn
  transcribe.py          # faster-whisper wrapper -> CaptionWords (words_from_segments pure, transcribe_file lazy-loads CUDA model)
static/
  index.html         # editor page: no top bar (removed 2026-07-18 — its last two children, `#project-name`/`#topbar-spacer`, were dropped: project name now shows via `document.title` instead, set dynamically in editor.js) + 3-column main (collapsible MEDIA panel, with a `#panel-brand` mark pinned to its bottom | center column: 9:16 stage filling height + timeline strip below it | selection-driven context panel: FILES/VIDEO/TEXT/CAPTIONS/SETTINGS/EXPORT), per the north-star mockup layout; the TEXT context-panel section (`#panel-text`) has five accordions in order FONT/STYLE/BOX/POSITION/TIME (all built on `UI.accordionSection`, `static/ui-accordion-section.js`), each collapsed by default, each wired by its own `static/text-panel-*.js` file except BOX (unchanged, wired in `editor.js`) — no side-panel heading field: the heading is edited directly on the stage (`static/ui-text-interaction.js`, added 2026-07-18). FONT's body holds a "Font Family" settings row (`UI.settingsRow`, `static/ui-settings-row.js`) that opens a full-panel drill-down list of fonts (`UI.subPanelHeader`, `static/ui-sub-panel-header.js`, plus `#panel-text-font`/`#text-font-list` in `text-panel-font-family.js`) plus SIZE/Bold/Italic/Underline/Color/Outline controls (`text-panel-font-style.js`); STYLE holds the saved-style preset library (`text-panel-style.js`, its own `#panel-text-style` drill-down); POSITION holds TEXT ALIGN (`text-panel-align.js`) + absolute HORIZONTAL/VERTICAL pixel fields with a stateless anchor-grid shortcut (`text-panel-position.js`); TIME holds start/end (`text-panel-time.js`); the `#panel-settings` context-panel section (added 2026-07-18) holds the `#theme-toggle` dark/light theme button (moved out of the now-removed `#topbar`, one labeled `.style-row` under an APPEARANCE `.style-group-label`) — its own SETTINGS entry in the left icon rail (`#panel-nav`) opens it; the `#panel-export` context-panel section (added 2026-07-18) holds the relocated `#export` button + `#export-result` output (same ids/wiring, moved out of the now-removed `#topbar`/`#stage-wrap`) — its own EXPORT entry in `#panel-nav` opens it, a pure location/IA change with no new export options. As of 2026-07-20 (projects/video-box/layers work): three more context-panel sections — `#panel-projects` (project list + "+ New Project", `panel-projects.js`), `#panel-video-box` (add-picker + trim/time/position/size fields, `panel-video-box.js`), `#panel-layers` (drag-and-drop z-order list, `panel-layers.js`) — each with its own PROJECTS/VIDEO BOX/LAYERS entry in `#panel-nav`; `#panel-brand` now hosts the `#save-indicator` ("Saving…/Saved", `ui-save-indicator.js`); and a full-screen `#project-picker` overlay (`ui-project-picker.js`) shows at cold start when no valid `localStorage.projectId` exists
  editor.js           # UI state + API calls + DOM wiring (thin); owns the client-side TextPreset stand-in, MEDIA panel collapse state, and selection state driving which context-panel section (VIDEO/TEXT/CAPTIONS) is open; also wires transport step-back/step-forward/restart buttons and global keyboard shortcuts (Left/Right nudge 0.1s, Up toggles play/pause, Down restarts), skipped while focus is in an input/textarea/select; drives a requestAnimationFrame loop (Timeline.tick) while the video is playing so the playhead moves smoothly instead of only updating on the low-frequency timeupdate event; also owns the multi-project flow (cold-start Api.ensureProject -> openProject or showPickerScreen, PROJECTS panel, save indicator) and playhead-grip scrubbing
  preview.js            # 9:16 stage playback + text/caption overlay compositing + timeline seek (thin); transport row is 4 icon buttons (step-back/pause/play/step-forward); #overlay children (text blocks, caption block, video-box <video>s) each set CSS z-index from their model's z_index
  timeline.js            # Timeline strip: toolbar/ruler/playhead/playhead-handle box/TEXT/CAPTIONS/VIDEO BOX/VIDEO/AUDIO rows, pure row-position math; fixed 60 px/sec scale with #timeline-scroll horizontal scrolling
  font-fit.js            # FontFit.wrapText/canvasMeasurer/fitFontSize — BOX FILL auto font sizing (consumed by preview.js)
  video-box-preview.js   # stage preview for video-box (PiP) layers: one <video> per visible box in #overlay, drag/resize wiring, muted always
  panel-projects.js      # PROJECTS context-panel section: project list (open/rename/delete/duplicate) + "+ New Project"
  panel-video-box.js     # VIDEO BOX context-panel section: add-from-media-library picker, trim/time/position/size fields, delete
  panel-layers.js        # LAYERS context-panel section: drag-and-drop reorderable z-order list of text blocks + video boxes
  ui-icon-rail.js         # UI.iconRail: left-panel icon rail nav, single-select
  ui-button.js             # UI.button: generic button variant styling (icon/outline/accent) applied to existing <button> elements
  ui-button-group.js       # UI.buttonGroup: single-select toggle-button row (ex ui-components.js, split per one-function-per-file convention)
  ui-number-field.js       # UI.numberField: labeled number input with unit suffix + custom stepper (ex ui-components.js)
  ui-color-swatch.js       # UI.colorSwatch: small square color-picker swatch with label (ex ui-components.js)
  ui-accordion.js          # UI.accordion: wires an existing header <button> + body <div> collapsible pair (ex ui-components.js)
  ui-accordion-section.js  # UI.accordionSection: builds an accordion header (title + chevron) for a body element, wired via UI.accordion
  ui-divider.js            # UI.divider: plain static 1px separator line
  ui-settings-row.js       # UI.settingsRow: clickable label/value/chevron row that opens a drill-down
  ui-sub-panel-header.js   # UI.subPanelHeader: back-arrow + title header for drill-down sub-panels
  ui-save-indicator.js     # UI.saveIndicator: "Saving…/Saved" dot+label in #panel-brand, setSaving()/setSaved()
  ui-project-list-row.js   # UI.projectListRow: one project row (inline-editable name, meta, optional duplicate/delete) — shared by picker + PROJECTS panel
  ui-project-picker.js     # UI.projectPicker: full-screen cold-start project picker (list + "+ NEW PROJECT")
  ui-resize-handles.js    # generic 8-handle drag-resize overlay for any positioned element (text box + video box)
  ui-text-interaction.js  # click-to-edit (contentEditable) vs drag-to-move vs drag-to-select for a stage text block
  ui-text-selection.js    # UI.textSelectionOffsets/rangeContainsPoint: native selection -> char offsets + glyph hit-test
  ui-video-box-drag.js    # UI.videoBoxDrag: drag-to-move for stage video boxes (no edit mode — any drag is a move)
  api-save-project.js      # Api.saveProject: PUT /api/projects/{id}
  api-create-project.js    # Api.createProject: POST /api/projects
  api-list-projects.js     # Api.listProjects: GET /api/projects -> ProjectSummary[]
  api-delete-project.js    # Api.deleteProject: DELETE /api/projects/{id}
  api-duplicate-project.js # Api.duplicateProject: POST /api/projects/{id}/duplicate
  api-rename-project.js    # Api.renameProject: fetch-patch-PUT a project's name (fresh from disk, not the in-memory copy)
  api-ensure-project.js    # Api.ensureProject: resolve localStorage.projectId -> Project | null (cold-start routing)
  api-export-project.js    # Api.exportProject: POST /api/projects/{id}/export -> {ok, out_path} | error
  api-pick-file.js         # Api.pickFile: GET /api/pick-file (native OS file dialog on the server)
  api-probe-media.js       # Api.probeMedia: GET /api/probe -> {duration, has_audio} | null
  api-list-font-weights.js # Api.listFontWeights(fontName) -> Promise<{value, label}[]>: GET /api/fonts/{name}/weights
  api-list-presets.js     # Api.listPresets: GET /api/presets -> saved TextPreset[]
  api-save-preset.js      # Api.savePreset: POST /api/presets -> saves/updates a saved TextPreset
  text-panel-font-family.js  # TEXT panel FONT accordion: font-family row + drill-down
  text-panel-font-weight.js  # TEXT panel FONT accordion: font-weight settings row + drill-down, replacing the old Bold toggle (added 2026-07-19). Mirrors text-panel-font-family.js's pattern exactly — fetches available weights for the current font via Api.listFontWeights(), click-to-apply (no hover-preview), checkmark on the current selection.
  text-panel-font-style.js   # TEXT panel FONT accordion: size/bold/italic/underline/color/outline; controls are selection-aware as of 2026-07-19 (Phase 5), writing a per-range FormatRun instead of the base preset when Preview.getActiveFormatSelection() is active
  text-panel-align.js        # TEXT panel POSITION accordion: TEXT ALIGN button group
  text-panel-position.js     # TEXT panel POSITION accordion: absolute x/y pixel fields + stateless anchor-grid shortcut
  text-panel-time.js         # TEXT panel TIME accordion: start/end
  text-panel-style.js        # TEXT panel STYLE accordion: saved-style preset library
  caption-panel-style.js     # CAPTIONS panel STYLE accordion: saved-style preset library, targets the caption track's preset via ensureCaptionTrack()/ensureCaptionPreset() instead of a text block's
  caption-panel-font-family.js  # CAPTIONS panel FONT accordion: font-family row + drill-down, same pattern as text-panel-font-family.js but against the caption track's preset
  caption-panel-font-weight.js  # CAPTIONS panel FONT accordion: font-weight row + drill-down, same pattern as text-panel-font-weight.js but against the caption track's preset
  caption-panel-font-style.js   # CAPTIONS panel FONT accordion: size/italic/underline/color/outline, same pattern as text-panel-font-style.js but against the caption track's preset
  caption-panel-box.js          # CAPTIONS panel BOX accordion: size mode/background/border + TEXT ALIGN/POSITION (combines editor.js's renderBoxPanel() with text-panel-align.js/text-panel-position.js), against the caption track's preset
  caption-panel-highlight.js    # CAPTIONS panel HIGHLIGHT accordion: karaoke mode toggle, highlight color, max words per line — captions-only, no TEXT-panel equivalent
  caption-panel-words.js        # CAPTIONS panel "Caption words" drill-down: every transcribed word, inline-editable text (empty text deletes the word), timing shown but not editable
  seed.js                 # seeds a project with a sample caption line on first load so the CAPTIONS timeline row isn't empty (dev convenience; text block seeding removed — editor.js's ensureTextBlock() already creates a real, style-panel-backed one)
  css/
    tokens.css            # :root custom properties (colors, fonts, spacing, radius) + @font-face — single source of truth
    base.css               # reset + element defaults (body, button, input) on the tokens
    layout.css               # app shell: 3-column main (left panel, #center-col, right panel), no top bar (removed 2026-07-18); #center-col is a flex column holding the stage and timeline strip
    components/
      panel.css                # left MEDIA panel: display-only clip rows (thumbnail + name/duration, click-to-select) + .collapsed state (72px icon rail: import button + thumbnails only)
      stage.css                 # 9:16 stage (height-driven via aspect-ratio, fills #stage-wrap's available height, capped to its width) + transport controls + .text-block overlay styling
      timeline.css              # timeline strip: ruler, playhead, row tracks, blocks
      button-group.css           # reusable .btn-group toggle-row + .icon-btn styling (used by ui-button-group.js)
      number-field.css            # custom up/down stepper for number inputs (native OS spin control is unstylable); used by ui-number-field.js
      style-panel.css            # right-hand context panel: closed by default (#style-panel[hidden]), close button, mutually-exclusive sections (#panel-files/#panel-video/#panel-text/#panel-captions/#panel-video-box/#panel-layers/#panel-settings/#panel-export/#panel-projects) toggled via their own `hidden` attribute; mockup-matched (mono-caps section labels, button-group align/position); `#panel-export #export` is styled full-width to sit naturally in the panel
      divider.css                 # .ui-divider: a plain static 1px line, no hover effect; pairs with UI.divider (static/ui-divider.js), added 2026-07-17
      color-swatch.css            # .color-swatch-row/.color-swatch/.color-swatch-label: small square input[type=color] + mixed-case label beside it, one field per row
      resize-handles.css      # .resize-handle-* styling for ui-resize-handles.js
      accordion.css            # .accordion-header/.accordion-body/.accordion-chevron collapsible pair (UI.accordion/UI.accordionSection)
      button.css               # .button/.button-accent/.button-outline/.button-icon shared button variants (UI.button)
      icon-rail.css            # .icon-rail/.icon-rail-btn vertical icon+label nav rail (UI.iconRail)
      settings-row.css         # .settings-row label/value/chevron drill-down row (UI.settingsRow)
      sub-panel.css            # .sub-panel-header back+title + .font-list drill-down list styling (UI.subPanelHeader)
      save-indicator.css       # .save-indicator "Saving…/Saved" dot+label in #panel-brand (UI.saveIndicator)
      layers-panel.css         # .layers-list drag-and-drop z-order rows (panel-layers.js)
      video-box-panel.css      # #panel-video-box internal layout: add-picker list + trim/time/position/size detail view
      project-picker.css       # #project-picker full-screen cold-start picker + .new-project-btn (shared with panel-projects.js)
      project-list-row.css     # .project-list-row name/meta/action-buttons + shared list reset (UI.projectListRow)
      safe-zones.css               # #safe-zones: 4 `.safe-zone-*` guide bands (top nav / right action rail / caption area / bottom nav, percentages matching TikTok's real UI chrome) overlaid on #stage — shaded tint + solid accent edge (not dashed) plus opaque label chips (same recipe as .slice-btn) for legibility over arbitrary video content, toggled via [hidden]; #safe-zones-toggle lives in the timeline toolbar (`#timeline-toolbar`, next to zoom −/+, shield icon), preview-only, persisted in localStorage
  fonts/                # vendored variable woff2 (JetBrainsMono-Regular, PublicSans-Regular, 400-700) + static per-weight .ttf files baked by scripts/generate_font_weights.py (for PIL measurement + libass fontsdir)
scripts/
  generate_font_weights.py  # one-off dev script: bakes the static per-weight .ttf files from the vendored variable fonts
tests/
  test_models.py
  test_store.py
  test_media.py
  test_main.py          # export-route tests: ASS rendered + burned in when text blocks exist, skipped otherwise; also probe/presets
  test_timeline.py
  test_ffmpeg_cmd.py
  test_ass_render.py
  test_font_metrics.py
  test_transcribe.py
  test_transcribe_route.py
  test_export_smoke.py  # Phase 6: whole-pipeline smoke test, every layer type combined
data/               # gitignored: projects/*.json, presets.json, exports/
```

## Inventory

Organized by feature. Each feature names the files that implement it — for a plain file→purpose lookup, see the File structure tree above.

### Data model & persistence

Foundational — every other feature below builds on these.

- `app/models.py` — Pydantic entities: `MediaItem(id, file_path, duration, has_audio)`, `Project`, `ProjectSummary`, `ClipLayer`, `VideoBoxLayer`, `TextPreset`, `FormatRun`, `TextBlockLayer`, `CaptionWord`, `CaptionTrack`, `new_id()`. Field-level detail lives under each owning feature below (media/import for `MediaItem`, project management for `Project`/`ProjectSummary`, timeline/video clips for `ClipLayer`, video boxes for `VideoBoxLayer`, text blocks for `TextPreset`/`FormatRun`/`TextBlockLayer`, captions for `CaptionWord`/`CaptionTrack`).
- `app/store.py` — JSON persistence: `save_project`, `load_project`, `list_projects` (loads every `<data>/projects/*.json`), `delete_project`, `save_preset`, `load_presets`. One JSON file per project under `<data>/projects/`, global presets in `<data>/presets.json`.
- `app/main.py` — FastAPI composition root wiring every route below to its module; static mount at `/static`.

### Media library & import

- `MediaItem(id, file_path, duration)` in `app/models.py` — separates imported media library from timeline clip references. `has_audio: bool = True` (Phase 6, added 2026-07-20: whether ffprobe found an audio stream; defaults `True` so existing saved projects behave unchanged until re-probed) is consumed by the export pipeline (see below) to decide whether a clip needs synthesized silent audio.
- `app/media.py` — `ffprobe_cmd`, `probe_duration`, `has_audio_stream(path) -> bool` (Phase 6, added 2026-07-20: ffprobes via `-select_streams a`, populates `MediaItem.has_audio` at import time and is exposed through `GET /api/probe`), `media_response` (serves a local file via FastAPI, 404s if missing), `pick_file` (native OS file-open dialog, returns the chosen path or `None`). `probe_duration`/`has_audio_stream` (and `run_export`, see export pipeline) resolve `ffprobe`/`ffmpeg` from a freshly-read registry PATH rather than the process's inherited env, so a PATH change takes effect without restarting every ancestor process.
- `app/main.py` — `GET /api/probe` (-> `{duration, has_audio}`), `GET /api/pick-file`, `GET /media`.
- `static/api-pick-file.js` — `Api.pickFile()`: `GET /api/pick-file`.
- `static/api-probe-media.js` — `Api.probeMedia(path)`: `GET /api/probe` -> `{duration, has_audio}` or `null`.
- `static/editor.js` — `addClip()` pushes a `MediaItem` into `project.media_library` alongside the `ClipLayer` (carrying `media_id`) added to `project.clips`. `renderMediaList()` renders `project.media_library` as display-only thumbnail+name+duration rows (`formatClipDuration`, mm:ss.s) into `#clip-list`, click-to-toggle a row's highlight via module-level `selectedMediaId` — purely local state, independent of timeline `selected` and with zero side effects on player/timeline/VIDEO panel. `setPanelCollapsed(bool)` toggles the MEDIA panel's `#panel.collapsed` (72px icon rail) and persists to `localStorage` (`panelCollapsed`).
- `static/css/components/panel.css` — left MEDIA panel: display-only clip rows (thumbnail + name/duration, click-to-select) + `.collapsed` state (72px icon rail: import button + thumbnails only).

### Project management (multi-project)

Full-screen picker at cold start, plus an in-editor PROJECTS panel — open/rename/duplicate/delete, autosave with a save indicator.

- `Project`/`ProjectSummary` in `app/models.py` — `Project` carries `id`/`created_at`/`updated_at`/`name` plus every layer collection (`media_library`, `clips`, `video_boxes`, `text_blocks`, `text_presets`, `captions`); `ProjectSummary(id, name, created_at, updated_at)` is the lightweight `GET /api/projects` list payload — never the full project.
- `app/store.py` — `list_projects`, `delete_project` (see Data model above for the rest).
- `app/main.py` — `POST /api/projects`, `GET/PUT /api/projects/{id}`, `GET /api/projects` (all as `ProjectSummary[]`), `DELETE /api/projects/{pid}` (204), `POST /api/projects/{pid}/duplicate` (new id, name `"<name> copy"`).
- `static/api-create-project.js` / `api-list-projects.js` / `api-delete-project.js` / `api-duplicate-project.js` / `api-rename-project.js` / `api-ensure-project.js` — one `Api.*` function per file: `createProject`, `listProjects` (-> `ProjectSummary[]`), `deleteProject`, `duplicateProject`, `renameProject` (fetches fresh from disk, patches `name`, PUTs back), `ensureProject` (resolves `localStorage.projectId` to a `Project` or `null` — cold-start routing).
- `static/api-save-project.js` — `Api.saveProject(project)`: `PUT /api/projects/{id}`, persists the whole project.
- `static/ui-project-picker.js` — `UI.projectPicker(container, {onOpen})`: full-screen cold-start picker (`#project-picker`); always re-fetches the list via `Api.listProjects()` on mount, "+ NEW PROJECT" creates via `Api.createProject()` then calls `onOpen`.
- `static/ui-project-list-row.js` — `UI.projectListRow(project, {onOpen, onRename, onDelete, onDuplicate}) -> <li>`: one project row (inline-editable name, relative last-edited meta, optional duplicate/delete icon buttons). Shared by the full-screen picker (open-only) and the in-editor PROJECTS panel; callers own persisting any change.
- `static/panel-projects.js` — `ProjectsPanel.render(currentProjectId, callbacks)`: the `#panel-projects` context section — project list (open/rename/delete/duplicate via `Api.*`) + "+ New Project" (`callbacks.onCreateRequested`); never navigates or saves the currently-open project itself.
- `static/ui-save-indicator.js` — `UI.saveIndicator(container) -> {setSaving, setSaved}`: "Saving…/Saved" dot+label mounted in `#panel-brand`.
- `static/editor.js` — startup calls `Api.ensureProject()`: a still-valid saved project id opens directly via `openProject(target)` (fetches, loads, sets `document.title`), otherwise `showPickerScreen()` mounts `UI.projectPicker`. `openProjectsPanel()` renders `ProjectsPanel` with switch/create routed through `confirmFlushAndSwitch(action)` (saves the current project before switching) and `onDeletedCurrent` falling back to `showPickerScreen()`. A `keepalive: true` PUT on page unload flushes the last unsaved state. `saveProject()` wraps `Api.saveProject` with the `#panel-brand` save indicator (`setSaving()`/`setSaved()`).
- `static/css/components/project-picker.css` — `#project-picker` full-screen cold-start picker + `.new-project-btn` (shared with `panel-projects.js`).
- `static/css/components/project-list-row.css` — `.project-list-row` name/meta/action-buttons + shared list reset.

### Timeline

- `app/timeline.py` — `ordered`, `clip_duration`, `sequence_duration`, `locate` (timeline time -> clip + source-time); mirrored in `static/preview.js`.
- `static/timeline.js` — `render(project, timelineTime, selected, onSelect)` (ruler, playhead, clip/text/video-box/caption blocks, toolbar time readout, playhead-handle box position, AUDIO placeholder), `tick(timelineTime)` (cheap playhead/handle-box/time-readout-only update, driven every animation frame during playback so motion stays smooth between heavier `render()` calls), `groupWords(words, max)` (caption word grouping, reused by captions — see below), `timeAtX(clips, rulerRect, clientX)` (coordinate math). Fixed `PX_PER_SEC = 60` scale (not stretched to container width); `#timeline-scroll` provides horizontal scroll when content overflows. Rows top-to-bottom: TEXT, CAPTIONS, VIDEO BOX, VIDEO, AUDIO (static dummy waveform — deterministic pseudo-random bars regenerated only when track width changes, no real audio-track data yet). `#timeline-strip` has a toolbar above the ruler (`#zoom-controls` −/+ buttons — **still unwired/non-functional as of 2026-07-20**; mm:ss.s time readout; safe-zones toggle), and a playhead-handle box (`#slice-btn`) tracking the playhead with a grip-vertical handle (`#playhead-grip`) and a scissors icon (visual only, no slice feature yet). TEXT and CAPTIONS rows share the same 44px height.
- `static/editor.js` — playhead scrubbing: dragging `#playhead-grip` live-scrubs the playhead via `Timeline.timeAtX` -> `Preview.seek`, re-invoked on every mousemove, with `Timeline.tick` keeping the handle box anchored during the drag. Clip placement / drag-to-stitch: FILES-panel media rows are draggable (`dragstart` sets `text/media-id`); the `#row-video` drop handler accepts that plus the video-box drag (`text/video-box-id`, see Video boxes below) — both insert via the shared `insertClipIntoSequence(source, dropTime)` (splits the clip under the drop point into two trimmed halves, or inserts at the nearest boundary; returns the new clip). Clicking a timeline block calls `onTimelineSelect`, opening the matching `#style-panel` context section.
- `static/css/components/timeline.css` — timeline strip: ruler, playhead, row tracks, blocks.

### Video clips (VIDEO panel: trim/order)

- `ClipLayer` in `app/models.py` — `media_id: str` required field linking to `MediaItem` (added 2026-07-15).
- `static/editor.js` — `selectClip(c)`/`renderVideoPanel(c)` populate `#panel-video`'s trim (`UI.numberField`, reusing `clampTrim`) and reorder controls for the selected clip.
- `static/css/components/style-panel.css` — `#panel-video` (TRIM in/out + ORDER move up/down).

### Video boxes (picture-in-picture)

- `VideoBoxLayer` in `app/models.py` — `media_id`/`file_path`, `in_point`/`out_point` source trim, `start` timeline seconds (end always derived as `start + out_point - in_point`), `x`/`y`/`width`/`height` px on the 1080×1920 canvas with height set from source aspect at creation and kept locked on resize, `z_index: int = -1` (defaults just below the default text z_index 0 — see Layers panel).
- `static/video-box-preview.js` — `VideoBoxPreview.render(videoBoxes, timelineTime)` / `VideoBoxPreview.setSelectedVideoBox(id, callbacks)`: mounts one always-muted `<video>` per visible box into `#overlay` (a sibling of preview.js's text/caption divs — each sets an explicit CSS z-index from its model's `z_index`), keeps position/size/`currentTime` in sync with the timeline clock, wires drag-to-move (`UI.videoBoxDrag`) + resize (`UI.resizeHandles`, shared with text blocks) onto the selected box.
- `static/panel-video-box.js` — `VideoBoxPanel.render(selectedId)`: the `#panel-video-box` context section — add-from-media-library picker (`#video-box-picker-list`), trim/time/position/size number fields, delete; one box selected at a time.
- `static/ui-video-box-drag.js` — `UI.videoBoxDrag(div, {onMove, onMoveEnd}) -> destroy()`: click-and-drag-to-move for stage video boxes — no edit-mode distinction (unlike `ui-text-interaction.js`, any drag is always a move).
- `static/editor.js` — `openVideoBoxPanel()` opens `#panel-video-box` (`VideoBoxPanel.render(null)`); opening any non-video-box panel clears the stage selection via `VideoBoxPreview.setSelectedVideoBox(null, null)`. Drag-to-stitch onto the VIDEO row: `stitchVideoBoxIntoSequence(box, dropTime)` is a thin wrapper over the shared `insertClipIntoSequence` (see Timeline above) that inserts then removes the box from `project.video_boxes`.
- Export path: see `app/ffmpeg_cmd.py`'s `bands`/banded-export branch under Export pipeline below.
- `static/css/components/video-box-panel.css` — `#panel-video-box` internal layout: add-picker list + trim/time/position/size detail view.

### Text blocks & rich-text formatting

- `TextPreset` in `app/models.py` — `font` defaults to `"Public Sans"` (2 vendored families); `weight: int = 400` (400/500/600/700, replaced `bold: bool` 2026-07-19, migrated on load); `italic`/`underline: bool = False`; `box_width_mode`/`box_height_mode: str = "fit"` + `box_width`/`box_height: int` (independent per-axis fixed-vs-fit sizing); `box_background`/`box_background_color` (replaces old `box`/`box_color`, migrated on load); `box_border_width`/`box_border_color`/`box_border_radius`; `usage_count: int = 0` (drives STYLE accordion's most-used list — see Saved style presets); `highlight_color`/`highlight_mode`/`max_words_per_line` (shared with captions, see below); `highlight: bool = False` (block-level rich-text default).
- `FormatRun` in `app/models.py` — Phase 5, added 2026-07-19: `start`/`end` character offsets into a `TextBlockLayer.heading` string, plus sparse-optional style overrides (`font`/`size_px`/`color`/`outline_color`/`outline_px`/`weight`/`italic`/`underline`/`highlight`/`highlight_color`), each `None` by default so an unset field falls through to the block's base `TextPreset`.
- `TextBlockLayer` in `app/models.py` — single `heading` line, may contain `\n` for multiline; `formatting_runs: list[FormatRun] = []` (empty list renders/exports identically to pre-Phase-5); `z_index: int = 0` (see Layers panel).
- `static/text-panel-font-family.js` / `text-panel-font-weight.js` / `text-panel-font-style.js` / `text-panel-align.js` / `text-panel-position.js` / `text-panel-time.js` — the TEXT panel's FONT/POSITION/TIME accordion controls, one file per control group: font-family drill-down; font-weight drill-down (`Api.listFontWeights()`, click-to-apply, checkmark on current); SIZE/Italic/Underline/Color/Outline, selection-aware since 2026-07-19 (writes a per-range `FormatRun` instead of the base preset when `Preview.getActiveFormatSelection()` is active); TEXT ALIGN button group; absolute x/y pixel fields + stateless anchor-grid shortcut; start/end.
- `static/editor.js` — `ensureTextPreset(id)`/`ensureTextBlock()` (lazily creates/loads the single `project.text_blocks[0]` and its preset); `renderTextPanel()` (thin orchestrator delegating to each `text-panel-*.js` file plus `renderBoxPanel()`); `renderBoxPanel()` (BOX accordion: width/height SIZE mode FIT/FREE/FILL + background/border fields); `handleBoxResize()`/`handleBoxResizeEnd()`/`handleBoxMove()`/`handleBoxMoveEnd()` (stage resize/move callbacks — position is `TextPreset.x`/`y` absolute pixel coordinates, align-aware horizontal edge, always-top vertical edge, see [2026-07-19-absolute-pixel-coordinates-design.md](docs/superpowers/specs/2026-07-19-absolute-pixel-coordinates-design.md)). No side-panel heading field — the heading is edited by clicking the block directly on the stage.
- `static/preview.js` — `Preview.renderText(project, presets, timelineTime)` composites one `.text-block` div per visible block into `#overlay`. Phase 5 rich-text: splits `block.heading` into one `<span class="text-run">` per `formatting_runs` boundary, each independently resolving style from `(run && run.X) || preset.X`. `maybeRefitFillText(block, preset)` (memoized via `fitCache`) overwrites `preset.size_px` via `window.FontFit` for BOX FILL mode. `Preview.getActiveFormatSelection() -> {blockId, start, end} | null` tracks the current non-collapsed selection for the FONT-accordion files to target. `Preview.setSelectedTextBlock(blockId, callbacks)` mounts `UI.textInteraction`/`UI.resizeHandles` on the selected block.
- `static/ui-text-interaction.js` — `UI.textInteraction(div, {onEditStart, onInput, onEditEnd, onMove, onMoveEnd, onSelectionChange})`: click-to-edit (`contentEditable`) vs drag-to-move vs drag-to-select, hit-tested at `mousedown` via `UI.rangeContainsPoint`.
- `static/ui-text-selection.js` — `UI.textSelectionOffsets(div)`/`UI.rangeContainsPoint(div, x, y)`: native selection -> char offsets, and glyph-only hit-testing (excludes the resize-handles overlay sibling).
- `static/ui-resize-handles.js` — `UI.resizeHandles(container, {getSize, onResize, onDragEnd}) -> destroy()`: 8 corner/edge drag handles, shared with video boxes.
- `static/font-fit.js` — `FontFit.wrapText`/`canvasMeasurer`/`fitFontSize`: BOX FILL mode's client-side auto font-sizing (binary search matching `app/ass_render.py`'s box-sizing formula).
- `app/ass_render.py` — text-block dialogue: `\pos` anchor, `\fad`+`\t` scale pop for `entrance="fade_pop"`, `\n` -> ASS `\N`. Box background/border via a separate vector-drawn (`\p1`) `Dialogue` line from `_box_dialogue()`, sized/wrapped via `_wrapped_lines_and_size()` (uses `app/font_metrics.py`). Phase 5 rich-text: `_measure_range_for`/`_run_style_tag`/`_tagged_text` build per-run inline ASS override tags; `_highlight_dialogues` emits one rounded-rect `Dialogue` per highlighted run × visual line.
- `app/font_metrics.py` — `wrap_text_runs(text, measure_range, max_width_px)`: Phase 5 range-aware word-wrap returning per-line character-offset spans, consumed by `ass_render.py`'s per-run tagging.
- `static/css/components/style-panel.css` — `#panel-text`'s five accordions FONT/STYLE/BOX/POSITION/TIME, all built on `UI.accordionSection`.

### Saved style presets

Shared preset library (distinct from a block's live working style) used by both TEXT and CAPTIONS panels.

- `static/text-panel-style.js` — `TextPanel.renderStyle()`/`loadSavedPresets()`: "+ Save current style" (snapshots via `styleFieldsOf()`), top-3 most-used list, "Browse all styles" drill-down. `applySavedPreset()` copies fields onto the block's live preset, bumps `usage_count`, clears `block.formatting_runs = []` (a saved preset resets the whole look, not a partial patch).
- `static/caption-panel-style.js` — `CaptionPanel.renderStyle()`: near-identical mirror, extended to also carry `highlight_color`/`highlight_mode`/`max_words_per_line`, targeting the caption track's preset.
- `static/api-list-presets.js` / `api-save-preset.js` — `Api.listPresets()`/`Api.savePreset(preset)`: `GET`/`POST /api/presets`.
- `app/main.py` — `GET/POST /api/presets`.
- `app/store.py` — `save_preset`, `load_presets` (global `<data>/presets.json`).

### Captions & transcription

- `CaptionWord`/`CaptionTrack` in `app/models.py` — `CaptionTrack.z_index: int = 0` (see Layers panel); `preset_id: str` links to a `TextPreset`, defaulted via `new_id()` so old saved projects self-heal.
- `app/transcribe.py` — `words_from_segments(segments) -> list[CaptionWord]` (pure), `transcribe_file(path)` (lazy `WhisperModel("large-v3", device="cuda")`, module-level cache; requires the `ml` optional dependency group).
- `app/main.py` — `POST /api/projects/{pid}/transcribe`.
- `static/caption-panel-font-family.js` / `caption-panel-font-weight.js` / `caption-panel-font-style.js` / `caption-panel-box.js` — mirrors of the equivalent `text-panel-*.js` files, pointed at the caption track's preset via `ensureCaptionTrack()`/`ensureCaptionPreset()` (editor.js).
- `static/caption-panel-highlight.js` — `CaptionPanel.renderHighlight()`: MODE (`current_word`/`progressive_fill`), highlight color, max words per line — captions-only, no TEXT-panel equivalent.
- `static/caption-panel-words.js` — `CaptionPanel.renderWords()`: "Caption words" drill-down, every `CaptionWord` sorted by `t_start` with inline-editable text (empty text deletes the word); timing display-only.
- `static/timeline.js` — `groupWords(words, max)` (shared with preview.js, not duplicated).
- `static/preview.js` — `Preview.renderCaptions(project, presets, timelineTime)`: groups words via `Timeline.groupWords`, finds the group covering `timelineTime`, renders one `.caption-block` div with one `<span>` per word colored by `highlight_mode`.
- `app/ass_render.py` — `group_words(words, max_words)` (pure), `render_caption_ass(project, preset)`: standalone ASS script — one `Caption` style + karaoke dialogue, `progressive_fill` via native `\k` sweep, `current_word` via per-word `\1c` override.
- `app/main.py` — `export_project` burns in karaoke captions when `p.captions.words` is non-empty (see Export pipeline below).
- `static/seed.js` — `seedDefaults(project)`: seeds one sample caption line when `project.captions` is null (dev convenience only).
- `static/css/components/style-panel.css` — `#panel-captions`'s accordions, same FONT/STYLE/BOX/POSITION shape as TEXT plus captions-only HIGHLIGHT.

### Layers panel (z-order)

- `z_index` fields on `TextBlockLayer`, `CaptionTrack`, `VideoBoxLayer` (`app/models.py`) drive cross-layer stacking; `preview.js`/`video-box-preview.js` set each `#overlay` child's CSS z-index from its model's `z_index`.
- `static/panel-layers.js` — `LayersPanel.render()`: the `#panel-layers` context section — every text block + video box in one plain-HTML5 drag-and-drop reorderable list sorted by `z_index` descending (top row = frontmost); dropping a row renumbers every entry's `z_index`.
- `static/css/components/layers-panel.css` — `.layers-list` drag-and-drop rows.

### Export pipeline

- `app/ffmpeg_cmd.py` — `build_export_cmd` (per-clip trim/scale/pad, concat, optional ASS burn-in with `fontsdir=static/fonts`), `escape_filter_path`, `build_audio_cmd(project, wav_path)` (audio-only concat for transcription; **known gap:** still assumes every clip has audio — a video-only clip breaks transcription's audio export). Phase 6 (2026-07-20): synthesizes silent audio (`anullsrc`) for clips whose `MediaItem.has_audio` is `False`, tracked via a running `input_index` counter so interleaved silence inputs don't collide with real ones. Also accepts `caption_ass_path`: chains one more `ass` filter as the always-final stage after any text-block/video-box output, so captions always render on top.
- `app/ass_render.py` — `render_ass(project, presets)` (full ASS file), `ass_time`, `hex_to_ass`. See Text blocks and Captions above for block/caption-specific rendering detail.
- `app/font_metrics.py` — `pil_font_measurer(font_name, size_px, weight)`, `FONT_WEIGHT_PATHS`, `WEIGHT_LABELS`, `available_weights(font_name)` — measures the static per-weight `.ttf` files for export-path PIL measurement.
- `scripts/generate_font_weights.py` — one-off dev script baking those static per-weight `.ttf` files from the vendored variable fonts.
- `app/media.py` — `run_export` (runs the ffmpeg command, raises `RuntimeError` with stderr on failure).
- `app/main.py` — `POST /api/projects/{id}/export`, `GET /api/fonts/{name}/weights`.
- `static/api-export-project.js` — `Api.exportProject(projectId)`: `POST /api/projects/{id}/export` -> `{ok, out_path}` or error.
- `static/api-list-font-weights.js` — `Api.listFontWeights(fontName)`: `GET /api/fonts/{name}/weights`.
- `static/editor.js` — `openExportPanel()` opens `#panel-export` (the `#export`/`exportProject()`/`#export-result` wiring).
- `static/fonts/` — vendored variable woff2 + generated static per-weight `.ttf` files.

### Settings & safe zones

- `static/editor.js` — `openSettingsPanel()` opens `#panel-settings`, currently holding only the `#theme-toggle` dark/light control. `setSafeZonesVisible(bool)` toggles `#safe-zones`'s `hidden` + `#safe-zones-toggle`'s `aria-pressed`, persists to `localStorage` (`safeZonesVisible`).
- `static/css/components/safe-zones.css` — `#safe-zones`: 4 guide bands (top nav / right action rail / caption area / bottom nav) matching TikTok's real UI chrome, preview-only.

### Shared UI components

Framework-free presentational helpers, one function per file, attached to `window.UI`. (Formerly grouped in a single `ui-components.js`, split per the one-function-per-file convention.)

- `static/ui-button-group.js` — `UI.buttonGroup(container, options, activeValue, onSelect)`: single-select toggle-button row.
- `static/ui-number-field.js` — `UI.numberField(container, {label, unit, value, step, min, max, decimals, disabled, onChange})`: labeled number input + custom stepper (native OS spin control is unstylable).
- `static/ui-color-swatch.js` — `UI.colorSwatch(container, {label, value, onChange, showLabel})`: small square color-picker swatch with label.
- `static/ui-accordion.js` — `UI.accordion(header, body, {expanded})`: wires an existing header/body pair.
- `static/ui-accordion-section.js` — `UI.accordionSection(container, body, {title, expanded})`: builds the header for `UI.accordion` — the base of every TEXT/CAPTIONS panel accordion.
- `static/ui-divider.js` — `UI.divider(container)`: plain static separator line.
- `static/ui-settings-row.js` — `UI.settingsRow(container, {label, value, valueFontFamily, onClick})`: clickable label/value/chevron row opening a drill-down.
- `static/ui-sub-panel-header.js` — `UI.subPanelHeader(container, {title, onBack})`: back-arrow + title for drill-down sub-panels.
- `static/ui-icon-rail.js` — `UI.iconRail(container, items, activeValue, onSelect)`: vertical icon+label nav rail, used for `#panel-nav`.
- `static/ui-button.js` — `UI.button(el, {variant})`: icon/outline/accent variant styling on an existing `<button>`.
- `static/css/components/` — `button-group.css`, `number-field.css`, `color-swatch.css`, `accordion.css`, `divider.css`, `settings-row.css`, `sub-panel.css`, `icon-rail.css`, `button.css`, `resize-handles.css` — one stylesheet per component above, same naming.
- `static/css/components/style-panel.css` — `#style-panel` (right aside, 320px, hidden by default): close button + every `.context-panel` section listed under its owning feature above. Matches the north-star mockup (`docs/superpowers/specs/assets/2026-07-10-design-foundation-mockup.html`); preset swatches (CLEAN/BOXED/POP/MINIMAL) from the mockup deliberately not built yet.
- `static/css/tokens.css` — `:root` design tokens (colors, fonts, spacing, radius) + `@font-face`; every other stylesheet builds on this.

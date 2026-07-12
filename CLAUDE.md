# Codebase map — TikTok-Reels

Local web editor that assembles 4–6 mp4 clips into one vertical reel with trim, editable karaoke captions, and a preset-styled heading+subheading block, exported to 1080×1920 mp4. See `docs/superpowers/specs/2026-07-09-first-reel-design.md` and `docs/superpowers/plans/2026-07-09-first-reel.md`.

## Run commands

- Tests: `.venv/Scripts/python -m pytest -q`
- Server: `.venv/Scripts/python -m uvicorn app.main:app --reload` (then open http://127.0.0.1:8000)
- Setup: `python -m venv .venv && .venv/Scripts/pip install -e .[dev]`
- Requires `ffmpeg`/`ffprobe` on PATH for clip probing/export (not required for `pytest`, which mocks subprocess calls).

## File structure

```
app/
  __init__.py       # package marker
  main.py           # FastAPI app wiring only (routes -> modules, static mount)
  models.py         # Pydantic data model (Project, ClipLayer, TextPreset, TextBlockLayer, CaptionWord, CaptionTrack)
  store.py          # load/save project JSON + global presets.json
  media.py           # ffprobe command building/duration parsing, serves media files
  timeline.py         # pure sequence math (order, durations, timeline time -> clip+source time)
  ass_render.py        # ASS subtitle generation: text-block dialogue (styles + \pos/\fad entrance); captions land in Task 12
  ffmpeg_cmd.py         # pure ffmpeg export-command builder: trim/scale/pad/concat + optional ASS burn
  transcribe.py          # planned (Task 10): faster-whisper wrapper -> CaptionWords
static/
  index.html         # editor page: top bar + 3-column main (MEDIA panel | 9:16 stage | TEXT OVERLAY style panel), per the north-star mockup layout
  editor.js           # UI state + API calls + DOM wiring (thin); owns the client-side TextPreset stand-in (Task 8 will move it server-side)
  preview.js            # 9:16 stage playback + text overlay compositing (thin)
  ui-components.js       # reusable presentational microcomponents (window.UI): buttonGroup() — single-select toggle-button row; numberField() — labeled number input with a unit suffix; colorSwatch() — labeled full-bleed color picker
  css/
    tokens.css            # :root custom properties (colors, fonts, spacing, radius) + @font-face — single source of truth
    base.css               # reset + element defaults (body, button, input) on the tokens
    layout.css               # app shell grid: top bar, left panel, stage area, right panel
    components/
      panel.css                # left MEDIA panel + clip rows (thumbnail swatch + name/duration + trim fields)
      stage.css                 # 9:16 stage + transport controls + .text-block overlay styling
      button-group.css           # reusable .btn-group toggle-row + .icon-btn styling (used by ui-components.js)
      number-field.css            # custom up/down stepper for number inputs (native OS spin control is unstylable); used by ui-components.js
      style-panel.css            # right-hand contextual panel: caption placeholder + text overlay style controls, mockup-matched (mono-caps section labels, dividers, button-group align/position)
      color-swatch.css            # .color-swatch: full-bleed input[type=color] (strips native inset padding so the swatch is one solid rect of color, edge to edge)
  fonts/                # vendored woff2: JetBrainsMono-Regular (variable 400-700), PublicSans-Regular (variable 400-700)
tests/
  test_models.py
  test_store.py
  test_media.py
  test_timeline.py
  test_ffmpeg_cmd.py
  test_ass_render.py
data/               # gitignored: projects/*.json, presets.json, exports/
```

## Inventory

- `app/models.py` — Pydantic entities: `Project`, `ClipLayer`, `TextPreset`, `TextBlockLayer` (single `heading` line — `subheading` was dropped 2026-07-10), `CaptionWord`, `CaptionTrack`, `new_id()`.
- `app/store.py` — JSON persistence: `save_project`, `load_project`, `save_preset`, `load_presets`.
- `app/media.py` — `ffprobe_cmd`, `probe_duration`, `media_response` (serves a local file via FastAPI, 404s if missing), `run_export` (runs an ffmpeg command, raises `RuntimeError` with stderr on failure), `pick_file` (opens a native OS file-open dialog, returns the chosen path or `None`). Both `probe_duration` and `run_export` resolve `ffprobe`/`ffmpeg` from a freshly-read registry PATH rather than the process's inherited env, so a PATH change (e.g. installing ffmpeg) takes effect without restarting every ancestor process.
- `app/main.py` — FastAPI composition root: `GET /`, `POST/GET/PUT /api/projects[/{id}]`, `GET /api/probe`, `GET /api/pick-file`, `GET /media`, `POST /api/projects/{id}/export`, static mount at `/static`.
- `app/timeline.py` — `ordered`, `clip_duration`, `sequence_duration`, `locate` (timeline time -> clip + source-time); mirrored in `static/preview.js`.
- `app/ffmpeg_cmd.py` — `build_export_cmd` (per-clip trim/scale/pad, concat, optional ASS burn-in), `escape_filter_path`.
- `app/ass_render.py` — `render_ass(project, presets) -> str` (full ASS file: `[Script Info]`/`[V4+ Styles]`/`[Events]` for each text block), `ass_time(seconds) -> str`, `hex_to_ass(hex) -> str` (AABBGGRR). Text-block dialogue: `\pos` anchor, `\fad`+`\t` scale pop for `entrance="fade_pop"`. (`subheading`/`\N` merge dropped 2026-07-10 — one heading line per block.)
- `static/css/tokens.css` — design tokens (colors, fonts, spacing, radius) per `docs/superpowers/specs/2026-07-10-design-foundation-design.md`; every later screen builds on this.
- `static/ui-components.js` — `window.UI.buttonGroup(container, options, activeValue, onSelect)`: renders a row of toggle buttons with `aria-pressed` state, exactly one active; returns a `setActive(value)` updater. Used for TEXT ALIGN and the two POSITION rows; reusable for any future single-select control (e.g. presets, when Task 8 adds them). `window.UI.numberField(container, {label, unit, value, step, min, max, onChange})`: renders a `.style-field`-styled labeled number input plus a custom up/down stepper (`.number-field-wrap`/`.number-field-stepper`; the native OS spin control turned out to be unstylable — confirmed via computed-style inspection — so it's hidden globally in base.css and replaced by this CSS-drawn one), wires typing and stepper clicks to `onChange(number)`, returns a `setValue(v)` updater. Used for START/END/WIDTH/OFFSET H/OFFSET V — one owner for that markup instead of copy-pasted `<label class="style-field">` blocks (a duplication that caused a real styling bug once, fixed by extracting this). `window.UI.colorSwatch(container, {label, value, onChange})`: renders a `.style-field`-styled label plus a full-bleed `.color-swatch` color input, wires picks to `onChange(hexString)`, returns a `setValue(hex)` updater. Used for COLOR/OUTLINE/BOX COLOR.
- `static/css/components/button-group.css` — `.btn-group` (the toggle-row layout) + `.icon-btn` (small square icon buttons, used by the disabled caption-toolbar placeholder).
- `static/css/components/number-field.css` — `.number-field-wrap`/`.number-field-stepper`/`.number-field-step` (CSS-triangle up/down buttons); pairs with `UI.numberField`.
- `static/css/components/color-swatch.css` — `.color-swatch`: apply to any `<input type="color">` to make it fill its box with solid color, no inset border/padding (native color inputs otherwise render with browser chrome around a small swatch). Paired with `UI.colorSwatch()` below — that's the call site to reach for anywhere a color is picked (background, text, border, etc.).
- `static/css/components/style-panel.css` — `#style-panel` (right aside, 320px): a `.caption-placeholder` block (disabled B/I/U/align icon buttons + a static `.caption-preview-box`, clearly labeled "COMING IN A LATER TASK" — non-functional visual stand-in for Task 10/11's real caption editor) followed by `.style-group`/`.style-group-label`/`.style-row`/`.style-field`/`.style-divider` sections (TIME, STYLE, TEXT ALIGN, POSITION), matching the north-star mockup (`docs/superpowers/specs/assets/2026-07-10-design-foundation-mockup.html`). Preset swatches (CLEAN/BOXED/POP/MINIMAL) from the mockup are deliberately not built yet — deferred to Task 8.
- `static/editor.js` — text-block wiring: `defaultTextPreset()`/`loadTextPreset(id)`/`saveTextPreset()` (client-only TextPreset, persisted in `localStorage` under `textPreset:<projectId>` until Task 8 adds a presets API), `ensureTextBlock()` (lazily creates the single `project.text_blocks[0]`), `updateTextBlock()`/`updateTextStyle()` (input handlers -> save + re-render), `renderTextPanel()` (populate controls + button groups from state on load). Position is a `posRow`/`posCol` anchor grid (thirds of the 1080x1920 canvas, `POSITION_ANCHORS_X/Y`) plus an `offsetX`/`offsetY` pixel nudge; `computeXY()` derives `TextPreset.x/y` from those — the anchor/offset split is UI-only, not part of the persisted model. `renderClipList()` also builds the mockup-style thumbnail-swatch + name/duration row for each clip.
- `static/preview.js` — `Preview.renderText(project, presets, timelineTime)` composites one `.text-block` div (single heading line) per visible block into `#overlay` (position/size scaled from the 1080x1920 canvas to the stage's actual pixel size; outline via `-webkit-text-stroke` or `box`/`box_color` background); `Preview.currentTimelineTime()` exposes the last computed tick so editor.js can re-render immediately while paused.

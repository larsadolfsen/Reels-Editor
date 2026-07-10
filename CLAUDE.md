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
  index.html         # editor page: top bar (brand/project name/export) + media panel + 9:16 stage
  editor.js           # UI state + API calls + DOM wiring (thin)
  preview.js            # 9:16 stage playback (thin)
  css/
    tokens.css            # :root custom properties (colors, fonts, spacing, radius) + @font-face — single source of truth
    base.css               # reset + element defaults (body, button, input) on the tokens
    layout.css               # app shell grid: top bar, left panel, stage area
    components/
      panel.css                # media/clip panel + clip rows
      stage.css                 # 9:16 stage + transport controls
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

- `app/models.py` — Pydantic entities: `Project`, `ClipLayer`, `TextPreset`, `TextBlockLayer`, `CaptionWord`, `CaptionTrack`, `new_id()`.
- `app/store.py` — JSON persistence: `save_project`, `load_project`, `save_preset`, `load_presets`.
- `app/media.py` — `ffprobe_cmd`, `probe_duration`, `media_response` (serves a local file via FastAPI, 404s if missing), `run_export` (runs an ffmpeg command, raises `RuntimeError` with stderr on failure), `pick_file` (opens a native OS file-open dialog, returns the chosen path or `None`). Both `probe_duration` and `run_export` resolve `ffprobe`/`ffmpeg` from a freshly-read registry PATH rather than the process's inherited env, so a PATH change (e.g. installing ffmpeg) takes effect without restarting every ancestor process.
- `app/main.py` — FastAPI composition root: `GET /`, `POST/GET/PUT /api/projects[/{id}]`, `GET /api/probe`, `GET /api/pick-file`, `GET /media`, `POST /api/projects/{id}/export`, static mount at `/static`.
- `app/timeline.py` — `ordered`, `clip_duration`, `sequence_duration`, `locate` (timeline time -> clip + source-time); mirrored in `static/preview.js`.
- `app/ffmpeg_cmd.py` — `build_export_cmd` (per-clip trim/scale/pad, concat, optional ASS burn-in), `escape_filter_path`.
- `app/ass_render.py` — `render_ass(project, presets) -> str` (full ASS file: `[Script Info]`/`[V4+ Styles]`/`[Events]` for each text block), `ass_time(seconds) -> str`, `hex_to_ass(hex) -> str` (AABBGGRR). Text-block dialogue: `\pos` anchor, `\fad`+`\t` scale pop for `entrance="fade_pop"`, heading+subheading share one Dialogue line via `\N` (one entrance unit). Subheading font-size override was in the plan's sample code but conflicted with the plan's own test asserting a literal `heading\Nsubheading` substring — implemented to match the test; subheading renders at the block's base `size_px`, not 55%.
- `static/css/tokens.css` — design tokens (colors, fonts, spacing, radius) per `docs/superpowers/specs/2026-07-10-design-foundation-design.md`; every later screen builds on this.

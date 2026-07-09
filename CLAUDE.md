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
  ass_render.py        # planned (Task 6): ASS subtitle generation
  ffmpeg_cmd.py         # pure ffmpeg export-command builder: trim/scale/pad/concat + optional ASS burn
  transcribe.py          # planned (Task 10): faster-whisper wrapper -> CaptionWords
static/
  index.html         # editor page skeleton (stage + clip panel + export button)
  editor.js           # UI state + API calls + DOM wiring (thin)
  preview.js            # 9:16 stage playback (thin)
  style.css              # editor styling
tests/
  test_models.py
  test_store.py
  test_media.py
  test_timeline.py
  test_ffmpeg_cmd.py
data/               # gitignored: projects/*.json, presets.json, exports/
```

## Inventory

- `app/models.py` — Pydantic entities: `Project`, `ClipLayer`, `TextPreset`, `TextBlockLayer`, `CaptionWord`, `CaptionTrack`, `new_id()`.
- `app/store.py` — JSON persistence: `save_project`, `load_project`, `save_preset`, `load_presets`.
- `app/media.py` — `ffprobe_cmd`, `probe_duration`, `media_response` (serves a local file via FastAPI, 404s if missing), `run_export` (runs an ffmpeg command, raises `RuntimeError` with stderr on failure).
- `app/main.py` — FastAPI composition root: `GET /`, `POST/GET/PUT /api/projects[/{id}]`, `GET /api/probe`, `GET /media`, `POST /api/projects/{id}/export`, static mount at `/static`.
- `app/timeline.py` — `ordered`, `clip_duration`, `sequence_duration`, `locate` (timeline time -> clip + source-time); mirrored in `static/preview.js`.
- `app/ffmpeg_cmd.py` — `build_export_cmd` (per-clip trim/scale/pad, concat, optional ASS burn-in), `escape_filter_path`.

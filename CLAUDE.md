# Codebase map — TikTok-Reels

Local web editor that assembles 4–6 mp4 clips into one vertical reel with trim, editable karaoke captions, and a preset-styled heading+subheading block, exported to 1080×1920 mp4. See `docs/superpowers/specs/2026-07-09-first-reel-design.md` and `docs/superpowers/plans/2026-07-09-first-reel.md`.

## Run commands

- Tests: `.venv/Scripts/python -m pytest -q`
- Server (once `app/main.py` exists): `.venv/Scripts/python -m uvicorn app.main:app --reload`
- Setup: `python -m venv .venv && .venv/Scripts/pip install -e .[dev]`

## File structure

```
app/
  __init__.py       # package marker
  main.py           # planned (Task 2): FastAPI app wiring only
  models.py         # Pydantic data model (Project, ClipLayer, TextPreset, TextBlockLayer, CaptionWord, CaptionTrack)
  store.py          # load/save project JSON + global presets.json
  timeline.py       # planned (Task 3): pure sequence math
  ass_render.py      # planned (Task 6): ASS subtitle generation
  ffmpeg_cmd.py      # planned (Task 4): pure ffmpeg/ffprobe command building
  media.py           # planned (Task 2): run ffprobe/ffmpeg subprocesses, serve media files
  transcribe.py       # planned (Task 10): faster-whisper wrapper -> CaptionWords
static/               # planned (Task 2+): index.html, editor.js, preview.js, style.css
tests/
  test_models.py
  test_store.py
data/               # gitignored: projects/*.json, presets.json, exports/
```

## Inventory

- `app/models.py` — Pydantic entities: `Project`, `ClipLayer`, `TextPreset`, `TextBlockLayer`, `CaptionWord`, `CaptionTrack`, `new_id()`.
- `app/store.py` — JSON persistence: `save_project`, `load_project`, `save_preset`, `load_presets`.

# Export Settings — Design

**Status:** brainstormed 2026-07-20, ready to plan. No open questions.

## What / Why

Export writes a fixed path with fixed encoder settings. Add: output filename and a quality preset.

## Data model

- Persisted on the project so settings stick: `Project.export_filename: str = ""` (empty → derive from project name, sanitized) and `Project.export_quality: str = "high"` (`"high"` = CRF 18 / `"medium"` = CRF 23, both `libx264` + `-preset medium`, unchanged otherwise). Defaults preserve current behavior for old projects.

## Design

- `app/ffmpeg_cmd.py`'s `build_export_cmd` accepts the quality (maps to `-crf`); output path comes from the filename field (still inside `data/exports/` — no directory picker in v1, keeps the server's write surface contained; collision appends `-2`, `-3`…).
- EXPORT panel gains two rows above the button: FILENAME (text input, placeholder shows the derived default) and QUALITY (`UI.buttonGroup` HIGH/MEDIUM). Wired like every other preset field: mutate, save.
- Composes with the export-progress item (`2026-07-20-export-progress-design.md`) — settings feed the same command builder either way; no ordering constraint.

## Tasks

1. Model fields + `build_export_cmd` quality/filename threading (+ tests).
2. EXPORT panel FILENAME/QUALITY rows.

## Testing

- `test_ffmpeg_cmd.py`: CRF per quality, filename sanitization/collision suffix.
- Manual: renamed export appears under `data/exports/` with the chosen name; medium file is visibly smaller.

## Out of scope

- Directory picker / exporting outside `data/exports/`.
- Resolution/fps options (always 1080×1920).
- Codec choices.

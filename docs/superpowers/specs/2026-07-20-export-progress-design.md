# Export Progress — Design

**Status:** brainstormed 2026-07-20, ready for a build session to write its implementation plan. No further design questions open.

## What / Why

Export today is a synchronous POST that gives no feedback until it finishes (or fails). Long multi-layer exports look frozen. Add a progress bar in the EXPORT panel. Boring approach chosen deliberately: background thread + polling, no websockets/SSE.

## Design

### Backend

- New module `app/export_jobs.py` owning an in-memory job registry:
  - `start_job(run) -> job_id` — spawns a `threading.Thread`, registers `{status: "running", percent: 0}`.
  - `get_job(job_id) -> {status, percent, output_path?, error?}` (`status`: running / done / failed; unknown id → 404 at the route).
  - `update_progress(job_id, percent)` callback threaded into the runner.
  - Plain dict + lock; jobs are not persisted (a server restart forgets them — acceptable, the client just shows an error on its next poll).
- `POST /api/projects/{id}/export` changes to: build the command(s) exactly as today, then run them inside a job and return `{job_id}` immediately.
- Progress source: run ffmpeg with `-progress pipe:1 -nostats`; the runner parses `out_time_us` lines against the known `sequence_duration(project)` into a percent. This extends `app/media.py`'s `run_export` with an optional `on_progress` callback (subprocess line-reading; stderr still captured for the failure message). Multi-command exports (ASS render prep etc. are instant; ffmpeg dominates) report the ffmpeg pass as 0–100.
- `GET /api/exports/{job_id}` route in `main.py`, thin delegation.

### Frontend

- `static/api-export-status.js` — `Api.exportStatus(jobId)` (GET, one function per file convention).
- EXPORT panel (`#panel-export`): clicking Export disables the button and starts polling every 500 ms; a progress bar (`.export-progress` fill-div, styled in `style-panel.css` or its own component CSS) tracks `percent`; on `done` show the existing `#export-result` output path; on `failed` show the error and re-enable. Polling stops on done/failed/panel navigation-away (keep polling in the background even if the panel closes — simplest is a module-level poller in a new `static/export-progress.js` that updates the DOM only if the panel is visible).

## Data model

Nothing persisted. In-memory job dict keyed by `new_id()`.

## Reuse

- `run_export` in `app/media.py` (extended with the callback, existing error semantics kept).
- `sequence_duration` in `app/timeline.py` for the denominator.
- Existing `#export` / `#export-result` wiring and panel section.

## Tasks

1. `app/export_jobs.py` registry (+ lifecycle tests with injected executor).
2. `run_export` `on_progress` callback + pure `percent_from_progress_line()` (+ tests).
3. Route changes: POST returns `{job_id}`, new `GET /api/exports/{job_id}` (+ route tests).
4. Frontend: `api-export-status.js` + `export-progress.js` poller + progress-bar UI in `#panel-export`.

## Testing

- `export_jobs.py`: unit tests for the registry lifecycle (start → progress updates → done/failed, unknown id) with the runner stubbed — no threads needed if `start_job` accepts an injectable executor, or use a synchronous fake.
- Progress parsing: pure function `percent_from_progress_line(line, total_duration)` unit-tested with real `-progress` output samples.
- Route tests follow the existing direct-call + `unittest.mock.patch` pattern.
- Manual: real export shows a moving bar and lands on the same output as before; a forced ffmpeg failure surfaces the error.

## Out of scope

- Cancelling a running export.
- Concurrent-export queuing (last-write-wins on the output file, same as today).
- Job persistence across server restarts.

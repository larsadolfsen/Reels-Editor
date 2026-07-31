# Auto-caption transcription progress percentage

Date: 2026-07-31

## Problem

Clicking "Auto-caption" (CAPTIONS panel's Auto tab) runs transcription synchronously: the frontend
sends one `fetch` and waits for the whole response, with only a static "Transcribing…" label. There
is no percentage or other feedback on how far along transcription is. This can leave the user unsure
whether the app is stuck, especially for longer reels.

## Goals

- Show a live percentage on the Auto-caption button while transcription runs (`Transcribing… 42%`).
- Reuse the existing background-job pattern (export) rather than invent a new one.
- No visual progress bar — button label only.

## Non-goals

- Progress during the initial ffmpeg audio-extraction step (stays at 0% until transcription itself
  starts; that step is normally fast for reel-length clips).
- Changing the transcription model/backend or its CPU fallback behavior.

## Architecture

Transcription becomes a background job using the app's existing generic job registry,
`app/export_jobs.py` (`start_job`/`get_job`/`update_progress`). That module is already
feature-agnostic (a dict of `{status, percent, output_path, error}` keyed by job id, run via a
swappable executor) despite its export-specific filename — it is reused as-is for transcription
jobs too, no rename.

The transcribe route returns a `job_id` immediately instead of blocking. The frontend polls a new
status endpoint and updates the button's label directly, mirroring `export-progress.js`'s
poll-and-update pattern for the EXPORT panel's progress bar.

## Backend changes

### `app/transcribe.py`

`transcribe_file(path, language=None, on_progress=None)` gains an optional progress callback,
defaulting to `None` so existing callers/tests are unaffected.

faster-whisper's `model.transcribe(...)` returns `(segments, info)`, where `segments` is a lazy
generator and `info.duration` is the total audio duration in seconds. `_run_transcribe` iterates
segments manually (instead of via the `words_from_segments` list comprehension) so it can call
`on_progress(min(100, seg.end / info.duration * 100))` as each segment resolves, then still returns
`words_from_segments(...)`-equivalent output. The existing CUDA-fails-at-runtime → CPU fallback
(`transcribe_file`'s `try`/`except RuntimeError` retry) is unchanged; progress reporting resets to 0
on the CPU retry pass.

### `app/main.py`

`POST /api/projects/{pid}/transcribe`:
- Loads the project, builds the audio-extraction ffmpeg command (unchanged).
- Instead of running transcription inline, defines `run(on_progress)` that: extracts audio via
  `media.run_export`, calls `transcribe.transcribe_file(..., on_progress=on_progress)`, then
  **re-loads the project fresh from disk** (`store.load_project`, not the copy loaded before the
  job started) before merging in the new `captions`/`preset` and saving. This narrows — it does not
  fully eliminate — the window for clobbering an edit saved by the client while transcription was
  running; the current synchronous version has the same theoretical race over a shorter window.
  `ImportError`/`RuntimeError` from `transcribe_file` are caught inside `run` and re-raised as
  `RuntimeError` carrying the same user-facing messages used today ("Transcription not available on
  this deployment" / "Transcription failed: {e}"), so they surface as `job["error"]`.
- Hands `run` to `export_jobs.start_job` and returns `{"job_id": job_id}` immediately (still 200).

New route: `GET /api/transcribe-jobs/{job_id}` — thin wrapper over `export_jobs.get_job`, same
`{status, percent, output_path, error}` shape as `GET /api/exports/{job_id}` (404 if the id is
unknown). `output_path` is unused for transcription jobs (the job's `run` returns the project id, to
satisfy the registry's `Callable[..., str]` contract, but the frontend ignores it).

## Frontend changes

- `static/api-transcribe-project.js` (new): `Api.transcribeProject(pid)` — `POST
  /api/projects/{pid}/transcribe` → `{job_id}`. Replaces the inline `fetch` currently in
  `caption-panel-auto-caption.js`.
- `static/api-transcribe-status.js` (new): `Api.transcribeStatus(jobId)` — `GET
  /api/transcribe-jobs/{jobId}` → `{status, percent, error}`.
- `static/caption-transcribe-progress.js` (new): `window.CaptionTranscribeProgress.start(jobId,
  {onDone, onFailed})`. Structural twin of `export-progress.js`'s poller (500ms interval via
  `Api.transcribeStatus`), except each `running` tick writes `Transcribing… ${Math.round(percent)}%`
  directly into the Auto-caption button's `.label` span instead of driving a progress-bar element.
- `static/caption-panel-auto-caption.js`'s `runAutoCaption()`:
  1. `ensureCaptionTrack()`, hide the error box, disable the button, set label to
     `Transcribing… 0%` (unchanged framing, new text).
  2. `Api.transcribeProject(project.id)` to get `job_id`.
  3. `CaptionTranscribeProgress.start(job_id, { onDone, onFailed })`.
     - `onDone`: re-fetch the project (`GET /api/projects/{id}`, the same call
       `Api.ensureProject` already makes internally) into the `project` global, then the existing
       `renderCaptionPanel()` / `AudioTrackPanel.render()` / `renderTimeline()` refresh sequence.
     - `onFailed(message)`: same `#caption-transcribe-error` handling as today's non-ok branch.
  4. `finally`: re-enable the button, reset label to `Auto-caption` (unchanged).
  - A network failure reaching the initial `POST` (not the polling) keeps today's "could not reach
    the server" catch branch.

## Error handling

- Transcription unavailable (`ml` extra missing) or failing on both CUDA and CPU: job ends
  `status: "failed"` with a user-facing `error` string, shown in `#caption-transcribe-error` exactly
  as today's 503 response body is shown now.
- Network failure on the initial POST (server unreachable): existing catch-and-show-generic-message
  behavior in `runAutoCaption`, unchanged.
- Network failure mid-poll (e.g. server restarts): poller's `catch` path calls `onFailed` with the
  fetch error's message, same as `export-progress.js`'s existing behavior.

## Testing

- `tests/test_transcribe.py`: new cases asserting `on_progress` is called with the expected
  percentages as fake segments (carrying `.end`) stream against a fake `info.duration`, and that
  omitting `on_progress` still works (existing tests keep passing unchanged since the parameter
  defaults to `None`).
- `tests/test_transcribe_route.py`: rewritten from asserting `res.json()` is the updated `Project`
  to asserting `POST /transcribe` returns a `job_id`, and that polling
  `GET /api/transcribe-jobs/{job_id}` reaches `status: "done"` with captions saved to disk — using
  `export_jobs`'s existing injectable-synchronous-executor test seam (already used by export's own
  job tests) so tests stay deterministic without waiting on a real background thread. The five
  existing scenarios (creates captions+preset, overwrites words keeps preset id, passes language
  through, auto-detects language, 503-equivalent error messages) are preserved, just observed via
  job status instead of the response body.
- No new frontend (`node --test`) coverage is planned for `caption-transcribe-progress.js` — it's a
  thin DOM-polling wrapper, structurally identical to the already-untested `export-progress.js`,
  verified live in the browser instead (matching that file's precedent).

## Manual verification

Run a transcription on a throwaway project with a clip that has real speech long enough to emit
multiple segments (a few seconds is enough), and confirm the button label counts up through
percentages before landing back on "Auto-caption" with the transcript populated.

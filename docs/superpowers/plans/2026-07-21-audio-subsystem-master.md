# Audio Subsystem — Master Plan

> This is the master plan. Each batch below has its own plan file under
> `docs/superpowers/plans/2026-07-21-audio-batch-N-*.md`. Execute batches in order —
> later batches depend on model/export fields earlier batches add. Each batch's own
> plan file has the full header required by superpowers:writing-plans (goal,
> architecture, tech stack, global constraints) plus bite-sized TDD tasks.

**Goal:** Add per-clip volume/mute, a single background-music track, and real
waveforms to the AUDIO timeline row — the "Audio" backlog item from
[2026-07-20-audio-volume-music-design.md](../specs/2026-07-20-audio-volume-music-design.md).

**Architecture:** Three independent surfaces build on one data-model batch:
export (`app/ffmpeg_cmd.py` filter graph), preview (`static/preview.js` +
one `<audio>` element), and the timeline/UI (waveform peaks route +
VIDEO-panel VOLUME group + new AUDIO panel). No new abstractions — every
batch reuses an existing pattern already in the codebase (see each batch's
Reuse section).

**Tech Stack:** FastAPI/Pydantic backend, vanilla JS frontend (no build
step), ffmpeg/ffprobe subprocess calls, pytest with mocked subprocess.

> **Re-verified 2026-07-21 against current `main`:** this plan set was written before two
> unrelated features merged into `main` — image/photo clips (`MediaItem.kind` already exists,
> `static/preview.js` gained a full `<video>`/`<img>` hand-off) and background export-progress
> jobs (`app/main.py`'s export route now returns a `job_id` via a new `export_jobs` module;
> `static/timeline.js` also independently gained real zoom). Every batch plan below has been
> checked against current `main` and updated inline (each has its own "Re-verified 2026-07-21"
> note where something material changed): Batch 1's `MediaItem.kind` task now documents an
> existing field instead of adding one; Batch 4's preview wiring was substantially rewritten for
> the image-clip hand-off; Batch 5's waveform row uses the new zoom-aware `px` variable instead
> of a fixed constant; Batch 7's `pick_file` change preserves the current (image-aware) default
> filetypes list. Batches 2, 3, and 6 needed no substantive changes — only stale line-number
> citations, which their code snippets already route around (match by quoted code).

## Global Constraints

- `ClipLayer.volume: float = 1.0` (0.0–2.0) and `ClipLayer.muted: bool = False` — defaults preserve existing saved-project behavior.
- `MediaItem.kind: str = "video"` — `"audio"` for imported music files; decided at import from file extension (mp3/wav/m4a/aac/ogg/flac).
- New `MusicTrack(id, media_id, volume: float = 0.3, muted: bool = False)` on `Project.music: MusicTrack | None = None`. No loop/trim/start-offset fields (out of scope, confirmed in spec).
- Music starts at timeline t=0, cut at reel end. No looping.
- Export: `amix=inputs=2:duration=first` — ffmpeg's default normalization (÷ input count) is used as-is; do **not** add `normalize=0` (confirmed decision — revisit only if manual testing shows the mix is too quiet).
- Peaks cache: `data/peaks/{media_id}.json`, gitignored, invalidated by absence only (media files are immutable once imported — confirmed decision, no mtime/hash check needed).
- No automatic ducking, no per-clip fades/crossfades, no multiple music tracks — all out of scope.
- Every new `static/*.js` file opens with a 1–2 line purpose header comment (project convention).
- No inline `style="..."` in `static/index.html` or JS-rendered markup — all styling via `static/css/**` classes.
- Reuse `UI.numberField`, `UI.button`, `UI.buttonGroup`, the `open*Panel()` / `PANEL_NAV_HANDLERS` context-panel pattern, and the existing native-file-picker (`Api.pickFile`/`media.pick_file`) + probe (`Api.probeMedia`) flow for music import.

---

## Batches

1. **[Batch 1: Data model + persistence](2026-07-21-audio-batch-1-data-model.md)** — `ClipLayer.volume`/`muted`, `MediaItem.kind`, `MusicTrack`, `Project.music`. Pure model + pytest, no UI.
2. **[Batch 2: Export — per-clip volume filters](2026-07-21-audio-batch-2-export-volume.md)** — `volume=<v>` filter per clip audio chain in `build_export_cmd`, muted → `volume=0`.
3. **[Batch 3: Export — music input + amix](2026-07-21-audio-batch-3-export-music.md)** — adds the music file as an extra input, trims to `sequence_duration`, `amix`s with the concatenated clip audio.
4. **[Batch 4: Preview — clip volume/mute + music `<audio>`](2026-07-21-audio-batch-4-preview.md)** — `player.volume`/`player.muted` per active clip; one module-level `<audio>` element synced to timeline time for music playback.
5. **[Batch 5: Peaks route + waveform row](2026-07-21-audio-batch-5-peaks-waveform.md)** — `app/waveform.py` pure downsampler + cache, `GET /api/media/{id}/peaks` route, real per-clip + music waveforms in the timeline AUDIO row.
6. **[Batch 6: VIDEO panel VOLUME group](2026-07-21-audio-batch-6-video-panel-volume.md)** — VOLUME number field + mute button on the existing VIDEO context-panel section.
7. **[Batch 7: AUDIO panel + music import](2026-07-21-audio-batch-7-audio-panel.md)** — new `#panel-audio` context-panel section, `selected.type = "audio"`, music import via the audio-filtered native picker.

Each batch ends in a runnable/visible checkpoint: batches 1–3 and 5 (backend half) end in a passing `pytest` run; batches 4, 6, 7 and 5's frontend half end in a manual check on a throwaway project (never real project data — per user's live-verify convention) plus, where practical, a JS-side pure-function test.

Merge + push to `main` after each batch, per the user's per-batch cadence — ask before merging, never automatically.

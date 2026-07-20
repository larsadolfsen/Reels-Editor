# Audio: Volume, Music, Real Waveforms — Design

**Status:** brainstormed 2026-07-20, ready for a build session to write its implementation plan. No further design questions open.

## What / Why

The AUDIO timeline row is a fake waveform and there is no audio control at all. User-chosen v1 scope: per-clip volume + mute, one background-music track, and a real waveform in the AUDIO row. No automatic ducking (deferred).

## Data model

- `ClipLayer.volume: float = 1.0` (range 0.0–2.0) and `ClipLayer.muted: bool = False`. Defaults mean existing saved projects load and behave unchanged.
- `MediaItem.kind: str = "video"` — `"audio"` for imported music files (decided at import from the picked file's extension: mp3/wav/m4a/aac/ogg/flac). Audio items get `has_audio = True`, duration probed the same way; they are excluded from the clip-add flows.
- New entity `MusicTrack(id: str = new_id(), media_id: str, volume: float = 0.3, muted: bool = False)` and `Project.music: MusicTrack | None = None`. `media_id` links to a `kind="audio"` `MediaItem` — the media-library/layer split mirrors `ClipLayer`/`MediaItem` exactly.
- Music timing: starts at timeline t=0, cut at reel end if longer. **No looping in v1** — music shorter than the reel simply ends. No start-offset/trim fields yet (deferred with looping).

## Design

### Export (`app/ffmpeg_cmd.py`)

- Per-clip audio chain gains a `volume=<v>` filter (muted → `volume=0`; the synthesized-silence path for `has_audio=False` clips needs neither). Applied before concat so each clip's level is independent.
- Music: when `project.music` is set (and not muted / volume > 0), add the audio file as one more input, apply its `volume`, trim to `sequence_duration`, then `amix=inputs=2:duration=first` the concat'd clip audio with it (`duration=first` keeps reel length authoritative). Input-index bookkeeping follows the existing running `input_index` counter pattern.
- Covered by `tests/test_ffmpeg_cmd.py` additions (command-string assertions, mocked subprocess — existing pattern).

### Preview (`static/preview.js`)

- Clip volume: on each `playClipAt()` set `player.volume = clamp(v, 0, 1)` and `player.muted`. HTML5 volume caps at 1.0 — preview approximates >1.0 as 1.0 (export is exact); note this in the VOLUME UI (no special handling beyond the clamp).
- Music: one module-level `<audio>` element. Play/pause/seek/restart handlers keep it synced to timeline time (set `currentTime = timelineTime` on seek and clip transitions; drift between clip joins is acceptable v1). Volume/mute applied from `MusicTrack`. Stops at sequence end.

### Waveform peaks

- New module `app/waveform.py`: `peaks_for_media(media_item, samples_per_second=10) -> list[float]` — ffmpeg decodes to mono PCM, downsample to per-bucket peak amplitude (0..1), cache as JSON in `data/peaks/{media_id}.json` (gitignored, invalidated by absence only — media files are immutable once imported).
- Route `GET /api/media/{id}/peaks` in `main.py` (thin, delegates to the module).
- `static/timeline.js`: the AUDIO row replaces the dummy-bars generator with real peaks per clip — fetched once per media id (client cache), drawn trimmed to each clip's in/out and scaled by the zoom factor. A clip whose media has no audio draws a flat line. If the music track exists, its waveform renders in the same row beneath/behind the clip waveforms (single AUDIO row in v1).

### UI

- **VIDEO panel:** a VOLUME group — slider or `UI.numberField` (0–200%) + a mute `.icon-btn` (Lucide volume-x). Per selected clip.
- **Music:** imported via the existing native file picker (extend `pick_file`'s dialog filter to audio types when invoked from the music flow). Entry points: an "Add music" button in the AUDIO context-panel section; clicking the AUDIO timeline row opens that section (new `selected.type = "audio"`, new `#panel-audio` context-panel section following the existing `open*Panel()` pattern) showing music name, volume, mute, replace, remove.

## Reuse

- `MediaItem` + probe/import flow (`GET /api/probe`, `addClip`-style library insertion) for audio files.
- `has_audio_stream` / registry-PATH ffmpeg resolution in `app/media.py`.
- `input_index` bookkeeping pattern in `build_export_cmd`.
- `UI.numberField`, `UI.button`, `open*Panel()` / context-panel section pattern.

## Testing

- `test_ffmpeg_cmd.py`: volume filter present per clip, muted → volume=0, music input + amix + trim present, absent when no music, index bookkeeping with mixed silent/real/music inputs.
- `app/waveform.py`: pure downsampling logic unit-tested with synthetic PCM arrays; ffmpeg invocation mocked per existing pattern.
- `test_models.py`: new fields' defaults; old project JSON loads.
- Manual: volume/mute audible in preview and export; music plays under clips, cut at reel end; AUDIO row shows real waveforms aligned with speech.

## Out of scope

- Automatic ducking.
- Music looping, start offset, trim, fade in/out.
- Multiple music tracks or a separate music timeline row.
- Per-clip audio fades / crossfades.

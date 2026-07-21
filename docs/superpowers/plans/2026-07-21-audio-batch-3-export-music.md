# Audio Batch 3: Export — Music Input + amix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When `Project.music` is set (and audible), `build_export_cmd` adds the music file as an extra ffmpeg input, trims it to the reel's sequence duration, applies its volume, and `amix`es it with the concatenated clip audio — replacing `[a]` with `[amix]` in the final `-map`.

**Architecture:** One conditional block inserted right after the concat filter is built (`fc = ... concat=...[vc][a]`) and before the `bands is None` branch splits — so both the simple and banded export paths see the same `amap` variable instead of a hardcoded `"[a]"`. The music input is added to `cmd`/`input_index` before the bands loop computes `next_input_index`, so existing video-box input-index bookkeeping (already tested) is unaffected — it just starts one input later when music is present.

**Tech Stack:** Pure Python string building, pytest with the existing command-string-assertion pattern.

> **Re-verified 2026-07-21 against current `main`:** same image-clips-feature line-number drift
> noted in Batch 2 applies here too — the `fc = "".join(parts) + f"{streams}concat=...[vc][a]"`
> line is now around line 69, not 57, but its exact text is unchanged, as is `build_export_cmd`'s
> `bands is None` branch and the bands branch's final `-map` lines. All code snippets below match
> current `main` verbatim; match by quoted code, not the stated line number. Separately: `main`
> also gained a background export-progress-job feature (`app/main.py`'s `export_project` route now
> returns `{"job_id": ...}` via a new `app/export_jobs` module instead of running synchronously)
> — that's a route-layer change only and does not touch `build_export_cmd`'s filter-graph
> construction this batch tests directly, so it requires no changes here.

## Global Constraints

**Requires Batch 1** (`MusicTrack`/`Project.music`) **and Batch 2** (per-clip volume filters, for the pattern this batch follows) **merged first.**

- Music is added only when `project.music is not None and not project.music.muted and project.music.volume > 0`. Muted or zero-volume music: no extra input, no `amix`, output identical to no-music baseline.
- Music input's `media_id` is looked up in `project.media_library` (same `media_by_id` dict already built for clips). If not found, skip the music mix entirely (graceful no-op — mirrors the existing `media = media_by_id.get(c.media_id)` fallback pattern already in this file for clips with no library entry).
- amix uses ffmpeg's default normalization: `amix=inputs=2:duration=first` — no `normalize=0` (confirmed decision, see master plan).
- `duration=first` means the mix duration is authoritative from `[a]` (the reel's own concatenated audio) — the explicit `atrim` to `sequence_duration` on the music input is added anyway per spec, so a long music file is trimmed before mixing, not relying solely on `amix`'s duration behavior.
- `build_audio_cmd` (transcription-only) is unaffected — out of scope, same as Batch 2.

---

### Task 1: Music track adds an input, trims, and mixes via `amix`

**Files:**
- Modify: `app/ffmpeg_cmd.py` (imports at top, and the block right after the concat `fc` line, currently ending `app/ffmpeg_cmd.py:57`)
- Test: `tests/test_ffmpeg_cmd.py`

**Interfaces:**
- Consumes: `Project.music: MusicTrack | None` (Batch 1), `app.timeline.sequence_duration(clips: list[ClipLayer]) -> float` (already defined in `app/timeline.py:10-11`).
- Produces: no new function signature — `build_export_cmd`'s filter graph now ends on `[amix]` instead of `[a]` when music is mixed in; both the `bands is None` branch and the bands branch's final `-map` reflect this via a shared `amap` variable.

- [ ] **Step 1: Write the failing tests**

Add to `tests/test_ffmpeg_cmd.py`:

```python
def _proj_with_music(volume=0.3, muted=False):
    p = proj()
    p.media_library = [MediaItem(id="music1", file_path="song.mp3", duration=180, has_audio=True, kind="audio")]
    from app.models import MusicTrack
    p.music = MusicTrack(media_id="music1", volume=volume, muted=muted)
    return p

def test_music_track_adds_input_trims_and_amixes():
    p = _proj_with_music(volume=0.4)
    cmd = build_export_cmd(p, "out.mp4")
    assert "song.mp3" in cmd
    fc = cmd[cmd.index("-filter_complex") + 1]
    assert "atrim=start=0:end=4" in fc          # proj()'s two 2s clips = 4s sequence duration
    assert "volume=0.4[amusic]" in fc
    assert "[a][amusic]amix=inputs=2:duration=first[amix]" in fc
    map_indices = [i for i, x in enumerate(cmd) if x == "-map"]
    assert cmd[map_indices[-1] + 1] == "[amix]"

def test_no_music_track_leaves_map_a_unchanged():
    cmd = build_export_cmd(proj(), "out.mp4")
    fc = cmd[cmd.index("-filter_complex") + 1]
    assert "amix" not in fc
    map_indices = [i for i, x in enumerate(cmd) if x == "-map"]
    assert cmd[map_indices[-1] + 1] == "[a]"

def test_muted_music_skips_amix():
    p = _proj_with_music(muted=True)
    cmd = build_export_cmd(p, "out.mp4")
    assert "song.mp3" not in cmd
    fc = cmd[cmd.index("-filter_complex") + 1]
    assert "amix" not in fc

def test_zero_volume_music_skips_amix():
    p = _proj_with_music(volume=0.0)
    cmd = build_export_cmd(p, "out.mp4")
    assert "song.mp3" not in cmd
    fc = cmd[cmd.index("-filter_complex") + 1]
    assert "amix" not in fc

def test_music_with_missing_media_item_skips_gracefully():
    p = proj()
    from app.models import MusicTrack
    p.music = MusicTrack(media_id="does-not-exist", volume=0.3)
    cmd = build_export_cmd(p, "out.mp4")
    fc = cmd[cmd.index("-filter_complex") + 1]
    assert "amix" not in fc

def test_music_input_index_bookkeeping_with_video_box_band():
    p = _proj_with_music(volume=0.3)
    box = VideoBoxLayer(media_id="m1", file_path="pip.mp4", in_point=0, out_point=2, start=0, height=1920, z_index=5)
    cmd = build_export_cmd(p, "out.mp4", bands=[{"kind": "video_box", "video_box": box}])
    # inputs in order: clip a.mp4 (order 0), clip b.mp4 (order 1), song.mp3 (music), pip.mp4 (band)
    ia, ib, imusic, ipip = cmd.index("a.mp4"), cmd.index("b.mp4"), cmd.index("song.mp3"), cmd.index("pip.mp4")
    assert ia < ib < imusic < ipip
    fc = cmd[cmd.index("-filter_complex") + 1]
    assert "[3:v]" in fc      # pip.mp4 is input index 3 (0=a.mp4, 1=b.mp4, 2=song.mp3, 3=pip.mp4)
    map_indices = [i for i, x in enumerate(cmd) if x == "-map"]
    assert cmd[map_indices[-1] + 1] == "[amix]"
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `.venv/Scripts/python -m pytest tests/test_ffmpeg_cmd.py -k music -v`
Expected: FAIL — `Project` has no music mixing behavior yet (most assertions fail; `test_no_music_track_leaves_map_a_unchanged` passes trivially).

- [ ] **Step 3: Import `sequence_duration`**

In `app/ffmpeg_cmd.py`, change the import line (currently line 9):

```python
from app.timeline import ordered, sequence_duration
```

- [ ] **Step 4: Insert the music-mixing block**

In `app/ffmpeg_cmd.py`, right after the line building `fc` from concat (currently):

```python
    fc = "".join(parts) + f"{streams}concat=n={len(clips)}:v=1:a=1[vc][a]"
```

add:

```python
    fc = "".join(parts) + f"{streams}concat=n={len(clips)}:v=1:a=1[vc][a]"

    amap = "[a]"
    if p.music and not p.music.muted and p.music.volume > 0:
        music_media = media_by_id.get(p.music.media_id)
        if music_media:
            music_idx = input_index
            cmd += ["-i", music_media.file_path]
            input_index += 1
            music_duration = sequence_duration(clips)
            fc += (f";[{music_idx}:a]atrim=start=0:end={_num(music_duration)},asetpts=PTS-STARTPTS,"
                   f"volume={_num(p.music.volume)}[amusic]"
                   f";[a][amusic]amix=inputs=2:duration=first[amix]")
            amap = "[amix]"
```

- [ ] **Step 5: Replace both final `-map "[a]"` call sites with `amap`**

In the `bands is None` branch (currently):

```python
        cmd += ["-filter_complex", fc, "-map", vmap, "-map", "[a]",
                "-c:v", "libx264", "-preset", "fast", "-crf", crf, "-c:a", "aac", out_path]
        return cmd
```

change to:

```python
        cmd += ["-filter_complex", fc, "-map", vmap, "-map", amap,
                "-c:v", "libx264", "-preset", "fast", "-crf", crf, "-c:a", "aac", out_path]
        return cmd
```

And in the bands branch (currently, at the end of the function):

```python
    cmd += ["-filter_complex", fc, "-map", current, "-map", "[a]",
            "-c:v", "libx264", "-preset", "fast", "-crf", crf, "-c:a", "aac", out_path]
    return cmd
```

change to:

```python
    cmd += ["-filter_complex", fc, "-map", current, "-map", amap,
            "-c:v", "libx264", "-preset", "fast", "-crf", crf, "-c:a", "aac", out_path]
    return cmd
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `.venv/Scripts/python -m pytest tests/test_ffmpeg_cmd.py -k music -v`
Expected: PASS

- [ ] **Step 7: Run the full ffmpeg_cmd test file**

Run: `.venv/Scripts/python -m pytest tests/test_ffmpeg_cmd.py -v`
Expected: All PASS — confirms the `next_input_index = input_index` bookkeeping for video-box bands (untouched code, just now starts one input later when music present) is still correct, and no-music exports are byte-identical to Batch 2's baseline.

- [ ] **Step 8: Commit**

```bash
git add app/ffmpeg_cmd.py tests/test_ffmpeg_cmd.py
git commit -m "feat: mix background music into export audio via amix"
```

---

### Task 2: Update the file header comment

**Files:**
- Modify: `app/ffmpeg_cmd.py:1-10` (header comment)

- [ ] **Step 1: Extend the header**

Append to the existing header comment block in `app/ffmpeg_cmd.py`:

```python
# Project.music (MusicTrack), when set and audible (not muted, volume > 0), adds the referenced
# media file as one more input, trims it to the clip sequence's total duration, applies its
# volume, and amix=inputs=2:duration=first-mixes it with the concatenated clip audio — replacing
# the final audio map target [a] with [amix]. amix's default normalization (no normalize=0) is
# used as-is. No music: output is byte-identical to the pre-music baseline.
```

- [ ] **Step 2: Run the full test suite**

Run: `.venv/Scripts/python -m pytest -q`
Expected: All PASS.

- [ ] **Step 3: Commit**

```bash
git add app/ffmpeg_cmd.py
git commit -m "docs: note music amix mixing in ffmpeg_cmd.py header"
```

---

## Batch 3 Definition of Done

- [ ] `.venv/Scripts/python -m pytest -q` passes (full suite).
- [ ] No-music exports remain byte-identical to the Batch 2 baseline.
- [ ] All changes committed.

Next: [Batch 4: Preview — clip volume/mute + music `<audio>`](2026-07-21-audio-batch-4-preview.md).

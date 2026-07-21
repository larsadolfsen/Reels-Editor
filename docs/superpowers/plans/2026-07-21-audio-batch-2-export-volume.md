# Audio Batch 2: Export — Per-Clip Volume Filters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `build_export_cmd`'s per-clip audio chain applies `ClipLayer.volume`/`muted` via an ffmpeg `volume` filter, independently per clip, before concat.

**Architecture:** One filter segment inserted into the existing per-clip audio `parts.append(...)` line in `app/ffmpeg_cmd.py`, gated the same way `atempo` already is (only emitted when it changes behavior from the 1.0/unmuted default), so default clips produce byte-identical commands to the pre-this-batch baseline.

**Tech Stack:** Pure Python string building, pytest with the existing `tests/test_ffmpeg_cmd.py` command-string-assertion pattern (no real ffmpeg invocation — nothing here touches subprocess).

> **Re-verified 2026-07-21 against current `main`:** an unrelated image-clips feature landed
> above this code (per-clip `-loop 1 -t <duration>` handling for `MediaItem.kind == "image"`,
> plus an `is_image`-branched `setpts`), which shifted line numbers throughout `app/ffmpeg_cmd.py`
> (the `if has_audio:` block below is now around line 59, not 47). The exact code inside that
> block — and the `proj()` test fixture in `tests/test_ffmpeg_cmd.py` — is byte-identical to what
> this plan assumed, so every code snippet and old/new string below still applies verbatim; only
> the line-number citations are approximate. Match by the quoted code, not the line number.

## Global Constraints

**Requires Batch 1 merged** (`ClipLayer.volume`/`muted` fields must exist).

- Muted clips → `volume=0`. Non-default volume (≠ 1.0) and not muted → `volume=<v>`. Default (`volume=1.0`, `muted=False`) → no filter emitted (byte-identical to baseline).
- Applied only to the real-audio path (`has_audio=True`); the synthesized-silence path (`has_audio=False`) needs no volume filter — silence times any gain is still silence.
- `build_audio_cmd` (used only for auto-caption transcription, not final export) is **out of scope** for this batch — transcription should hear the clip's original audio regardless of its mix volume.

---

### Task 1: Non-default volume emits a `volume=<v>` filter

**Files:**
- Modify: `app/ffmpeg_cmd.py:47-49`
- Test: `tests/test_ffmpeg_cmd.py`

**Interfaces:**
- Consumes: `ClipLayer.volume: float`, `ClipLayer.muted: bool` (Batch 1).
- Produces: no new function signature — `build_export_cmd`'s emitted `-filter_complex` string now contains `,volume=<v>` in a clip's `[a{i}]` audio chain when that clip's volume/muted differ from defaults. Batch 3 (music `amix`) appends after this chain's `[a{i}]` label, so the label name is unchanged.

- [ ] **Step 1: Write the failing test**

Add to `tests/test_ffmpeg_cmd.py`:

```python
def test_clip_volume_applies_volume_filter():
    p = Project(name="r",
                media_library=[MediaItem(id="m0", file_path="a.mp4", duration=2, has_audio=True)],
                clips=[ClipLayer(media_id="m0", file_path="a.mp4", in_point=0, out_point=2, order=0, volume=1.5)])
    fc = build_export_cmd(p, "out.mp4")[build_export_cmd(p, "out.mp4").index("-filter_complex") + 1]
    assert "volume=1.5" in fc
    assert "[0:a]atrim=start=0:end=2,asetpts=PTS-STARTPTS,volume=1.5[a0];" in fc

def test_clip_default_volume_emits_no_volume_filter():
    cmd = build_export_cmd(proj(), "out.mp4")
    fc = cmd[cmd.index("-filter_complex") + 1]
    assert "volume=" not in fc
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/Scripts/python -m pytest tests/test_ffmpeg_cmd.py -k clip_volume -v`
Expected: FAIL — `test_clip_volume_applies_volume_filter` fails (no `volume=1.5` in the filter graph); `test_clip_default_volume_emits_no_volume_filter` currently passes trivially (no volume support yet at all) but re-run it after Step 3 to confirm it still passes.

- [ ] **Step 3: Add the volume filter segment**

In `app/ffmpeg_cmd.py`, replace the `if has_audio:` branch (current lines 47-49):

```python
        if has_audio:
            atempo = f",atempo={_num(c.speed)}" if c.speed != 1.0 else ""
            volume_filter = "" if c.volume == 1.0 else f",volume={_num(c.volume)}"
            parts.append(f"[{v_idx}:a]atrim=start={_num(c.in_point)}:end={_num(c.out_point)},asetpts=PTS-STARTPTS{atempo}{volume_filter}[a{i}];")
```

- [ ] **Step 4: Run test to verify it passes**

Run: `.venv/Scripts/python -m pytest tests/test_ffmpeg_cmd.py -k clip_volume -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/ffmpeg_cmd.py tests/test_ffmpeg_cmd.py
git commit -m "feat: apply per-clip volume filter in export audio chain"
```

---

### Task 2: Muted clip forces `volume=0`, overriding any set volume

**Files:**
- Modify: `app/ffmpeg_cmd.py` (same audio-chain segment as Task 1)
- Test: `tests/test_ffmpeg_cmd.py`

**Interfaces:**
- Consumes: `ClipLayer.muted: bool` (Batch 1).

- [ ] **Step 1: Write the failing test**

Add to `tests/test_ffmpeg_cmd.py`:

```python
def test_muted_clip_forces_volume_zero():
    p = Project(name="r",
                media_library=[MediaItem(id="m0", file_path="a.mp4", duration=2, has_audio=True)],
                clips=[ClipLayer(media_id="m0", file_path="a.mp4", in_point=0, out_point=2, order=0, volume=1.5, muted=True)])
    fc = build_export_cmd(p, "out.mp4")[build_export_cmd(p, "out.mp4").index("-filter_complex") + 1]
    assert "volume=0" in fc
    assert "volume=1.5" not in fc

def test_muted_clip_with_default_volume_still_forces_volume_zero():
    p = Project(name="r",
                media_library=[MediaItem(id="m0", file_path="a.mp4", duration=2, has_audio=True)],
                clips=[ClipLayer(media_id="m0", file_path="a.mp4", in_point=0, out_point=2, order=0, muted=True)])
    fc = build_export_cmd(p, "out.mp4")[build_export_cmd(p, "out.mp4").index("-filter_complex") + 1]
    assert ",volume=0[a0];" in fc
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/Scripts/python -m pytest tests/test_ffmpeg_cmd.py -k muted_clip -v`
Expected: FAIL — muted currently has no effect on the filter graph.

- [ ] **Step 3: Make `muted` override the volume filter**

In `app/ffmpeg_cmd.py`, update the `if has_audio:` branch again:

```python
        if has_audio:
            atempo = f",atempo={_num(c.speed)}" if c.speed != 1.0 else ""
            if c.muted:
                volume_filter = ",volume=0"
            elif c.volume != 1.0:
                volume_filter = f",volume={_num(c.volume)}"
            else:
                volume_filter = ""
            parts.append(f"[{v_idx}:a]atrim=start={_num(c.in_point)}:end={_num(c.out_point)},asetpts=PTS-STARTPTS{atempo}{volume_filter}[a{i}];")
```

- [ ] **Step 4: Run test to verify it passes**

Run: `.venv/Scripts/python -m pytest tests/test_ffmpeg_cmd.py -k muted_clip -v`
Expected: PASS

- [ ] **Step 5: Run the volume-related tests and the video-only-clip regression tests together**

Run: `.venv/Scripts/python -m pytest tests/test_ffmpeg_cmd.py -k "volume or muted or video_only or mixed_audio" -v`
Expected: All PASS — confirms the synthesized-silence branch (untouched) still emits no volume filter and doesn't collide with the new code path.

- [ ] **Step 6: Commit**

```bash
git add app/ffmpeg_cmd.py tests/test_ffmpeg_cmd.py
git commit -m "fix: muted clip overrides volume, forces volume=0 filter"
```

---

### Task 3: Full regression pass + update file header comment

**Files:**
- Modify: `app/ffmpeg_cmd.py:1-7` (header comment)
- Test: `tests/test_ffmpeg_cmd.py` (full file, no new tests)

- [ ] **Step 1: Update the file header comment**

In `app/ffmpeg_cmd.py`, extend the header comment (currently lines 1-7) to mention volume:

```python
# Pure ffmpeg export-command builder: per-clip trim/scale/pad-or-crop (branched on ClipLayer.fill_mode:
# "fit" letterboxes, "fill" center-crops), concat with silent-audio synthesis for video-only clips,
# optional ASS burn or banded chain alternating ASS burn-in with video-box overlays.
# CRF is derived from Project.export_quality ("high" -> 18, "medium" -> 23, default 18).
# Per-clip ClipLayer.speed (!= 1.0) scales video pace via setpts=(PTS-STARTPTS)/speed and real audio
# via atempo=speed (both in build_export_cmd and build_audio_cmd); synthesized silence duration is
# scaled by 1/speed to match. At speed == 1.0 the emitted commands are byte-identical to the pre-speed baseline.
# Per-clip ClipLayer.volume/muted apply a `volume=<v>` filter to each clip's real audio chain
# (muted forces volume=0, overriding any set volume); the synthesized-silence path needs no
# volume filter. At volume == 1.0 and muted == False, no filter is emitted (byte-identical baseline).
```

- [ ] **Step 2: Run the full ffmpeg_cmd test file**

Run: `.venv/Scripts/python -m pytest tests/test_ffmpeg_cmd.py -v`
Expected: All PASS (no regressions across every existing test — fill_mode, bands, speed, quality, caption ASS chaining, etc.).

- [ ] **Step 3: Commit**

```bash
git add app/ffmpeg_cmd.py
git commit -m "docs: note per-clip volume/mute in ffmpeg_cmd.py header"
```

---

## Batch 2 Definition of Done

- [ ] `.venv/Scripts/python -m pytest -q` passes (full suite).
- [ ] Default clips (`volume=1.0`, `muted=False`) produce byte-identical `-filter_complex` output to pre-batch baseline.
- [ ] All changes committed.

Next: [Batch 3: Export — music input + amix](2026-07-21-audio-batch-3-export-music.md).

### Task 4: ffmpeg banded export filter graph + route wiring

**Status:** not started

**Depends on:** Task 1 (merged, for `VideoBoxLayer`/`banded_layers`/`video_box_end`) and Task 3's `render_ass(..., text_blocks=...)` signature (agreed contract — see Task 3's Interfaces block; if dispatched in the same parallel batch before Task 3 merges, code against that exact signature and reconcile at merge). Independent of Tasks 2, 5–9.

**Files:**
- Modify: `app/ffmpeg_cmd.py`
- Modify: `app/main.py`
- Test: `tests/test_ffmpeg_cmd.py`

**Interfaces:**
- Consumes: `app.timeline.banded_layers(project) -> list[dict]` (Task 1), `app.timeline.video_box_end(v) -> float` (Task 1), `app.ass_render.render_ass(project, presets, text_blocks=None)` (Task 3).
- Produces: `app.ffmpeg_cmd.build_export_cmd(p, out_path, ass_path=None, bands=None)` — new optional `bands` parameter. `bands` items are `{"kind": "ass", "path": str}` or `{"kind": "video_box", "video_box": VideoBoxLayer}`. When `bands` is `None` (default), behavior is byte-identical to today (uses `ass_path` exactly as before). When `bands` is given, it takes over entirely — builds the alternating ASS-burn/overlay filter chain — and `ass_path` is ignored.

- [ ] **Step 1: Write failing banded-export tests**

Add to `tests/test_ffmpeg_cmd.py`:

```python
from app.models import VideoBoxLayer

def test_bands_none_matches_legacy_ass_path_behavior():
    cmd_legacy = build_export_cmd(proj(), "out.mp4", ass_path="C:/tmp/subs.ass")
    cmd_bands_none = build_export_cmd(proj(), "out.mp4", ass_path="C:/tmp/subs.ass", bands=None)
    assert cmd_legacy == cmd_bands_none

def test_bands_with_single_video_box_adds_input_and_overlay():
    box = VideoBoxLayer(media_id="m1", file_path="pip.mp4", in_point=0, out_point=3,
                         start=1.0, x=100, y=200, width=300, height=500, z_index=5)
    bands = [{"kind": "video_box", "video_box": box}]
    cmd = build_export_cmd(proj(), "out.mp4", bands=bands)
    assert "pip.mp4" in cmd
    i = cmd.index("-filter_complex"); fc = cmd[i + 1]
    assert "trim=start=0:end=3" in fc
    assert "scale=300:500" in fc
    assert "overlay=x=100:y=200" in fc
    assert "between(t\\,1\\,4)" in fc  # end = start(1.0) + (out_point(3) - in_point(0)) = 4.0

def test_bands_ass_then_video_box_then_ass_alternates_filter_chain():
    box = VideoBoxLayer(media_id="m1", file_path="pip.mp4", out_point=2, start=0, height=1920, z_index=5)
    bands = [
        {"kind": "ass", "path": "C:/tmp/band0.ass"},
        {"kind": "video_box", "video_box": box},
        {"kind": "ass", "path": "C:/tmp/band1.ass"},
    ]
    cmd = build_export_cmd(proj(), "out.mp4", bands=bands)
    fc = cmd[cmd.index("-filter_complex") + 1]
    assert "band0.ass" in fc and "band1.ass" in fc
    assert fc.index("band0.ass") < fc.index("overlay=") < fc.index("band1.ass")

def test_bands_final_map_uses_last_band_output():
    box = VideoBoxLayer(media_id="m1", file_path="pip.mp4", out_point=2, start=0, height=1920, z_index=5)
    bands = [{"kind": "video_box", "video_box": box}]
    cmd = build_export_cmd(proj(), "out.mp4", bands=bands)
    map_indices = [i for i, x in enumerate(cmd) if x == "-map"]
    assert cmd[map_indices[0] + 1] == "[ov0]"
    assert cmd[map_indices[1] + 1] == "[a]"

def test_bands_empty_list_maps_straight_from_concat():
    cmd = build_export_cmd(proj(), "out.mp4", bands=[])
    fc = cmd[cmd.index("-filter_complex") + 1]
    assert fc.rstrip().endswith("[vc][a]")
    map_indices = [i for i, x in enumerate(cmd) if x == "-map"]
    assert cmd[map_indices[0] + 1] == "[vc]"
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `.venv/Scripts/python -m pytest tests/test_ffmpeg_cmd.py -k bands -v`
Expected: FAIL — `TypeError: build_export_cmd() got an unexpected keyword argument 'bands'`

- [ ] **Step 3: Implement the banded filter graph in app/ffmpeg_cmd.py**

Replace the whole `build_export_cmd` function in `app/ffmpeg_cmd.py` with:

```python
def build_export_cmd(p: Project, out_path: str, ass_path: str | None = None, bands: list[dict] | None = None) -> list[str]:
    clips = ordered(p.clips)
    cmd = ["ffmpeg", "-y"]
    parts = []
    for i, c in enumerate(clips):
        cmd += ["-i", c.file_path]
        parts.append(
            f"[{i}:v]trim=start={_num(c.in_point)}:end={_num(c.out_point)},setpts=PTS-STARTPTS,"
            f"scale={p.width}:{p.height}:force_original_aspect_ratio=decrease,"
            f"pad={p.width}:{p.height}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps={p.fps}[v{i}];"
            f"[{i}:a]atrim=start={_num(c.in_point)}:end={_num(c.out_point)},asetpts=PTS-STARTPTS[a{i}];")
    streams = "".join(f"[v{i}][a{i}]" for i in range(len(clips)))
    fc = "".join(parts) + f"{streams}concat=n={len(clips)}:v=1:a=1[vc][a]"

    if bands is None:
        vmap = "[vc]"
        if ass_path:
            fc += f";[vc]ass='{escape_filter_path(ass_path)}':fontsdir='{escape_filter_path('static/fonts')}'[vo]"
            vmap = "[vo]"
        cmd += ["-filter_complex", fc, "-map", vmap, "-map", "[a]",
                "-c:v", "libx264", "-preset", "fast", "-crf", "18", "-c:a", "aac", out_path]
        return cmd

    current = "[vc]"
    next_input_index = len(clips)
    for step, band in enumerate(bands):
        if band["kind"] == "ass":
            out_label = f"[ass{step}]"
            fc += f";{current}ass='{escape_filter_path(band['path'])}':fontsdir='{escape_filter_path('static/fonts')}'{out_label}"
            current = out_label
        else:
            v = band["video_box"]
            cmd += ["-i", v.file_path]
            end = v.start + (v.out_point - v.in_point)
            out_label = f"[ov{step}]"
            fc += (f";[{next_input_index}:v]trim=start={_num(v.in_point)}:end={_num(v.out_point)},"
                   f"setpts=PTS-STARTPTS+{_num(v.start)}/TB,scale={v.width}:{v.height}[box{step}]"
                   f";{current}[box{step}]overlay=x={v.x}:y={v.y}:"
                   f"enable='between(t\\,{_num(v.start)}\\,{_num(end)})'{out_label}")
            current = out_label
            next_input_index += 1

    cmd += ["-filter_complex", fc, "-map", current, "-map", "[a]",
            "-c:v", "libx264", "-preset", "fast", "-crf", "18", "-c:a", "aac", out_path]
    return cmd
```

Update the module's header comment (line 1-2) to: `# Pure ffmpeg export-command builder: per-clip trim/scale/pad, concat, optional ASS burn or a` / `# banded chain alternating ASS burn-in with video-box overlay filters (see app.timeline.banded_layers).`

- [ ] **Step 4: Run tests to verify they pass**

Run: `.venv/Scripts/python -m pytest tests/test_ffmpeg_cmd.py -v`
Expected: PASS (all, including every pre-existing test)

- [ ] **Step 5: Wire the export route in app/main.py**

In `app/main.py`, add `timeline` to the existing `from app import store, media, ffmpeg_cmd, ass_render` import line (making it `from app import store, media, ffmpeg_cmd, ass_render, timeline`), then replace the body of `export_project`:

```python
@app.post("/api/projects/{pid}/export")
def export_project(pid: str) -> dict:
    p = store.load_project(pid, DATA_DIR)
    out_dir = DATA_DIR / "exports"
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / f"{p.name}-{p.id[:8]}.mp4"

    if p.video_boxes:
        bands = []
        for i, band in enumerate(timeline.banded_layers(p)):
            if band["kind"] == "text":
                ass_file = out_dir / f"{p.name}-{p.id[:8]}-band{i}.ass"
                ass_file.write_text(
                    ass_render.render_ass(p, p.text_presets, text_blocks=band["text_blocks"]),
                    encoding="utf-8")
                bands.append({"kind": "ass", "path": str(ass_file)})
            else:
                bands.append({"kind": "video_box", "video_box": band["video_box"]})
        cmd = ffmpeg_cmd.build_export_cmd(p, str(out_path), bands=bands)
    else:
        ass_path = None
        if p.text_blocks:
            ass_file = out_dir / f"{p.name}-{p.id[:8]}.ass"
            ass_file.write_text(ass_render.render_ass(p, p.text_presets), encoding="utf-8")
            ass_path = str(ass_file)
        cmd = ffmpeg_cmd.build_export_cmd(p, str(out_path), ass_path)

    media.run_export(cmd)
    return {"out_path": str(out_path)}
```

- [ ] **Step 6: Run the full test suite**

Run: `.venv/Scripts/python -m pytest -q`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add app/ffmpeg_cmd.py app/main.py tests/test_ffmpeg_cmd.py
git commit -m "feat: banded ffmpeg export graph alternates ASS burn-in with video-box overlays"
```

**Next session:** This task is independent and complete on its own — manual end-to-end verification of the actual export (requires video boxes to exist in a project, which needs Tasks 8/10) happens at the Task 10 integration checkpoint, not here. If continuing in the same session, move to Task 5 (`docs/superpowers/plans/2026-07-19-phase-3-video-box/task-5-ui-video-box-drag.md`), which is unrelated/independent. If dispatching separately, this should be subagent-driven with the same prompt shape as the other Batch 2 tasks.

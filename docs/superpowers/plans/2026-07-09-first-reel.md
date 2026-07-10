# First Reel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A local web editor that assembles 4–6 mp4 clips into one vertical reel with trim, editable karaoke captions, and a preset-styled heading+subheading block, exported to 1080×1920 mp4.

**Architecture:** FastAPI backend serving a vanilla-JS browser UI; all editing state in a JSON-persisted Pydantic project model; ffmpeg does trim/concat/burn-in via a generated ASS subtitle file; faster-whisper (CUDA) produces word-level timestamps.

**Tech Stack:** Python 3.12+, FastAPI, uvicorn, pydantic, pytest, ffmpeg/ffprobe (on PATH), faster-whisper, vanilla HTML/JS/CSS. Styling: hand-rolled design system per `docs/superpowers/specs/2026-07-10-design-foundation-design.md` — CSS custom properties in `static/css/tokens.css`, one component per file under `static/css/components/`, vendored fonts. No CSS framework, no build step (Pico.css was adopted then dropped in Task 5b).

**Progress (2026-07-10):** Tasks 1–5 complete and committed. Unplanned additions landed since: native file picker (`GET /api/pick-file`, spec `2026-07-09-native-file-picker-design.md`), Pico.css adoption (reversed by Task 5b). **Next up: Task 5b (design foundation), then Task 6.**

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-09-first-reel-design.md` — read it first.
- Every source file starts with a 2–3 line header comment (what it does, what it exposes, key dependencies).
- One purpose per file, ~100–400 lines; never add features to a file over 400 lines.
- `app/main.py` is composition only — no feature logic, ever.
- Every task: tests pass (`pytest -q`), codebase map in `CLAUDE.md` updated in the same commit, commit on branch `session/first-reel-plan` (or a successor session branch), push. Never commit to main.
- UI JS is a stated untested layer: keep it thin, verify manually via the "See it" step in each task.
- Keep the app running throughout each session (`uvicorn app.main:app --reload`, browser preview open) so the user can watch progress live as each step lands, not just at the "See it" checkpoint.
- No secrets in code. All processing local.
- Canvas is fixed 1080×1920 @ 30fps. Font for everything: Arial (present on Windows, keeps preview/export parity).
- Hardcoded caption style (used in Tasks 10–12): Arial 72px, white `#FFFFFF`, black outline 4px, bottom-center at y=1520 of 1920, max 4 words per caption line, karaoke highlight color `#FFD400`.

## File Structure

```
app/
  __init__.py       # package marker
  main.py           # FastAPI app wiring only (routes -> modules, static mount)
  models.py         # Pydantic data model (Project, ClipLayer, TextPreset, TextBlockLayer, CaptionWord, CaptionTrack)
  store.py          # load/save project JSON + global presets.json
  timeline.py       # pure sequence math (durations, ordering)
  ass_render.py     # generate ASS subtitle text (text block + karaoke captions)
  ffmpeg_cmd.py     # pure ffmpeg/ffprobe command building
  media.py          # run ffprobe/ffmpeg subprocesses, serve media files
  transcribe.py     # faster-whisper wrapper -> CaptionWords
static/
  index.html        # editor page skeleton
  editor.js         # UI state + API calls + DOM wiring (thin)
  preview.js        # 9:16 stage playback: clip sequencing, text overlay, karaoke tick (thin)
  css/
    tokens.css      # :root custom properties (colors, fonts, spacing, radius) — single source of truth
    base.css        # reset + element defaults built on the tokens
    layout.css      # app shell: top bar, left panel, stage area grid
    components/     # one file per component (panel.css, stage.css, ... as features land)
  fonts/            # vendored woff2: JetBrains Mono (UI chrome), Public Sans (content)
tests/
  test_models.py
  test_store.py
  test_timeline.py
  test_ass_render.py
  test_ffmpeg_cmd.py
  test_transcribe.py
data/               # gitignored: projects/*.json, presets.json, exports/
```

---

### Task 1: Data model + store (foundation — visible = pytest green)

**Files:**
- Create: `pyproject.toml`, `.gitignore`, `app/__init__.py`, `app/models.py`, `app/store.py`, `tests/test_models.py`, `tests/test_store.py`, `CLAUDE.md` (codebase map)

**Interfaces:**
- Produces: `models.Project`, `models.ClipLayer(file_path, in_point, out_point, order)`, `models.TextPreset`, `models.TextBlockLayer`, `models.CaptionWord`, `models.CaptionTrack`, `models.new_id() -> str`; `store.save_project(p, data_dir)`, `store.load_project(project_id, data_dir) -> Project`, `store.load_presets(data_dir) -> list[TextPreset]`, `store.save_preset(preset, data_dir)`

- [x] **Step 1: Bootstrap.** Create `pyproject.toml`:

```toml
[project]
name = "tiktok-reels"
version = "0.1.0"
requires-python = ">=3.12"
dependencies = ["fastapi", "uvicorn[standard]", "pydantic", "python-multipart"]

[project.optional-dependencies]
dev = ["pytest", "httpx"]
ml = ["faster-whisper"]
```

`.gitignore`: `data/`, `__pycache__/`, `*.pyc`, `.venv/`, `venv/`. Create venv and install: `python -m venv .venv && .venv/Scripts/pip install -e .[dev]`

- [x] **Step 2: Write failing tests** in `tests/test_models.py`:

```python
# Tests for app.models: entity construction, IDs, JSON round-trip.
from app.models import Project, ClipLayer, TextPreset, TextBlockLayer, CaptionTrack, CaptionWord

def test_ids_are_unique():
    a, b = ClipLayer(file_path="a.mp4", in_point=0, out_point=5, order=0), ClipLayer(file_path="b.mp4", in_point=0, out_point=5, order=1)
    assert a.id != b.id and len(a.id) == 32

def test_project_defaults():
    p = Project(name="reel1")
    assert (p.width, p.height, p.fps) == (1080, 1920, 30)
    assert p.clips == [] and p.text_blocks == [] and p.captions is None

def test_json_round_trip():
    p = Project(name="reel1", clips=[ClipLayer(file_path="a.mp4", in_point=1.0, out_point=4.5, order=0)],
                text_blocks=[TextBlockLayer(heading="H", subheading="s", preset_id="x", start=0, end=3)],
                captions=CaptionTrack(words=[CaptionWord(text="hi", t_start=0.1, t_end=0.4)]))
    assert Project.model_validate_json(p.model_dump_json()) == p
```

And `tests/test_store.py`:

```python
# Tests for app.store: project and preset persistence to JSON files.
from app.models import Project, TextPreset
from app.store import save_project, load_project, save_preset, load_presets

def test_project_round_trip(tmp_path):
    p = Project(name="reel1")
    save_project(p, tmp_path)
    assert load_project(p.id, tmp_path) == p

def test_presets_accumulate_and_update(tmp_path):
    a = TextPreset(name="Pop")
    save_preset(a, tmp_path)
    save_preset(TextPreset(name="Clean"), tmp_path)
    assert {x.name for x in load_presets(tmp_path)} == {"Pop", "Clean"}
    a.size_px = 120
    save_preset(a, tmp_path)  # same id -> update, not duplicate
    assert [x.size_px for x in load_presets(tmp_path) if x.id == a.id] == [120]
```

- [x] **Step 3: Run, verify FAIL** — `pytest -q` → import errors.
- [x] **Step 4: Implement** `app/models.py`:

```python
# Data model for the editor: Project, clip/text/caption layers, savable text presets.
# Exposes Pydantic models with uuid4 ids and JSON round-trip via pydantic.
from uuid import uuid4
from pydantic import BaseModel, Field

def new_id() -> str:
    return uuid4().hex

class ClipLayer(BaseModel):
    id: str = Field(default_factory=new_id)
    file_path: str
    in_point: float = 0.0   # seconds into source
    out_point: float        # seconds into source (exclusive end)
    order: int

class TextPreset(BaseModel):
    id: str = Field(default_factory=new_id)
    name: str
    font: str = "Arial"
    size_px: int = 96
    color: str = "#FFFFFF"
    outline_color: str = "#000000"
    outline_px: int = 4
    box: bool = False
    box_color: str = "#000000"
    align: str = "center"          # left|center|right
    x: int = 540                   # anchor on 1080x1920 canvas
    y: int = 700
    entrance: str = "fade_pop"     # fade_pop|none

class TextBlockLayer(BaseModel):
    id: str = Field(default_factory=new_id)
    heading: str
    subheading: str = ""
    preset_id: str
    start: float = 0.0             # timeline seconds
    end: float = 3.0

class CaptionWord(BaseModel):
    id: str = Field(default_factory=new_id)
    text: str
    t_start: float
    t_end: float

class CaptionTrack(BaseModel):
    id: str = Field(default_factory=new_id)
    words: list[CaptionWord] = []

class Project(BaseModel):
    id: str = Field(default_factory=new_id)
    name: str
    width: int = 1080
    height: int = 1920
    fps: int = 30
    clips: list[ClipLayer] = []
    text_blocks: list[TextBlockLayer] = []
    captions: CaptionTrack | None = None
```

`app/store.py`:

```python
# Persistence: one JSON file per project under <data>/projects, global <data>/presets.json.
# Exposes save/load for projects and presets. Depends on app.models.
import json
from pathlib import Path
from app.models import Project, TextPreset

def _projects_dir(data_dir) -> Path:
    d = Path(data_dir) / "projects"; d.mkdir(parents=True, exist_ok=True); return d

def save_project(p: Project, data_dir) -> None:
    (_projects_dir(data_dir) / f"{p.id}.json").write_text(p.model_dump_json(indent=2), encoding="utf-8")

def load_project(project_id: str, data_dir) -> Project:
    return Project.model_validate_json((_projects_dir(data_dir) / f"{project_id}.json").read_text(encoding="utf-8"))

def _presets_path(data_dir) -> Path:
    Path(data_dir).mkdir(parents=True, exist_ok=True); return Path(data_dir) / "presets.json"

def load_presets(data_dir) -> list[TextPreset]:
    p = _presets_path(data_dir)
    if not p.exists(): return []
    return [TextPreset.model_validate(x) for x in json.loads(p.read_text(encoding="utf-8"))]

def save_preset(preset: TextPreset, data_dir) -> None:
    items = [x for x in load_presets(data_dir) if x.id != preset.id] + [preset]
    _presets_path(data_dir).write_text(json.dumps([x.model_dump() for x in items], indent=2), encoding="utf-8")
```

- [x] **Step 5: Run, verify PASS** — `pytest -q`.
- [x] **Step 6: Write `CLAUDE.md`** with the codebase map from the plan's File Structure section (mark unbuilt files "planned"), plus inventory entries for `models.py` and `store.py`, and the run commands (`pytest -q`, `uvicorn app.main:app` once it exists).
- [x] **Step 7: Commit + push** — `git add -A && git commit -m "feat: data model and JSON store" && git push -u origin session/first-reel-plan`

---

### Task 2: Serve editor, add a clip, see it play (first visible product)

**Files:**
- Create: `app/main.py`, `app/media.py`, `static/index.html`, `static/editor.js`, `static/preview.js`, `static/style.css`
- Test: `tests/test_media.py` (ffprobe cmd is pure; subprocess call mocked)

**Interfaces:**
- Consumes: Task 1 models/store.
- Produces: `media.probe_duration(path) -> float`; `media.ffprobe_cmd(path) -> list[str]`; HTTP: `POST /api/projects {name}` → Project JSON; `GET/PUT /api/projects/{id}` (PUT replaces whole validated Project — editor state lives client-side); `GET /media?path=...` → video file; `GET /` → editor page. `DATA_DIR = Path("data")` defined in `app/main.py`.

- [x] **Step 1: Failing test** `tests/test_media.py`:

```python
# Tests for app.media: ffprobe command construction and duration parsing.
from unittest.mock import patch
from app.media import ffprobe_cmd, probe_duration

def test_ffprobe_cmd():
    assert ffprobe_cmd("c.mp4") == ["ffprobe", "-v", "error", "-show_entries", "format=duration",
                                    "-of", "default=noprint_wrappers=1:nokey=1", "c.mp4"]

def test_probe_duration_parses_stdout():
    with patch("app.media.subprocess.run") as r:
        r.return_value.stdout = "12.48\n"
        assert probe_duration("c.mp4") == 12.48
```

- [x] **Step 2: Run, verify FAIL.**
- [x] **Step 3: Implement** `app/media.py`:

```python
# Media helpers: ffprobe duration probing and safe local file serving for preview.
# Exposes ffprobe_cmd, probe_duration, media_response. Depends on ffprobe on PATH.
import subprocess
from pathlib import Path
from fastapi import HTTPException
from fastapi.responses import FileResponse

def ffprobe_cmd(path: str) -> list[str]:
    return ["ffprobe", "-v", "error", "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1", path]

def probe_duration(path: str) -> float:
    out = subprocess.run(ffprobe_cmd(path), capture_output=True, text=True, check=True)
    return float(out.stdout.strip())

def media_response(path: str) -> FileResponse:
    p = Path(path)
    if not p.is_file():
        raise HTTPException(404, f"not found: {path}")
    return FileResponse(p)
```

`app/main.py` (wiring only):

```python
# FastAPI composition root: mounts static UI and wires API routes to modules.
# No feature logic lives here. Run: uvicorn app.main:app --reload
from pathlib import Path
from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from app.models import Project
from app import store, media

DATA_DIR = Path("data")
app = FastAPI()

@app.get("/")
def index():
    return FileResponse("static/index.html")

@app.post("/api/projects")
def create_project(body: dict) -> Project:
    p = Project(name=body.get("name", "reel"))
    store.save_project(p, DATA_DIR)
    return p

@app.get("/api/projects/{pid}")
def get_project(pid: str) -> Project:
    return store.load_project(pid, DATA_DIR)

@app.put("/api/projects/{pid}")
def put_project(pid: str, p: Project) -> Project:
    store.save_project(p, DATA_DIR)
    return p

@app.get("/api/probe")
def probe(path: str) -> dict:
    return {"duration": media.probe_duration(path)}

@app.get("/media")
def media_file(path: str):
    return media.media_response(path)

app.mount("/static", StaticFiles(directory="static"), name="static")
```

`static/index.html`:

```html
<!-- Editor page: 9:16 preview stage, clip list, controls. Logic in editor.js/preview.js. -->
<!doctype html><html><head><meta charset="utf-8"><title>Reels Editor</title>
<link rel="stylesheet" href="/static/style.css"></head><body>
<main>
  <section id="stage-wrap"><div id="stage"><video id="player"></video><div id="overlay"></div></div>
    <div id="transport"><button id="play">▶</button><span id="time">0.0</span></div></section>
  <aside id="panel">
    <h2>Clips</h2>
    <input id="clip-path" placeholder="C:\path\to\clip.mp4"><button id="add-clip">Add clip</button>
    <ol id="clip-list"></ol>
  </aside>
</main>
<script src="/static/preview.js"></script><script src="/static/editor.js"></script>
</body></html>
```

`static/style.css` — dark editor layout; `#stage` is a 270×480 (scaled 1080×1920) black box, `position:relative`; `#player` fills it (`width:100%;height:100%;object-fit:contain`); `#overlay` absolutely positioned over it; `main` is a flex row with the panel on the right.

`static/editor.js` (thin): on load, `POST /api/projects` (or reuse `localStorage.projectId` via `GET`, falling back to create); `saveProject()` does `PUT /api/projects/{id}` with the in-memory project after every mutation. "Add clip" → `GET /api/probe?path=...` → push `{id: crypto.randomUUID().replaceAll('-',''), file_path, in_point: 0, out_point: duration, order: clips.length}` → save → render `#clip-list` → `Preview.load(project)`.

`static/preview.js` (thin): `Preview.load(project)` keeps the clip array; single-clip playback for now — `#player.src = '/media?path=' + encodeURIComponent(clips[0].file_path)`; play button toggles; `timeupdate` updates `#time`.

- [x] **Step 4: Run tests PASS** — `pytest -q`.
- [x] **Step 5: See it.** `uvicorn app.main:app --reload` → open http://127.0.0.1:8000 → paste a real mp4 path → **your clip plays inside the vertical stage.**
- [x] **Step 6: Update CLAUDE.md map/inventory; commit + push** — `git commit -m "feat: editor page plays a clip in 9:16 stage"`.

---

### Task 3: Sequence 4–6 clips, played back-to-back

**Files:**
- Create: `app/timeline.py`, `tests/test_timeline.py`
- Modify: `static/preview.js`, `static/editor.js`

**Interfaces:**
- Consumes: `ClipLayer` from Task 1.
- Produces: `timeline.ordered(clips) -> list[ClipLayer]`, `timeline.clip_duration(c) -> float`, `timeline.sequence_duration(clips) -> float`, `timeline.locate(clips, t) -> tuple[ClipLayer, float]` (timeline time → clip + source-time). JS mirrors `locate` in `preview.js`.

- [x] **Step 1: Failing tests** `tests/test_timeline.py`:

```python
# Tests for app.timeline: pure sequence math over ordered, trimmed clips.
import pytest
from app.models import ClipLayer
from app.timeline import ordered, clip_duration, sequence_duration, locate

def c(i, o, order): return ClipLayer(file_path=f"{order}.mp4", in_point=i, out_point=o, order=order)

def test_math():
    clips = [c(0, 4, 1), c(2, 5, 0)]         # unordered on purpose
    assert [x.order for x in ordered(clips)] == [0, 1]
    assert clip_duration(clips[1]) == 3.0
    assert sequence_duration(clips) == 7.0

def test_locate_maps_timeline_to_source():
    clips = [c(2, 5, 0), c(0, 4, 1)]          # durations 3 and 4
    clip, src = locate(clips, 1.0);  assert (clip.order, src) == (0, 3.0)   # 2 + 1
    clip, src = locate(clips, 3.0);  assert (clip.order, src) == (1, 0.0)   # boundary -> next clip
    clip, src = locate(clips, 6.9);  assert clip.order == 1 and src == pytest.approx(3.9)

def test_locate_out_of_range():
    with pytest.raises(ValueError): locate([c(0, 2, 0)], 2.5)
```

- [x] **Step 2: Run, verify FAIL.**
- [x] **Step 3: Implement** `app/timeline.py`:

```python
# Pure timeline math: order clips, durations, map timeline time to (clip, source time).
# Exposes ordered, clip_duration, sequence_duration, locate. Depends on app.models.
from app.models import ClipLayer

def ordered(clips: list[ClipLayer]) -> list[ClipLayer]:
    return sorted(clips, key=lambda c: c.order)

def clip_duration(c: ClipLayer) -> float:
    return c.out_point - c.in_point

def sequence_duration(clips: list[ClipLayer]) -> float:
    return sum(clip_duration(c) for c in clips)

def locate(clips: list[ClipLayer], t: float) -> tuple[ClipLayer, float]:
    acc = 0.0
    for c in ordered(clips):
        d = clip_duration(c)
        if t < acc + d:
            return c, c.in_point + (t - acc)
        acc += d
    raise ValueError(f"t={t} beyond sequence end {acc}")
```

- [x] **Step 4: Run tests PASS.**
- [x] **Step 5: Preview sequencing (JS, thin).** In `preview.js`: keep `timelineTime`; on `timeupdate`, when the current clip's `out_point` is reached, switch `#player.src` to the next clip and seek to its `in_point` (`onloadedmetadata` → `currentTime = in_point` → `play()`); mirror `locate` for the transport display. `editor.js`: list shows all clips with order and ▲▼ reorder buttons (swap `order`, save, reload preview).
- [x] **Step 6: See it.** Add 4–6 clips → press play → **they play as one continuous reel** (a brief hiccup at joins is acceptable in preview; export will be seamless).
- [x] **Step 7: Update map; commit + push** — `git commit -m "feat: sequential multi-clip timeline in preview"`.

---

### Task 4: Export the assembled reel to one mp4

**Files:**
- Create: `app/ffmpeg_cmd.py`, `tests/test_ffmpeg_cmd.py`
- Modify: `app/media.py` (run export), `app/main.py` (route), `static/editor.js` (button)

**Interfaces:**
- Consumes: `Project`, `timeline.ordered`.
- Produces: `ffmpeg_cmd.build_export_cmd(project, out_path, ass_path=None) -> list[str]`; `media.run_export(cmd) -> None` (raises `RuntimeError` with ffmpeg stderr on failure); HTTP `POST /api/projects/{pid}/export` → `{"out_path": ...}` writing to `data/exports/<name>-<id8>.mp4`.

- [x] **Step 1: Failing tests** `tests/test_ffmpeg_cmd.py`:

```python
# Tests for app.ffmpeg_cmd: pure construction of the trim+concat+burn export command.
from app.models import Project, ClipLayer
from app.ffmpeg_cmd import build_export_cmd, escape_filter_path

def proj():
    return Project(name="r", clips=[ClipLayer(file_path="b.mp4", in_point=1, out_point=3, order=1),
                                    ClipLayer(file_path="a.mp4", in_point=0, out_point=2, order=0)])

def test_inputs_in_order_and_trim_filters():
    cmd = build_export_cmd(proj(), "out.mp4")
    assert cmd[:1] == ["ffmpeg"] and cmd[-1] == "out.mp4"
    i = cmd.index("-filter_complex"); fc = cmd[i + 1]
    assert cmd[cmd.index("-i") + 1] == "a.mp4"                      # order 0 first
    assert "trim=start=1:end=3" in fc and "concat=n=2:v=1:a=1" in fc
    assert "scale=1080:1920:force_original_aspect_ratio=decrease" in fc

def test_ass_burn_appended_when_given():
    fc = build_export_cmd(proj(), "out.mp4", ass_path="C:/tmp/subs.ass")[  # ass filter chained after concat
        build_export_cmd(proj(), "out.mp4", ass_path="C:/tmp/subs.ass").index("-filter_complex") + 1]
    assert "ass='C\\:/tmp/subs.ass'" in fc

def test_escape_filter_path():
    assert escape_filter_path("C:\\tmp\\s.ass") == "C\\:/tmp/s.ass"
```

- [x] **Step 2: Run, verify FAIL.**
- [x] **Step 3: Implement** `app/ffmpeg_cmd.py`:

```python
# Pure ffmpeg export-command builder: per-clip trim, scale/pad to 1080x1920, concat, optional ASS burn.
# Exposes build_export_cmd, escape_filter_path. No subprocess here (see app.media).
from app.models import Project
from app.timeline import ordered

def escape_filter_path(path: str) -> str:
    return path.replace("\\", "/").replace(":", "\\:")

def build_export_cmd(p: Project, out_path: str, ass_path: str | None = None) -> list[str]:
    clips = ordered(p.clips)
    cmd = ["ffmpeg", "-y"]
    parts = []
    for i, c in enumerate(clips):
        cmd += ["-i", c.file_path]
        parts.append(
            f"[{i}:v]trim=start={c.in_point}:end={c.out_point},setpts=PTS-STARTPTS,"
            f"scale={p.width}:{p.height}:force_original_aspect_ratio=decrease,"
            f"pad={p.width}:{p.height}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps={p.fps}[v{i}];"
            f"[{i}:a]atrim=start={c.in_point}:end={c.out_point},asetpts=PTS-STARTPTS[a{i}];")
    streams = "".join(f"[v{i}][a{i}]" for i in range(len(clips)))
    fc = "".join(parts) + f"{streams}concat=n={len(clips)}:v=1:a=1[vc][a]"
    vmap = "[vc]"
    if ass_path:
        fc += f";[vc]ass='{escape_filter_path(ass_path)}'[vo]"
        vmap = "[vo]"
    cmd += ["-filter_complex", fc, "-map", vmap, "-map", "[a]",
            "-c:v", "libx264", "-preset", "fast", "-crf", "18", "-c:a", "aac", out_path]
    return cmd
```

- [x] **Step 4: Run tests PASS.**
- [x] **Step 5: Wire it.** `media.run_export(cmd)`: `subprocess.run(cmd, capture_output=True, text=True)`; on nonzero returncode raise `RuntimeError(proc.stderr[-2000:])`. Route in `main.py`: load project → `out = Path("data/exports"); out.mkdir(parents=True, exist_ok=True)` → `build_export_cmd` → `run_export` → return path. `editor.js`: "Export" button → POST → show returned path (and a `<a href="/media?path=...">download</a>` link).
- [x] **Step 6: See it.** Export → **play the mp4: one seamless 1080×1920 reel of your clips.** Confirm it matches the preview sequence.
- [x] **Step 7: Update map; commit + push** — `git commit -m "feat: export assembled reel via ffmpeg"`.

---

### Task 5: Trim clips (cutting), honored in preview and export

**Files:**
- Modify: `static/editor.js`, `static/preview.js`

**Interfaces:**
- Consumes: `ClipLayer.in_point/out_point` (already respected by `timeline.locate` and `build_export_cmd` — this task is UI only).

- [x] **Step 1: Trim UI (thin).** Per clip in the list: numeric in/out fields (seconds, step 0.1) + "Set in/out from playhead" buttons that copy the player's current source time. Clamp `0 <= in < out <= duration`; the clamp lives in one small pure JS function `clampTrim(inP, outP, dur)` at the top of `editor.js`.
- [x] **Step 2: Preview honors trim** — already does via Task 3's clip switching (start at `in_point`, switch at `out_point`); verify after edits `Preview.load(project)` is re-called.
- [x] **Step 3: See it.** Cut dead air off two clips → play: **preview skips the trimmed parts** → export → **the mp4 is the tightened reel.**
- [x] **Step 4: Commit + push** — `git commit -m "feat: per-clip trim honored in preview and export"`. (Backend untouched → tests still green; run `pytest -q` anyway.)

---

### Task 5b: Design foundation — hand-rolled tokens, Pico removed (added 2026-07-10)

**Spec:** `docs/superpowers/specs/2026-07-10-design-foundation-design.md` — read it first; it holds the approved token values (colors, fonts, spacing) and all decisions. North star is the "Local Reel Editor" mockup.

**Files:**
- Create: `static/css/tokens.css`, `static/css/base.css`, `static/css/layout.css`, `static/css/components/panel.css`, `static/css/components/stage.css`, `static/fonts/` (JetBrains Mono + Public Sans woff2)
- Modify: `static/index.html` (swap Pico link for new CSS, semantic class names, add top bar with app/project name + relocated export button), `static/editor.js`/`static/preview.js` (class-name hooks only)
- Delete: `static/pico.min.css`, `static/style.css` (surviving editor rules migrate into the new files)

**Interfaces:**
- Produces: the design-token layer (`:root` custom properties) every later screen (Tasks 7–12 UI) builds on. No API or model changes.

- [x] **Step 1: Tokens + fonts.** Write `tokens.css` with the spec's palette/type/spacing variables and `@font-face` for the vendored woff2 files.
- [x] **Step 2: Base + layout.** `base.css` (reset, body/button/input defaults) and `layout.css` (top bar, left panel, stage grid per mockup).
- [x] **Step 3: Components.** `panel.css` (media/clip panel + clip rows), `stage.css` (9:16 stage + transport). Migrate surviving `style.css` rules; delete `style.css` and `pico.min.css`; update `index.html`.
- [x] **Step 4: Verify.** `pytest -q` still green (guards HTML/JS breakage). Load http://127.0.0.1:8000 with real clips; screenshot vs mockup. Stated untested layer: visual styling (manual verification, no logic to unit test).
- [x] **Step 5: Update map; commit + push** — `git commit -m "feat: hand-rolled design foundation from mockup, Pico removed"`.

**Note for later tasks:** wherever Tasks 6–12 mention `style.css`, styles now go into the matching file under `static/css/` (new component → new file in `components/`). The Global Constraints "Font for everything: Arial" rule still governs *canvas* text (preview/export parity); UI chrome uses the token fonts.

---

### Task 6: ASS renderer for the text block (foundation — visible = pytest green)

**Files:**
- Create: `app/ass_render.py`, `tests/test_ass_render.py`

**Interfaces:**
- Consumes: `TextBlockLayer`, `TextPreset`, `Project`.
- Produces: `ass_render.render_ass(project, presets: dict[str, TextPreset]) -> str` (full ASS file: styles + dialogue for all text blocks; captions added in Task 12); helpers `ass_time(seconds) -> str`, `hex_to_ass(hex_color) -> str`.

- [ ] **Step 1: Failing tests** `tests/test_ass_render.py`:

```python
# Tests for app.ass_render: ASS time/color helpers and text-block dialogue generation.
from app.models import Project, TextBlockLayer, TextPreset
from app.ass_render import ass_time, hex_to_ass, render_ass

def test_helpers():
    assert ass_time(83.456) == "0:01:23.45"
    assert hex_to_ass("#FFD400") == "&H0000D4FF"        # AABBGGRR, alpha 00

def test_text_block_dialogue():
    pr = TextPreset(name="Pop", size_px=96, x=540, y=700)
    p = Project(name="r", text_blocks=[TextBlockLayer(heading="BIG NEWS", subheading="small news", preset_id=pr.id, start=1.0, end=4.0)])
    out = render_ass(p, {pr.id: pr})
    assert "PlayResX: 1080" in out and "PlayResY: 1920" in out
    line = next(l for l in out.splitlines() if l.startswith("Dialogue:") and "BIG NEWS" in l)
    assert "0:00:01.00" in line and "0:00:04.00" in line
    assert "\\pos(540,700)" in line and "\\fad(200,0)" in line          # fade_pop entrance
    assert "\\t(0,200,\\fscx100\\fscy100)" in line and "\\fscx80\\fscy80" in line
    assert "BIG NEWS\\Nsmall news" in line                               # one unit, one entrance

def test_entrance_none_has_no_fad():
    pr = TextPreset(name="Plain", entrance="none")
    p = Project(name="r", text_blocks=[TextBlockLayer(heading="H", preset_id=pr.id, start=0, end=2)])
    assert "\\fad" not in render_ass(p, {pr.id: pr})
```

- [ ] **Step 2: Run, verify FAIL.**
- [ ] **Step 3: Implement** `app/ass_render.py`:

```python
# Generates the ASS subtitle file burned into exports: text-block dialogues (+captions, Task 12).
# Exposes render_ass, ass_time, hex_to_ass. Consumed by the export route; rendered by libass.
from app.models import Project, TextPreset

def ass_time(s: float) -> str:
    cs = int(s * 100)  # truncate to centiseconds (ASS precision)
    h, rem = divmod(cs, 360000); m, rem = divmod(rem, 6000); sec, cs = divmod(rem, 100)
    return f"{h}:{m:02d}:{sec:02d}.{cs:02d}"

def hex_to_ass(color: str) -> str:
    r, g, b = color[1:3], color[3:5], color[5:7]
    return f"&H00{b}{g}{r}".upper()

def _style(name: str, p: TextPreset) -> str:
    border = 3 if p.box else 1
    return (f"Style: {name},{p.font},{p.size_px},{hex_to_ass(p.color)},{hex_to_ass(p.color)},"
            f"{hex_to_ass(p.outline_color if not p.box else p.box_color)},{hex_to_ass(p.box_color)},"
            f"-1,0,0,0,100,100,0,0,{border},{p.outline_px},0,5,0,0,0,1")   # alignment 5 = center anchor, \pos places it

def _block_dialogue(b, p: TextPreset) -> str:
    fx = f"\\pos({p.x},{p.y})"
    if p.entrance == "fade_pop":
        fx += "\\fad(200,0)\\fscx80\\fscy80\\t(0,200,\\fscx100\\fscy100)"
    text = b.heading + (f"\\N{{\\fs{int(p.size_px * 0.55)}}}{b.subheading}" if b.subheading else "")
    return f"Dialogue: 0,{ass_time(b.start)},{ass_time(b.end)},P{p.id[:8]},,0,0,0,,{{{fx}}}{text}"

def render_ass(project: Project, presets: dict[str, TextPreset]) -> str:
    used = {b.preset_id: presets[b.preset_id] for b in project.text_blocks}
    header = ("[Script Info]\nScriptType: v4.00+\n"
              f"PlayResX: {project.width}\nPlayResY: {project.height}\nWrapStyle: 2\n\n"
              "[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, "
              "Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, "
              "Alignment, MarginL, MarginR, MarginV, Encoding\n")
    styles = "\n".join(_style(f"P{p.id[:8]}", p) for p in used.values())
    events = ("\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n"
              + "\n".join(_block_dialogue(b, presets[b.preset_id]) for b in project.text_blocks))
    return header + styles + events + "\n"
```

Note for the implementer: heading and subheading share one Dialogue line (`\N` separator) — that IS the "enters as one unit" requirement; the subheading is auto-sized at 55% of the heading.

- [ ] **Step 4: Run tests PASS.**
- [ ] **Step 5: Update map/inventory; commit + push** — `git commit -m "feat: ASS renderer for text blocks with fade+pop entrance"`.

---

### Task 7: Text block visible on the preview, styled live

**Files:**
- Modify: `static/editor.js`, `static/preview.js`, `static/index.html`, `static/css/components/stage.css` (overlay text styles; was `style.css` pre-Task 5b)

**Interfaces:**
- Consumes: `TextBlockLayer`, `TextPreset` shapes (client-side mirrors of Task 1 models); `PUT /api/projects/{pid}`.
- Produces: `Preview.renderText(project, presets, timelineTime)` — shows/hides `#overlay` children by `start/end`; used again by captions in Task 10.

- [ ] **Step 1: Panel UI (thin).** "Text" section in `index.html`: heading + subheading inputs, start/end seconds, and style controls (font size, color, outline color/width, box on/off + color, x/y sliders 0–1080/0–1920, align). Editing updates a working `TextPreset`-shaped object + the block, saves project via PUT, re-renders overlay.
- [ ] **Step 2: Overlay rendering (thin).** `Preview.renderText`: a div per block, absolutely positioned at `(x/1080*stageW, y/1920*stageH)`, translate(-50%,-50%) to match ASS anchor-5, font Arial, `font-size: size_px/1920*stageH`, color, `-webkit-text-stroke` for outline or background-color for box; heading + subheading stacked in the one div (subheading at 55% size). Visible only while `start <= timelineTime < end` (tick from the player's timeupdate).
- [ ] **Step 3: See it.** Type a heading + subheading → **your title card sits on the reel and restyles live as you drag the controls.**
- [ ] **Step 4: Update map; commit + push** — `git commit -m "feat: live-styled text block on preview"`. Run `pytest -q` (unchanged backend, still green).

---

### Task 8: Savable text presets (the brand kit)

**Files:**
- Modify: `app/main.py` (2 routes), `static/editor.js`, `static/index.html`
- Test: extend `tests/test_store.py` if any store change is needed (Task 1 already covers save/update)

**Interfaces:**
- Consumes: `store.load_presets`, `store.save_preset`.
- Produces: HTTP `GET /api/presets` → `[TextPreset]`; `POST /api/presets` (body = TextPreset JSON; same id updates) → saved TextPreset.

- [ ] **Step 1: Routes** in `main.py` (wiring only): `GET /api/presets` → `store.load_presets(DATA_DIR)`; `POST /api/presets` → validate `TextPreset`, `store.save_preset`, return it.
- [ ] **Step 2: API test** in `tests/test_store.py` style using `fastapi.testclient.TestClient` (httpx): POST a preset, GET returns it. Run `pytest -q` → PASS.
- [ ] **Step 3: UI (thin).** "Save style as…" (name prompt → POST current style) and a preset dropdown (GET on load; choosing one applies it to the block and sets `preset_id`).
- [ ] **Step 4: See it.** Style a block → save as "My Title" → add a fresh block → **pick "My Title" from the dropdown, style applies instantly.** Restart the server → preset still there.
- [ ] **Step 5: Update map; commit + push** — `git commit -m "feat: savable text style presets"`.

---

### Task 9: Text block burned into the export (with entrance)

**Files:**
- Modify: `app/main.py` (export route passes ASS), `static/preview.js` (entrance animation in preview)

**Interfaces:**
- Consumes: `render_ass` (Task 6), `build_export_cmd(..., ass_path=...)` (Task 4).

- [ ] **Step 1: Wire export.** In the export route: if `project.text_blocks` (or later captions) exist → `presets = {p.id: p for p in store.load_presets(DATA_DIR)}` → write `render_ass(project, presets)` to `data/exports/<id>.ass` (utf-8) → pass `ass_path` to `build_export_cmd`.
- [ ] **Step 2: Preview entrance (thin).** In `Preview.renderText`, when a block first becomes visible and its preset has `entrance == "fade_pop"`, apply a 200ms CSS animation (opacity 0→1, scale 0.8→1) — mirrors `\fad(200,0)` + `\t` from Task 6.
- [ ] **Step 3: See it.** Export → **the mp4 has your title card popping in exactly where the preview showed it.** Compare preview vs export side by side once; position/size should agree closely (not pixel-perfect — that's the accepted parity bar from the spec).
- [ ] **Step 4: Run `pytest -q`; update map; commit + push** — `git commit -m "feat: text block burned into export with entrance"`.

---

### Task 10: Auto-captions appear on the reel

**Files:**
- Create: `app/transcribe.py`, `tests/test_transcribe.py`
- Modify: `app/main.py` (route), `static/editor.js` (button), `static/preview.js` (caption overlay)

**Interfaces:**
- Consumes: export pipeline pieces: to transcribe the *assembled* reel, the route first renders a temp audio-only export (`ffmpeg_cmd.build_export_cmd` output piped to wav is overkill — see Step 3).
- Produces: `transcribe.words_from_segments(segments) -> list[CaptionWord]` (pure); `transcribe.transcribe_file(path) -> list[CaptionWord]` (loads `WhisperModel("large-v3", device="cuda", compute_type="float16")` lazily, module-level cache); HTTP `POST /api/projects/{pid}/transcribe` → updated Project with `captions` set.

- [ ] **Step 1: Failing test** `tests/test_transcribe.py` (mocked model — never load CUDA in tests):

```python
# Tests for app.transcribe: mapping faster-whisper word segments to CaptionWords.
from types import SimpleNamespace as NS
from app.transcribe import words_from_segments

def test_words_from_segments_flattens_and_orders():
    segs = [NS(words=[NS(word=" Hello", start=0.1, end=0.4), NS(word=" world", start=0.4, end=0.9)]),
            NS(words=[NS(word=" again", start=1.2, end=1.6)])]
    out = words_from_segments(segs)
    assert [w.text for w in out] == ["Hello", "world", "again"]     # stripped
    assert out[0].t_start == 0.1 and out[2].t_end == 1.6
    assert len({w.id for w in out}) == 3
```

- [ ] **Step 2: Run, verify FAIL.**
- [ ] **Step 3: Implement** `app/transcribe.py`:

```python
# Speech-to-captions: runs faster-whisper (CUDA) over the assembled reel's audio.
# Exposes transcribe_file, words_from_segments. Heavy import is lazy (ml extra).
from app.models import CaptionWord

_model = None

def words_from_segments(segments) -> list[CaptionWord]:
    return [CaptionWord(text=w.word.strip(), t_start=w.start, t_end=w.end)
            for seg in segments for w in (seg.words or [])]

def _get_model():
    global _model
    if _model is None:
        from faster_whisper import WhisperModel
        _model = WhisperModel("large-v3", device="cuda", compute_type="float16")
    return _model

def transcribe_file(path: str) -> list[CaptionWord]:
    segments, _info = _get_model().transcribe(path, word_timestamps=True)
    return words_from_segments(segments)
```

Route (wiring only): `POST /api/projects/{pid}/transcribe` → export the assembled reel's **audio** to a temp wav first so word times are timeline times, not source times → `media.run_export` → `transcribe_file(wav)` → set `project.captions = CaptionTrack(words=...)` → save → return project. Install the ml extra first: `.venv/Scripts/pip install -e .[ml]`.

Add to `app/ffmpeg_cmd.py` (with a test in `tests/test_ffmpeg_cmd.py` asserting one `atrim` per clip, `-vn` present, and the wav path last):

```python
def build_audio_cmd(p: Project, wav_path: str) -> list[str]:
    clips = ordered(p.clips)
    cmd = ["ffmpeg", "-y"]
    parts = []
    for i, c in enumerate(clips):
        cmd += ["-i", c.file_path]
        parts.append(f"[{i}:a]atrim=start={c.in_point}:end={c.out_point},asetpts=PTS-STARTPTS[a{i}];")
    fc = "".join(parts) + "".join(f"[a{i}]" for i in range(len(clips))) + f"concat=n={len(clips)}:v=0:a=1[a]"
    return cmd + ["-filter_complex", fc, "-map", "[a]", "-vn", "-ac", "1", "-ar", "16000", wav_path]
```

- [ ] **Step 4: Run tests PASS** (`pytest -q`; CUDA never touched).
- [ ] **Step 5: Caption overlay (thin).** "Auto-caption" button → POST → `preview.js` groups words into lines of ≤4 (`groupWords(words)`, mirrored from the upcoming Task 12 Python function) and shows the active line at the hardcoded style (Arial 72/1920-scaled, white, black stroke, bottom-center y=1520) while `line.start <= t < line.end`.
- [ ] **Step 6: See it.** Click Auto-caption → wait a few seconds → **your spoken words appear over the reel as it plays.**
- [ ] **Step 7: Update map; commit + push** — `git commit -m "feat: auto-captions via faster-whisper on the assembled reel"`.

---

### Task 11: Fix a caption word, live

**Files:**
- Modify: `static/editor.js`, `static/index.html`

**Interfaces:**
- Consumes: `Project.captions.words`, `PUT /api/projects/{pid}`.

- [ ] **Step 1: Word list UI (thin).** "Captions" panel: one text input per word (grouped by line), value = `word.text`. `input` event updates the word in the client project, debounced PUT saves, overlay re-renders. Empty text deletes the word. Timing is not editable in v1.
- [ ] **Step 2: See it.** Whisper got a word wrong → click it in the list, retype → **the caption on the preview updates as you type.**
- [ ] **Step 3: Run `pytest -q`; commit + push** — `git commit -m "feat: editable caption words"`.

---

### Task 12: Karaoke highlight, preview + export — the finished reel

**Files:**
- Modify: `app/ass_render.py`, `tests/test_ass_render.py`, `static/preview.js`

**Interfaces:**
- Consumes: `CaptionTrack` (Task 10/11), export ASS wiring (Task 9).
- Produces: `ass_render.group_words(words, max_words=4) -> list[list[CaptionWord]]` (pure); caption Dialogue lines with `\k` tags appended by `render_ass`; hardcoded `Caption` style per Global Constraints.

- [ ] **Step 1: Failing tests** (extend `tests/test_ass_render.py`):

```python
from app.models import CaptionTrack, CaptionWord

def w(t, a, b): return CaptionWord(text=t, t_start=a, t_end=b)

def test_group_words_max4():
    from app.ass_render import group_words
    words = [w(str(i), i, i + 0.5) for i in range(6)]
    groups = group_words(words)
    assert [len(g) for g in groups] == [4, 2]

def test_karaoke_dialogue():
    p = Project(name="r", captions=CaptionTrack(words=[w("Hello", 1.0, 1.5), w("world", 1.5, 2.2)]))
    out = render_ass(p, {})
    assert "Style: Caption,Arial,72," in out
    line = next(l for l in out.splitlines() if "Hello" in l)
    assert line.startswith("Dialogue: 1,0:00:01.00,0:00:02.20,Caption")
    assert "{\\k50}Hello" in line and "{\\k70}world" in line        # centiseconds per word
```

- [ ] **Step 2: Run, verify FAIL.**
- [ ] **Step 3: Implement.** In `ass_render.py` add:

```python
def group_words(words, max_words: int = 4):
    return [words[i:i + max_words] for i in range(0, len(words), max_words)]

CAPTION_STYLE = ("Style: Caption,Arial,72,&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,"
                 "-1,0,0,0,100,100,0,0,1,4,0,2,60,60,400,1")
KARAOKE_HIGHLIGHT = "&H0000D4FF"  # #FFD400 in AABBGGRR

def _caption_dialogues(track) -> list[str]:
    lines = []
    for g in group_words(track.words):
        start, end = g[0].t_start, g[-1].t_end
        body = "".join(f"{{\\k{max(1, round((w.t_end - w.t_start) * 100))}}}{w.text} " for w in g).rstrip()
        lines.append(f"Dialogue: 1,{ass_time(start)},{ass_time(end)},Caption,,0,0,0,,"
                     f"{{\\2c{KARAOKE_HIGHLIGHT}}}{body}")
    return lines
```

and in `render_ass`: append `CAPTION_STYLE` to the styles section and `_caption_dialogues(project.captions)` to events when `project.captions` has words. (ASS `\k` fills from SecondaryColour to PrimaryColour; with `\2c` set to the highlight, the spoken word turns `#FFD400` — "approximately the spoken word", per spec.)

- [ ] **Step 4: Run tests PASS.**
- [ ] **Step 5: Preview karaoke (thin).** In the caption overlay, render each word of the active line as a `<span>`; on the playback tick, the span whose `t_start <= t < t_end` gets color `#FFD400`.
- [ ] **Step 6: See it — the finish line.** Play: **words light up as they're spoken.** Export → **the finished reel: 4–6 cut clips, popping title card, karaoke captions — post it.**
- [ ] **Step 7: Update map/inventory; commit + push** — `git commit -m "feat: karaoke caption highlight in preview and export"`.

---

## Verification (whole milestone)

1. `pytest -q` — all green.
2. End-to-end by hand: 5 real clips → trim two → title card from a saved preset → auto-caption → fix one word → export → watch the mp4 start to finish.
3. Parity spot-check: pause preview at 3 timestamps, compare against the exported frame (position/size of text agree closely).

## Known limitations (accepted for milestone 1)

- Clips must have an audio stream (concat expects `v=1:a=1`).
- Preview has a brief hiccup at clip joins; export is seamless.
- Caption timing not editable; no caption styling UI (hardcoded design — by decision).
- Preview/export parity is visual-trust level, not pixel-perfect.

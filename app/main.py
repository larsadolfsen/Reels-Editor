# FastAPI composition root: mounts static UI and wires API routes to modules.
# No feature logic lives here. Run: uvicorn app.main:app --reload
import re
from datetime import datetime, timezone
from pathlib import Path
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from app.models import Project, TextPreset, ProjectSummary, new_id, CaptionTrack
from app import store, media, ffmpeg_cmd, ass_render, timeline, transcribe, export_jobs, waveform, filmstrip
from app.font_metrics import available_weights, WEIGHT_LABELS

DATA_DIR = Path("data")
app = FastAPI()

_UNSAFE_FILENAME_CHARS = re.compile(r'[\\/:*?"<>|]')

def sanitize_export_filename(name: str) -> str:
    """Strip path separators and other filesystem-unsafe characters from a user-supplied
    export filename. Pure/testable without touching the filesystem."""
    name = _UNSAFE_FILENAME_CHARS.sub("", name).strip().strip(".")
    if name.lower().endswith(".mp4"):
        name = name[:-4]
    return name

def resolve_export_path(out_dir: Path, stem: str) -> Path:
    """Pick a non-colliding .mp4 path under out_dir for the given filename stem,
    appending -2, -3, ... if the plain name is already taken."""
    candidate = out_dir / f"{stem}.mp4"
    n = 2
    while candidate.exists():
        candidate = out_dir / f"{stem}-{n}.mp4"
        n += 1
    return candidate

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

@app.get("/api/projects")
def list_projects() -> list[ProjectSummary]:
    projects = sorted(store.list_projects(DATA_DIR), key=lambda p: p.updated_at, reverse=True)
    return [ProjectSummary(id=p.id, name=p.name, created_at=p.created_at, updated_at=p.updated_at) for p in projects]

@app.delete("/api/projects/{pid}", status_code=204)
def delete_project(pid: str) -> None:
    store.delete_project(pid, DATA_DIR)

@app.post("/api/projects/{pid}/duplicate")
def duplicate_project(pid: str) -> Project:
    p = store.load_project(pid, DATA_DIR)
    dup = p.model_copy(deep=True, update={
        "id": new_id(),
        "name": f"{p.name} copy",
        "created_at": datetime.now(timezone.utc),
    })
    store.save_project(dup, DATA_DIR)
    return dup

@app.get("/api/probe")
def probe(path: str) -> dict:
    if media.is_image_path(path):
        return {"duration": 0.0, "has_audio": False, "kind": "image"}
    return {"duration": media.probe_duration(path), "has_audio": media.has_audio_stream(path), "kind": "video"}

@app.get("/api/media/{media_id}/peaks")
def media_peaks(media_id: str, path: str) -> list[float]:
    return waveform.peaks_for_media(media_id, path, DATA_DIR)

@app.get("/api/pick-files")
def pick_files() -> dict:
    return {"paths": media.pick_files()}

@app.get("/api/pick-file")
def pick_file(kind: str = "video") -> dict:
    return {"path": media.pick_file(kind)}

@app.get("/api/fonts/{name}/weights")
def list_font_weights(name: str) -> list[dict]:
    return [{"value": w, "label": WEIGHT_LABELS[w]} for w in available_weights(name)]

@app.get("/api/presets")
def list_presets() -> list[TextPreset]:
    return store.load_presets(DATA_DIR)

@app.post("/api/presets")
def create_preset(preset: TextPreset) -> TextPreset:
    store.save_preset(preset, DATA_DIR)
    return preset

@app.post("/api/projects/{pid}/transcribe")
def transcribe_project(pid: str) -> Project:
    p = store.load_project(pid, DATA_DIR)
    out_dir = DATA_DIR / "exports"
    out_dir.mkdir(parents=True, exist_ok=True)
    wav_path = out_dir / f"{p.id[:8]}-audio.wav"

    media.run_export(ffmpeg_cmd.build_audio_cmd(p, str(wav_path)))
    words = transcribe.transcribe_file(str(wav_path))

    if p.captions:
        p.captions.words = words
    else:
        preset = TextPreset(name="Caption", size_px=72, x=540, y=1520, align="center",
                             highlight_color="#FFD400", highlight_mode="current_word", max_words_per_line=4)
        p.text_presets[preset.id] = preset
        p.captions = CaptionTrack(words=words, preset_id=preset.id)

    store.save_project(p, DATA_DIR)
    return p

@app.get("/api/media/{media_id}/thumbnail")
def media_thumbnail(media_id: str, path: str) -> FileResponse:
    thumb_path = media.generate_thumbnail(media_id, path, DATA_DIR)
    return FileResponse(thumb_path)

@app.get("/api/media/{media_id}/filmstrip")
def media_filmstrip(media_id: str, path: str) -> FileResponse:
    filmstrip_path = filmstrip.generate_filmstrip(media_id, path, DATA_DIR)
    return FileResponse(str(filmstrip_path))

@app.get("/media")
def media_file(path: str):
    return media.media_response(path)

@app.post("/api/projects/{pid}/export")
def export_project(pid: str) -> dict:
    p = store.load_project(pid, DATA_DIR)
    out_dir = DATA_DIR / "exports"
    out_dir.mkdir(parents=True, exist_ok=True)
    default_stem = f"{p.name}-{p.id[:8]}"
    stem = sanitize_export_filename(p.export_filename) if p.export_filename else ""
    out_path = resolve_export_path(out_dir, stem or default_stem)

    caption_ass_path = None
    if p.captions and p.captions.words:
        caption_preset = p.text_presets.get(p.captions.preset_id) or TextPreset(name="Caption")
        cap_file = out_dir / f"{p.name}-{p.id[:8]}-captions.ass"
        cap_file.write_text(ass_render.render_caption_ass(p, caption_preset), encoding="utf-8")
        caption_ass_path = str(cap_file)

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
        cmd = ffmpeg_cmd.build_export_cmd(p, str(out_path), bands=bands, caption_ass_path=caption_ass_path)
    else:
        ass_path = None
        if p.text_blocks:
            ass_file = out_dir / f"{p.name}-{p.id[:8]}.ass"
            ass_file.write_text(ass_render.render_ass(p, p.text_presets), encoding="utf-8")
            ass_path = str(ass_file)
        cmd = ffmpeg_cmd.build_export_cmd(p, str(out_path), ass_path, caption_ass_path=caption_ass_path)

    total_duration = timeline.sequence_duration(timeline.ordered(p.clips))

    def run(on_progress):
        media.run_export(cmd, on_progress=on_progress, total_duration=total_duration)
        return str(out_path)

    job_id = export_jobs.start_job(run)
    return {"job_id": job_id}

@app.get("/api/exports/{job_id}")
def export_status(job_id: str) -> dict:
    job = export_jobs.get_job(job_id)
    if job is None:
        raise HTTPException(404, f"unknown export job: {job_id}")
    return job

app.mount("/static", StaticFiles(directory="static"), name="static")

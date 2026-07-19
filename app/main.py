# FastAPI composition root: mounts static UI and wires API routes to modules.
# No feature logic lives here. Run: uvicorn app.main:app --reload
from pathlib import Path
from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from app.models import Project, TextPreset
from app import store, media, ffmpeg_cmd, ass_render
from app.font_metrics import available_weights, WEIGHT_LABELS

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

@app.get("/api/pick-file")
def pick_file() -> dict:
    return {"path": media.pick_file()}

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

@app.get("/media")
def media_file(path: str):
    return media.media_response(path)

@app.post("/api/projects/{pid}/export")
def export_project(pid: str) -> dict:
    p = store.load_project(pid, DATA_DIR)
    out_dir = DATA_DIR / "exports"
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / f"{p.name}-{p.id[:8]}.mp4"
    ass_path = None
    if p.text_blocks:
        ass_file = out_dir / f"{p.name}-{p.id[:8]}.ass"
        ass_file.write_text(ass_render.render_ass(p, p.text_presets), encoding="utf-8")
        ass_path = str(ass_file)
    cmd = ffmpeg_cmd.build_export_cmd(p, str(out_path), ass_path)
    media.run_export(cmd)
    return {"out_path": str(out_path)}

app.mount("/static", StaticFiles(directory="static"), name="static")

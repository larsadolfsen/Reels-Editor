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

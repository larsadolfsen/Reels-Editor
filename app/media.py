# Media helpers: ffprobe duration probing, safe local file serving, native file picker.
# Exposes ffprobe_cmd, probe_duration, media_response, run_export, pick_file. Depends on ffprobe on PATH and tkinter.
import subprocess
import tkinter
from tkinter import filedialog
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

def run_export(cmd: list[str]) -> None:
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr[-2000:])

def pick_file() -> str | None:
    # Must stay a sync `def` route: FastAPI dispatches sync handlers to a worker thread,
    # so this blocking Tk dialog runs off the main thread. Switching the /api/pick-file
    # route to `async def` would run this on the event loop and freeze the server.
    root = tkinter.Tk()
    root.withdraw()
    root.attributes("-topmost", True)
    path = filedialog.askopenfilename(
        title="Choose a clip",
        filetypes=[("Video files", "*.mp4 *.mov *.mkv"), ("All files", "*.*")],
    )
    root.destroy()
    return path or None

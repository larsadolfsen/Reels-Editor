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

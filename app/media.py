# Media helpers: ffprobe duration probing, safe local file serving, native file picker.
# Exposes ffprobe_cmd, probe_duration, media_response, run_export, pick_file. Depends on ffprobe on PATH and tkinter.
import os
import shutil
import subprocess
import tkinter
import winreg
from tkinter import filedialog
from pathlib import Path
from fastapi import HTTPException
from fastapi.responses import FileResponse

def _refreshed_path() -> str:
    # Re-reads PATH from the registry so a PATH change (e.g. installing ffmpeg) takes
    # effect immediately, without waiting for every ancestor process to be restarted.
    # On Windows, CreateProcess resolves an unqualified executable name using the
    # calling process's own inherited PATH, not the `env` passed to subprocess.run —
    # so callers must resolve the executable to an absolute path themselves (see
    # _resolve_cmd) rather than relying on env alone to fix executable lookup.
    def read(hive, key):
        try:
            with winreg.OpenKey(hive, key) as k:
                return winreg.QueryValueEx(k, "Path")[0]
        except OSError:
            return ""
    machine = read(winreg.HKEY_LOCAL_MACHINE, r"SYSTEM\CurrentControlSet\Control\Session Manager\Environment")
    user = read(winreg.HKEY_CURRENT_USER, "Environment")
    return ";".join(p for p in (machine, user, os.environ.get("PATH", "")) if p)

def _resolve_cmd(cmd: list[str], path: str) -> tuple[list[str], dict]:
    env = os.environ.copy()
    env["PATH"] = path
    resolved = [shutil.which(cmd[0], path=path) or cmd[0], *cmd[1:]]
    return resolved, env

def ffprobe_cmd(path: str) -> list[str]:
    return ["ffprobe", "-v", "error", "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1", path]

def probe_duration(path: str) -> float:
    cmd, env = _resolve_cmd(ffprobe_cmd(path), _refreshed_path())
    out = subprocess.run(cmd, capture_output=True, text=True, check=True, env=env)
    return float(out.stdout.strip())

def media_response(path: str) -> FileResponse:
    p = Path(path)
    if not p.is_file():
        raise HTTPException(404, f"not found: {path}")
    return FileResponse(p)

def run_export(cmd: list[str]) -> None:
    resolved, env = _resolve_cmd(cmd, _refreshed_path())
    proc = subprocess.run(resolved, capture_output=True, text=True, env=env)
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

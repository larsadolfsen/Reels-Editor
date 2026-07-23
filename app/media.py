# Media helpers: ffprobe duration probing, audio stream detection, extension-based image detection,
# safe local file serving, native file picker, and parsing ffmpeg -progress output into a percent.
# Exposes ffprobe_cmd, probe_duration, has_audio_stream, is_image_path, media_response, run_export,
# percent_from_progress_line, pick_files (multi-select video+image import), pick_file (kind="video"|
# "audio", single-select — "audio" filters to music files for the AUDIO panel's music import).
# Depends on ffprobe/ffmpeg on PATH and tkinter.
import os
import shutil
import subprocess
import tempfile
import tkinter
import winreg
from tkinter import filedialog
from typing import Callable
from pathlib import Path
from fastapi import HTTPException
from fastapi.responses import FileResponse

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}

def is_image_path(path: str) -> bool:
    return Path(path).suffix.lower() in IMAGE_EXTENSIONS

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

def percent_from_progress_line(line: str, total_duration: float) -> float | None:
    """Parses one line of ffmpeg's `-progress pipe:1` output. Returns a 0-100 percent for an
    out_time_us= line when total_duration > 0, else None (caller skips other progress keys)."""
    line = line.strip()
    if not line.startswith("out_time_us=") or total_duration <= 0:
        return None
    try:
        micros = int(line.split("=", 1)[1])
    except ValueError:
        return None
    seconds = micros / 1_000_000
    return max(0.0, min(100.0, (seconds / total_duration) * 100))

def ffprobe_cmd(path: str) -> list[str]:
    return ["ffprobe", "-v", "error", "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1", path]

def probe_duration(path: str) -> float:
    cmd, env = _resolve_cmd(ffprobe_cmd(path), _refreshed_path())
    out = subprocess.run(cmd, capture_output=True, text=True, check=True, env=env)
    return float(out.stdout.strip())

def has_audio_stream(path: str) -> bool:
    cmd = ["ffprobe", "-v", "error", "-select_streams", "a",
           "-show_entries", "stream=codec_type", "-of", "csv=p=0", path]
    resolved, env = _resolve_cmd(cmd, _refreshed_path())
    out = subprocess.run(resolved, capture_output=True, text=True, check=True, env=env)
    return bool(out.stdout.strip())

def media_response(path: str) -> FileResponse:
    p = Path(path)
    if not p.is_file():
        raise HTTPException(404, f"not found: {path}")
    return FileResponse(p)

def run_export(cmd: list[str], on_progress: Callable[[float], None] | None = None, total_duration: float = 0.0) -> None:
    resolved, env = _resolve_cmd(cmd, _refreshed_path())
    use_progress = on_progress is not None and total_duration > 0
    if use_progress:
        # Insert right after the executable — global options only need to precede -i, and this
        # avoids assuming cmd[1] is a standalone flag (e.g. "-y") rather than one taking a value.
        resolved = [resolved[0], "-progress", "pipe:1", "-nostats", *resolved[1:]]
    with tempfile.TemporaryFile(mode="w+", encoding="utf-8") as stderr_file:
        proc = subprocess.Popen(
            resolved,
            stdout=subprocess.PIPE if use_progress else subprocess.DEVNULL,
            stderr=stderr_file,
            env=env,
            text=True,
        )
        if use_progress:
            for line in proc.stdout:
                percent = percent_from_progress_line(line, total_duration)
                if percent is not None:
                    on_progress(percent)
            proc.stdout.close()
        proc.wait()
        if proc.returncode != 0:
            stderr_file.seek(0)
            raise RuntimeError(stderr_file.read()[-2000:])

def _filedialog_options(kind: str) -> tuple[str, list[tuple[str, str]]]:
    """Pure: dialog title + filetypes for the native file picker, by import kind.
    Unknown kind falls back to the video/image picker (today's only behavior, preserved
    byte-for-byte from the pre-audio-import version of pick_file)."""
    if kind == "audio":
        return "Choose a music file", [("Audio files", "*.mp3 *.wav *.m4a *.aac *.ogg *.flac"), ("All files", "*.*")]
    return "Choose a clip", [
        ("Media files", "*.mp4 *.mov *.mkv *.jpg *.jpeg *.png *.webp"),
        ("Video files", "*.mp4 *.mov *.mkv"),
        ("Image files", "*.jpg *.jpeg *.png *.webp"),
        ("All files", "*.*"),
    ]

def pick_files() -> list[str]:
    # Must stay a sync `def` route: FastAPI dispatches sync handlers to a worker thread,
    # so this blocking Tk dialog runs off the main thread. Switching the /api/pick-files
    # route to `async def` would run this on the event loop and freeze the server.
    root = tkinter.Tk()
    root.withdraw()
    root.attributes("-topmost", True)
    paths = filedialog.askopenfilenames(
        title="Import Media",
        filetypes=[
            ("Media files", "*.mp4 *.mov *.mkv *.jpg *.jpeg *.png *.webp"),
            ("Video files", "*.mp4 *.mov *.mkv"),
            ("Image files", "*.jpg *.jpeg *.png *.webp"),
            ("All files", "*.*"),
        ],
    )
    root.destroy()
    return list(paths)

def pick_file(kind: str = "video") -> str | None:
    # Single-select variant of pick_files(), used where exactly one file is wanted (e.g. the
    # AUDIO panel's music import). Must stay a sync `def` for the same reason as pick_files().
    title, filetypes = _filedialog_options(kind)
    root = tkinter.Tk()
    root.withdraw()
    root.attributes("-topmost", True)
    path = filedialog.askopenfilename(title=title, filetypes=filetypes)
    root.destroy()
    return path or None

def generate_thumbnail(media_id: str, file_path: str, data_dir: Path) -> Path:
    """Generate a JPEG thumbnail for a media file. For videos, extracts a frame at 1 second;
    for images, copies directly. Returns the path to the cached thumbnail."""
    thumb_dir = data_dir / "thumbnails"
    thumb_dir.mkdir(parents=True, exist_ok=True)
    thumb_path = thumb_dir / f"{media_id}.jpg"

    if thumb_path.exists():
        return thumb_path

    if is_image_path(file_path):
        # For images, just copy to thumbnail (ffmpeg will scale it)
        cmd = ["ffmpeg", "-y", "-i", file_path, "-vf", "scale=68:102:force_original_aspect_ratio=decrease,pad=68:102:(ow-iw)/2:(oh-ih)/2", "-q:v", "5", str(thumb_path)]
    else:
        # For videos, extract frame at 1 second
        cmd = ["ffmpeg", "-y", "-ss", "1", "-i", file_path, "-vf", "scale=68:102:force_original_aspect_ratio=decrease,pad=68:102:(ow-iw)/2:(oh-ih)/2", "-vframes", "1", "-q:v", "5", str(thumb_path)]

    resolved, env = _resolve_cmd(cmd, _refreshed_path())
    subprocess.run(resolved, capture_output=True, check=True, env=env)
    return thumb_path

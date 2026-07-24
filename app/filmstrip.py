# Timeline VIDEO-row filmstrip generation: pure frame-layout math (frame_interval,
# frame_count) plus generate_filmstrip, which extracts sampled frames from a source
# media file and tiles them into one cached horizontal sprite-sheet JPEG via ffmpeg,
# cached at data/filmstrips/{media_id}.jpg (invalidated by absence only, same
# convention as app/media.py's thumbnail cache and app/waveform.py's peaks cache).
# Exposes frame_interval, frame_count, generate_filmstrip, FRAME_W, FRAME_H.
# Depends on app.media's registry-PATH ffmpeg resolution, is_image_path, probe_duration.
# frame_interval/frame_count are mirrored byte-for-byte in static/filmstrip-layout.js —
# keep both in sync.
import math
import subprocess
from pathlib import Path
from app.media import _resolve_cmd, _refreshed_path, is_image_path, probe_duration

FRAME_W = 36
FRAME_H = 64

def frame_interval(duration: float, max_frames: int = 120) -> float:
    if duration <= 0:
        return 1.0
    return max(1.0, duration / max_frames)

def frame_count(duration: float, interval: float) -> int:
    if duration <= 0:
        return 1
    return max(1, math.ceil(duration / interval))

def generate_filmstrip(media_id: str, file_path: str, data_dir: Path) -> Path:
    """Generate a horizontal sprite-sheet JPEG of sampled frames for a media file.
    For videos, samples one frame every frame_interval() seconds up to frame_count()
    frames; for images, the input is looped for one interval so the fps filter has
    something to sample, yielding a single-tile sprite. Returns the path to the
    cached sprite."""
    filmstrip_dir = Path(data_dir) / "filmstrips"
    filmstrip_dir.mkdir(parents=True, exist_ok=True)
    filmstrip_path = filmstrip_dir / f"{media_id}.jpg"

    if filmstrip_path.exists():
        return filmstrip_path

    is_image = is_image_path(file_path)
    duration = 0.0 if is_image else probe_duration(file_path)
    interval = frame_interval(duration)
    count = frame_count(duration, interval)

    scale_pad = f"scale={FRAME_W}:{FRAME_H}:force_original_aspect_ratio=decrease,pad={FRAME_W}:{FRAME_H}:(ow-iw)/2:(oh-ih)/2"
    vf = f"fps=1/{interval},{scale_pad},tile={count}x1"
    if is_image:
        # A still image has no duration for ffmpeg's fps filter to sample against, so
        # without -loop it yields zero output frames. Loop it for exactly one sampled
        # interval (count is always 1 for images) so the fps filter has something to sample.
        input_args = ["-loop", "1", "-t", str(interval), "-i", file_path]
    else:
        input_args = ["-i", file_path]
    cmd = ["ffmpeg", "-y", *input_args, "-vf", vf, "-frames:v", "1", "-q:v", "5", str(filmstrip_path)]

    resolved, env = _resolve_cmd(cmd, _refreshed_path())
    subprocess.run(resolved, capture_output=True, check=True, env=env)
    return filmstrip_path

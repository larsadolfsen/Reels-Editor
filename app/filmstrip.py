# Timeline VIDEO-row filmstrip generation: pure frame-layout math (frame_interval,
# frame_count) plus generate_filmstrip, which extracts sampled frames from a source
# media file and tiles them into one cached horizontal sprite-sheet JPEG via ffmpeg.
# Exposes frame_interval, frame_count, generate_filmstrip, FRAME_W, FRAME_H.
# Depends on app.media's registry-PATH ffmpeg resolution and is_image_path.
# frame_interval/frame_count are mirrored byte-for-byte in static/filmstrip-layout.js —
# keep both in sync.
import math

FRAME_W = 40
FRAME_H = 60

def frame_interval(duration: float, max_frames: int = 120) -> float:
    if duration <= 0:
        return 1.0
    return max(1.0, duration / max_frames)

def frame_count(duration: float, interval: float) -> int:
    if duration <= 0:
        return 1
    return max(1, math.ceil(duration / interval))

# Timeline VIDEO-row filmstrip generation: pure frame-layout math for computing how
# many frames to sample from a source video and how far apart to space them.
# Exposes frame_interval, frame_count.
# frame_interval/frame_count are mirrored byte-for-byte in static/filmstrip-layout.js —
# keep both in sync.
import math

def frame_interval(duration: float, max_frames: int = 120) -> float:
    if duration <= 0:
        return 1.0
    return max(1.0, duration / max_frames)

def frame_count(duration: float, interval: float) -> int:
    if duration <= 0:
        return 1
    return max(1, math.ceil(duration / interval))

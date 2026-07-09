# Pure timeline math: order clips, durations, map timeline time to (clip, source time).
# Exposes ordered, clip_duration, sequence_duration, locate. Depends on app.models.
from app.models import ClipLayer

def ordered(clips: list[ClipLayer]) -> list[ClipLayer]:
    return sorted(clips, key=lambda c: c.order)

def clip_duration(c: ClipLayer) -> float:
    return c.out_point - c.in_point

def sequence_duration(clips: list[ClipLayer]) -> float:
    return sum(clip_duration(c) for c in clips)

def locate(clips: list[ClipLayer], t: float) -> tuple[ClipLayer, float]:
    acc = 0.0
    for c in ordered(clips):
        d = clip_duration(c)
        if t < acc + d:
            return c, c.in_point + (t - acc)
        acc += d
    raise ValueError(f"t={t} beyond sequence end {acc}")

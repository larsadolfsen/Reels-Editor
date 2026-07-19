# Pure timeline math: order clips, durations, map timeline time to (clip, source time), and merge text/video-box layers into z-order export bands.
from app.models import ClipLayer, VideoBoxLayer, Project

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

def video_box_end(v: VideoBoxLayer) -> float:
    return v.start + (v.out_point - v.in_point)

def banded_layers(project: Project) -> list[dict]:
    """Partitions text blocks and video boxes into z-order bands for export compositing:
    consecutive text blocks accumulate into one 'text' band; each video box is its own
    'video_box' band. Consumed by app.main's export route to decide how many ASS files to
    render, and by app.ffmpeg_cmd to build the alternating ass-burn/overlay filter chain."""
    entries = sorted(
        [("text", b) for b in project.text_blocks] + [("video_box", v) for v in project.video_boxes],
        key=lambda e: e[1].z_index,
    )
    bands: list[dict] = []
    pending_text: list = []
    for kind, item in entries:
        if kind == "text":
            pending_text.append(item)
        else:
            if pending_text:
                bands.append({"kind": "text", "text_blocks": pending_text})
                pending_text = []
            bands.append({"kind": "video_box", "video_box": item})
    if pending_text:
        bands.append({"kind": "text", "text_blocks": pending_text})
    return bands

# Pure timeline math: order clips, durations, map timeline time to (clip, source time), and merge text/video-box/image-box layers into z-order export bands.
from app.models import ClipLayer, VideoBoxLayer, ImageBoxLayer, Project

def ordered(clips: list[ClipLayer]) -> list[ClipLayer]:
    return sorted(clips, key=lambda c: c.order)

def clip_duration(c: ClipLayer) -> float:
    return (c.out_point - c.in_point) / c.speed

def sequence_duration(clips: list[ClipLayer]) -> float:
    return sum(clip_duration(c) for c in clips)

def clip_starts(clips: list[ClipLayer]) -> dict[str, float]:
    """Maps each clip id to its accumulated timeline start (same walk as locate(), but returns
    every clip's start instead of stopping at one t). Used by app.auto_slice to find which clips
    fall inside an approved cut range."""
    acc = 0.0
    starts = {}
    for c in ordered(clips):
        starts[c.id] = acc
        acc += clip_duration(c)
    return starts

def locate(clips: list[ClipLayer], t: float) -> tuple[ClipLayer, float]:
    acc = 0.0
    for c in ordered(clips):
        d = clip_duration(c)
        if t < acc + d:
            return c, c.in_point + (t - acc) * c.speed
        acc += d
    raise ValueError(f"t={t} beyond sequence end {acc}")

def slice_clip(clips: list[ClipLayer], t: float, eps: float = 0.05) -> tuple[list[ClipLayer], str | None]:
    """Split the clip under timeline-time t into two clips at that point (source-time from locate).
    First clip keeps in_point..s; the second is a new ClipLayer (s..out_point) inserted right after,
    later orders shifted +1. No-op (clips unchanged, None) when t is in no clip or within eps
    (source-seconds) of a boundary. Both halves share media/file/fill_mode/speed."""
    try:
        c, s = locate(clips, t)
    except ValueError:
        return clips, None
    if abs(s - c.in_point) < eps or abs(c.out_point - s) < eps:
        return clips, None
    for other in clips:
        if other.order > c.order:
            other.order += 1
    new_clip = ClipLayer(
        media_id=c.media_id, file_path=c.file_path,
        in_point=s, out_point=c.out_point, order=c.order + 1,
        fill_mode=c.fill_mode, speed=c.speed,
    )
    c.out_point = s
    clips.append(new_clip)
    return clips, new_clip.id

def video_box_end(v: VideoBoxLayer) -> float:
    return v.start + (v.out_point - v.in_point)

def image_box_end(b: ImageBoxLayer) -> float:
    return b.start + b.duration

def banded_layers(project: Project) -> list[dict]:
    """Partitions text blocks, video boxes, and image boxes into z-order bands for export
    compositing: consecutive text blocks accumulate into one 'text' band; each video/image box
    is its own band. Consumed by app.main's export route to decide how many ASS files to
    render, and by app.ffmpeg_cmd to build the alternating ass-burn/overlay filter chain."""
    entries = sorted(
        [("text", b) for b in project.text_blocks]
        + [("video_box", v) for v in project.video_boxes]
        + [("image_box", i) for i in project.image_boxes],
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
            bands.append({"kind": kind, kind: item})
    if pending_text:
        bands.append({"kind": "text", "text_blocks": pending_text})
    return bands

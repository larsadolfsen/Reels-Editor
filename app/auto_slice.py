# Auto Slicer: detect silence + filler-word ranges and cut them out of the clip sequence.
# Pure detection (detect_silence_ranges/detect_filler_ranges/merge_ranges) plus the apply_cuts
# mutation, which slices/removes clips (via app.timeline.slice_clip/clip_starts) and ripples the
# removal through text_blocks/video_boxes/captions. No I/O — app.main builds the assembled wav
# and calls into here.
import re
from app.models import CaptionWord, ClipLayer, Project
from app import timeline

DEFAULT_FILLER_WORDS = {"um", "umm", "uh", "uhh", "erm", "hmm", "mm"}
SILENCE_PEAK_THRESHOLD = 0.02  # matches static/panel-media.js's checkSilentAudio silence threshold
SILENCE_MIN_DURATION = 0.4
DETECTION_SAMPLES_PER_SECOND = 20

_PUNCT_RE = re.compile(r"^[^\w']+|[^\w']+$")

def normalize_word(text: str) -> str:
    return _PUNCT_RE.sub("", text).lower()

def detect_filler_ranges(words: list[CaptionWord], filler_words: set[str] = DEFAULT_FILLER_WORDS) -> list[tuple[float, float, str]]:
    return [(w.t_start, w.t_end, w.text) for w in words if normalize_word(w.text) in filler_words]

def detect_silence_ranges(
    peaks: list[float],
    samples_per_second: int,
    threshold: float = SILENCE_PEAK_THRESHOLD,
    min_duration: float = SILENCE_MIN_DURATION,
) -> list[tuple[float, float]]:
    ranges = []
    run_start = None
    for i, p in enumerate(peaks):
        if p <= threshold:
            if run_start is None:
                run_start = i
        elif run_start is not None:
            s, e = run_start / samples_per_second, i / samples_per_second
            if e - s >= min_duration:
                ranges.append((s, e))
            run_start = None
    if run_start is not None:
        s, e = run_start / samples_per_second, len(peaks) / samples_per_second
        if e - s >= min_duration:
            ranges.append((s, e))
    return ranges

def merge_ranges(ranges: list[tuple[float, float]], gap: float = 0.05) -> list[tuple[float, float]]:
    if not ranges:
        return []
    srt = sorted(ranges, key=lambda r: r[0])
    merged = [list(srt[0])]
    for s, e in srt[1:]:
        if s <= merged[-1][1] + gap:
            merged[-1][1] = max(merged[-1][1], e)
        else:
            merged.append([s, e])
    return [tuple(r) for r in merged]

def cut_clip_range(clips: list[ClipLayer], start: float, end: float, eps: float = 0.05) -> list[ClipLayer]:
    """Ensures clip boundaries exist at start/end (via slice_clip), drops every clip now fully
    inside [start, end), and renumbers order gap-free. Returns the new clip list."""
    timeline.slice_clip(clips, start, eps)
    timeline.slice_clip(clips, end, eps)
    starts = timeline.clip_starts(clips)
    keep = [c for c in clips if not (starts[c.id] >= start - eps and starts[c.id] < end - eps)]
    keep.sort(key=lambda c: c.order)
    for i, c in enumerate(keep):
        c.order = i
    return keep

def _shift_layers_after(items, start: float, end: float, eps: float = 0.05) -> None:
    dur = end - start
    for item in items:
        if item.start >= end - eps:
            item.start -= dur
            if hasattr(item, "end") and item.end is not None:
                item.end -= dur

def _cut_caption_words(words: list[CaptionWord], start: float, end: float, eps: float = 0.05) -> list[CaptionWord]:
    dur = end - start
    kept = []
    for w in words:
        if w.t_end <= start + eps:
            kept.append(w)
        elif w.t_start >= end - eps:
            w.t_start -= dur
            w.t_end -= dur
            kept.append(w)
        # else: overlaps the cut range -> dropped
    return kept

def apply_cuts(project: Project, ranges: list[tuple[float, float]]) -> Project:
    """Cuts every approved (start, end) timeline-time range out of the clip sequence, shifting
    text_blocks/video_boxes/caption words after each cut left and dropping caption words that
    overlapped it. Ranges are merged and processed right-to-left so earlier ranges' coordinates
    stay valid without re-deriving anything."""
    merged = merge_ranges(ranges)
    for start, end in sorted(merged, key=lambda r: -r[0]):
        project.clips = cut_clip_range(project.clips, start, end)
        _shift_layers_after(project.text_blocks, start, end)
        _shift_layers_after(project.video_boxes, start, end)
        if project.captions:
            project.captions.words = _cut_caption_words(project.captions.words, start, end)
    return project

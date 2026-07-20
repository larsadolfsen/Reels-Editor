# Splits a multi-word CaptionWord (e.g. "talks about this" authored as one subtitle chunk)
# into per-word estimated sub-ranges, interpolated by character offset within its own
# [t_start, t_end]; a single-word entry passes through unchanged.
# Exposes estimate_word_timings. Consumed by app.ass_render.group_words. Depends on app.models.
from app.models import CaptionWord

def estimate_word_timings(word: CaptionWord) -> list[CaptionWord]:
    tokens = word.text.split()
    if not tokens:
        return []
    normalized = " ".join(tokens)
    total_len = len(normalized)
    duration = word.t_end - word.t_start
    result = []
    offset = 0
    for i, token in enumerate(tokens):
        start_frac = offset / total_len
        end_frac = (offset + len(token)) / total_len
        result.append(CaptionWord(
            id=f"{word.id}-{i}",
            text=token,
            t_start=word.t_start + start_frac * duration,
            t_end=word.t_start + end_frac * duration,
        ))
        offset += len(token) + 1
    return result

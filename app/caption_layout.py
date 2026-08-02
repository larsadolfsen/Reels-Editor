# Pure word-wrap + pagination for the CAPTIONS box: packs CaptionWords onto lines by measured
# pixel width, then paginates lines by box height, so what renders on stage/export always fits
# the caption preset's fixed box size instead of a flat manual word-per-line count.
# Exposes paginate_words. Depends on app.models/app.caption_word_estimate.
from typing import Callable
from app.models import CaptionWord
from app.caption_word_estimate import estimate_word_timings

# A page is "active" on stage/export for its whole [first_word.t_start, last_word.t_end) span
# (see static/preview-captions.js's activeCaptionPage / app/ass_render.py's per-page dialogues).
# Without a gap-aware break, two sentences separated by a real pause could still land on the same
# page purely because they fit the box visually, leaving the caption visibly frozen on screen
# through the silence between them. A gap this long forces a fresh page instead.
GAP_BREAK_SECONDS = 1.0

def paginate_words(
    words: list[CaptionWord],
    measure: Callable[[str], float],
    box_width_px: float,
    box_height_px: float,
    font_size_px: float,
    line_height: float = 1.15,
) -> list[list[list[CaptionWord]]]:
    expanded = [sub for word in words for sub in estimate_word_timings(word)]
    sorted_words = sorted(expanded, key=lambda word: word.t_start)
    if not sorted_words:
        return []

    max_lines = max(1, int(box_height_px // (font_size_px * line_height)))
    pages: list[list[list[CaptionWord]]] = []
    current_page: list[list[CaptionWord]] = []
    current_line: list[CaptionWord] = []
    current_line_text = ""
    prev_end: float | None = None

    for word in sorted_words:
        if prev_end is not None and word.t_start - prev_end > GAP_BREAK_SECONDS:
            if current_line:
                current_page.append(current_line)
                current_line = []
                current_line_text = ""
            if current_page:
                pages.append(current_page)
                current_page = []
        prev_end = word.t_end

        candidate = f"{current_line_text} {word.text}" if current_line_text else word.text
        if current_line and measure(candidate) > box_width_px:
            current_page.append(current_line)
            if len(current_page) >= max_lines:
                pages.append(current_page)
                current_page = []
            current_line = [word]
            current_line_text = word.text
        else:
            current_line.append(word)
            current_line_text = candidate

    if current_line:
        current_page.append(current_line)
    if current_page:
        pages.append(current_page)
    return pages

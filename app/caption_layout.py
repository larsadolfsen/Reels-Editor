# Pure word-wrap + pagination for the CAPTIONS box: packs CaptionWords onto lines by measured
# pixel width, then paginates lines by box height, so what renders on stage/export always fits
# the caption preset's fixed box size instead of a flat manual word-per-line count.
# Exposes paginate_words. Depends on app.models/app.caption_word_estimate.
from typing import Callable
from app.models import CaptionWord
from app.caption_word_estimate import estimate_word_timings

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

    for word in sorted_words:
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

# Text measurement for ASS export word-wrap: a pure wrap algorithm plus a Pillow/fontTools
# adapter that measures the vendored .woff2 fonts (decompressed to sfnt bytes in-memory,
# since Pillow can't load .woff2 directly).
from io import BytesIO
from typing import Callable
from fontTools.ttLib import TTFont
from PIL import ImageFont

_FONT_PATHS = {
    "Public Sans": "static/fonts/PublicSans-Regular.woff2",
    "JetBrains Mono": "static/fonts/JetBrainsMono-Regular.woff2",
}

def wrap_text(text: str, measure_width: Callable[[str], float], max_width_px: float) -> str:
    out_lines = []
    for paragraph in text.split("\n"):
        words = paragraph.split(" ")
        line = words[0]
        for word in words[1:]:
            candidate = f"{line} {word}"
            if measure_width(candidate) <= max_width_px:
                line = candidate
            else:
                out_lines.append(line)
                line = word
        out_lines.append(line)
    return "\n".join(out_lines)

def pil_font_measurer(font_name: str, size_px: int) -> Callable[[str], float]:
    ttfont = TTFont(_FONT_PATHS[font_name])
    ttfont.flavor = None
    buf = BytesIO()
    ttfont.save(buf)
    buf.seek(0)
    pil_font = ImageFont.truetype(buf, size_px)

    def measure(text: str) -> float:
        left, _, right, _ = pil_font.getbbox(text)
        return right - left

    return measure

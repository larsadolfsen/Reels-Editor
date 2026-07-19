# Generates the ASS subtitle files burned into exports: text-block dialogues via render_ass() (accepts an optional text_blocks subset so app/main.py can render one ASS file per z-order band, see app.timeline.banded_layers), and karaoke caption dialogues via render_caption_ass().
# Exposes render_ass, render_caption_ass, group_words, ass_time, hex_to_ass. Consumed by the export route; rendered by libass.
from app.models import Project, TextPreset, CaptionWord
from app.font_metrics import wrap_text, pil_font_measurer, WEIGHT_LABELS, nearest_available_weight

BOX_PAD_X_EM = 0.35
BOX_PAD_Y_EM = 0.15
LINE_HEIGHT = 1.15

def ass_time(s: float) -> str:
    cs = int(s * 100)  # truncate to centiseconds (ASS precision)
    h, rem = divmod(cs, 360000); m, rem = divmod(rem, 6000); sec, cs = divmod(rem, 100)
    return f"{h}:{m:02d}:{sec:02d}.{cs:02d}"

def hex_to_ass(color: str) -> str:
    r, g, b = color[1:3], color[3:5], color[5:7]
    return f"&H00{b}{g}{r}".upper()

def _ass_override_color(hex_color: str) -> str:
    r, g, b = hex_color[1:3], hex_color[3:5], hex_color[5:7]
    return f"&H{b}{g}{r}&".upper()

def _rounded_rect_path(width: float, height: float, radius: float) -> str:
    r = max(0.0, min(radius, width / 2, height / 2))
    if r <= 0:
        return f"m 0 0 l {_n(width)} 0 l {_n(width)} {_n(height)} l 0 {_n(height)}"
    k = r * 0.5523
    return (
        f"m {_n(r)} 0 "
        f"l {_n(width - r)} 0 "
        f"b {_n(width - r + k)} 0 {_n(width)} {_n(r - k)} {_n(width)} {_n(r)} "
        f"l {_n(width)} {_n(height - r)} "
        f"b {_n(width)} {_n(height - r + k)} {_n(width - r + k)} {_n(height)} {_n(width - r)} {_n(height)} "
        f"l {_n(r)} {_n(height)} "
        f"b {_n(r - k)} {_n(height)} 0 {_n(height - r + k)} 0 {_n(height - r)} "
        f"l 0 {_n(r)} "
        f"b 0 {_n(r - k)} {_n(r - k)} 0 {_n(r)} 0"
    )

def _n(v: float) -> str:
    return str(int(v)) if float(v).is_integer() else f"{v:.2f}"

def _resolved_weight(p: TextPreset) -> int:
    """The preset's weight, clamped to one this font actually has a static file for — a preset
    can end up with a weight its font doesn't support (e.g. stale data, or a font swap that didn't
    re-clamp weight), and both the Fontname string and the measurer must agree on an available one."""
    return nearest_available_weight(p.font, p.weight)

def _style(name: str, p: TextPreset, weight: int | None = None) -> str:
    weight = weight if weight is not None else _resolved_weight(p)
    italic = -1 if p.italic else 0
    underline = -1 if p.underline else 0
    fontname = f"{p.font} {WEIGHT_LABELS[weight]}"
    alignment = {"left": 7, "right": 9}.get(p.align, 8)   # ASS numpad: 7/8/9 = top-left/top-center/top-right;
    return (f"Style: {name},{fontname},{p.size_px},{hex_to_ass(p.color)},{hex_to_ass(p.color)},"          # also drives multi-line text justification, matching `align`
            f"{hex_to_ass(p.outline_color)},{hex_to_ass('#000000')},"
            f"0,{italic},{underline},0,100,100,0,0,1,{p.outline_px},0,{alignment},0,0,0,1")   # Bold always 0 — bold-ness lives in Fontname's face selection

def _wrapped_lines_and_size(b, p: TextPreset, weight: int | None = None) -> tuple[str, float, float]:
    weight = weight if weight is not None else _resolved_weight(p)
    measure = pil_font_measurer(p.font, p.size_px, weight)
    pad_x = BOX_PAD_X_EM * p.size_px * 2
    pad_y = BOX_PAD_Y_EM * p.size_px * 2
    width_fixed = p.box_width_mode in ("fixed", "fill")
    height_fixed = p.box_height_mode in ("fixed", "fill")
    if width_fixed:
        text = wrap_text(b.heading, measure, max(1, p.box_width - pad_x))
    else:
        text = b.heading
    lines = text.split("\n")
    width = p.box_width if width_fixed else max(measure(line) for line in lines) + pad_x
    height = p.box_height if height_fixed else len(lines) * p.size_px * LINE_HEIGHT + pad_y
    return text, width, height

def _box_dialogue(b, p: TextPreset, weight: int | None = None) -> str | None:
    if not p.box_background and p.box_border_width <= 0:
        return None
    _, width, height = _wrapped_lines_and_size(b, p, weight)
    if p.align == "left":
        left = p.x
    elif p.align == "right":
        left = p.x - width
    else:
        left = p.x - width / 2
    top = p.y
    path = _rounded_rect_path(width, height, p.box_border_radius)
    fill_color = _ass_override_color(p.box_background_color)
    fill_alpha = f"{round((100 - p.box_background_opacity) / 100 * 255):02X}" if p.box_background else "FF"
    border_color = _ass_override_color(p.box_border_color)
    border_alpha = "00" if p.box_border_width > 0 else "FF"
    fx = (f"\\an7\\pos({left:.0f},{top:.0f})\\bord{p.box_border_width}"
          f"\\1a&H{fill_alpha}&\\3a&H{border_alpha}&\\1c{fill_color}\\3c{border_color}\\p1")
    return f"Dialogue: 0,{ass_time(b.start)},{ass_time(b.end)},P{p.id[:8]}box,,0,0,0,,{{{fx}}}{path}{{\\p0}}"

def _block_dialogue(b, p: TextPreset, weight: int | None = None) -> str:
    fx = f"\\pos({p.x},{p.y})"
    if p.entrance == "fade_pop":
        fx += "\\fad(200,0)\\fscx80\\fscy80\\t(0,200,\\fscx100\\fscy100)"
    text, _, _ = _wrapped_lines_and_size(b, p, weight)
    text = text.replace("\n", "\\N")
    return f"Dialogue: 0,{ass_time(b.start)},{ass_time(b.end)},P{p.id[:8]},,0,0,0,,{{{fx}}}{text}"

def render_ass(project: Project, presets: dict[str, TextPreset], text_blocks: list | None = None) -> str:
    blocks = project.text_blocks if text_blocks is None else text_blocks
    used = {b.preset_id: presets[b.preset_id] for b in blocks}
    header = ("[Script Info]\nScriptType: v4.00+\n"
              f"PlayResX: {project.width}\nPlayResY: {project.height}\nWrapStyle: 2\n\n"
              "[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, "
              "Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, "
              "Alignment, MarginL, MarginR, MarginV, Encoding\n")
    styles = "\n".join(_style(f"P{p.id[:8]}", p, _resolved_weight(p)) for p in used.values())
    event_lines = []
    for b in blocks:
        p = presets[b.preset_id]
        weight = _resolved_weight(p)
        box_line = _box_dialogue(b, p, weight)
        if box_line:
            event_lines.append(box_line)
        event_lines.append(_block_dialogue(b, p, weight))
    events = ("\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n"
              + "\n".join(event_lines))
    return header + styles + events + "\n"

CAPTION_STYLE_NAME = "Caption"

def group_words(words: list[CaptionWord], max_words: int) -> list[list[CaptionWord]]:
    sorted_words = sorted(words, key=lambda w: w.t_start)
    return [sorted_words[i:i + max_words] for i in range(0, len(sorted_words), max_words)]

def _caption_style(p: TextPreset, weight: int) -> str:
    fontname = f"{p.font} {WEIGHT_LABELS[weight]}"
    alignment = {"left": 7, "right": 9}.get(p.align, 8)
    if p.highlight_mode == "progressive_fill":
        primary, secondary = hex_to_ass(p.highlight_color), hex_to_ass(p.color)
    else:
        primary, secondary = hex_to_ass(p.color), hex_to_ass(p.color)
    italic = -1 if p.italic else 0
    underline = -1 if p.underline else 0
    return (f"Style: {CAPTION_STYLE_NAME},{fontname},{p.size_px},{primary},{secondary},"
            f"{hex_to_ass(p.outline_color)},&H00000000,"
            f"0,{italic},{underline},0,100,100,0,0,1,{p.outline_px},0,{alignment},0,0,0,1")

def _karaoke_dialogue(group: list[CaptionWord], p: TextPreset) -> str:
    fx = f"\\pos({p.x},{p.y})"
    body = "".join(f"{{\\k{max(1, round((w.t_end - w.t_start) * 100))}}}{w.text} " for w in group).rstrip()
    start, end = group[0].t_start, group[-1].t_end
    return f"Dialogue: 0,{ass_time(start)},{ass_time(end)},{CAPTION_STYLE_NAME},,0,0,0,,{{{fx}}}{body}"

def _current_word_dialogues(group: list[CaptionWord], p: TextPreset) -> list[str]:
    fx = f"\\pos({p.x},{p.y})"
    highlight = _ass_override_color(p.highlight_color)
    normal = _ass_override_color(p.color)
    lines = []
    for i, active in enumerate(group):
        segments = []
        for j, other in enumerate(group):
            seg = other.text + (" " if j < len(group) - 1 else "")
            segments.append(f"{{\\1c{highlight}}}{seg}{{\\1c{normal}}}" if j == i else seg)
        body = "".join(segments)
        lines.append(f"Dialogue: 0,{ass_time(active.t_start)},{ass_time(active.t_end)},"
                      f"{CAPTION_STYLE_NAME},,0,0,0,,{{{fx}}}{body}")
    return lines

def render_caption_ass(project: Project, preset: TextPreset) -> str:
    words = project.captions.words if project.captions else []
    weight = _resolved_weight(preset)
    header = ("[Script Info]\nScriptType: v4.00+\n"
              f"PlayResX: {project.width}\nPlayResY: {project.height}\nWrapStyle: 2\n\n"
              "[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, "
              "Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, "
              "Alignment, MarginL, MarginR, MarginV, Encoding\n")
    styles = _caption_style(preset, weight)
    groups = group_words(words, preset.max_words_per_line)
    event_lines = []
    for g in groups:
        if preset.highlight_mode == "current_word":
            event_lines.extend(_current_word_dialogues(g, preset))
        else:
            event_lines.append(_karaoke_dialogue(g, preset))
    events = ("\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n"
              + "\n".join(event_lines))
    return header + styles + events + "\n"

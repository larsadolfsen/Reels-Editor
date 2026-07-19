# Generates the ASS subtitle file burned into exports: text-block dialogues (+captions, Task 12).
# Exposes render_ass, ass_time, hex_to_ass. Consumed by the export route; rendered by libass.
from app.models import Project, TextPreset
from app.font_metrics import wrap_text, pil_font_measurer, WEIGHT_LABELS

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

def _style(name: str, p: TextPreset) -> str:
    italic = -1 if p.italic else 0
    underline = -1 if p.underline else 0
    fontname = f"{p.font} {WEIGHT_LABELS[p.weight]}"
    return (f"Style: {name},{fontname},{p.size_px},{hex_to_ass(p.color)},{hex_to_ass(p.color)},"
            f"{hex_to_ass(p.outline_color)},{hex_to_ass('#000000')},"
            f"0,{italic},{underline},0,100,100,0,0,1,{p.outline_px},0,5,0,0,0,1")   # alignment 5 = center anchor, \pos places it; Bold always 0 — bold-ness lives in Fontname's face selection

def _wrapped_lines_and_size(b, p: TextPreset) -> tuple[str, float, float]:
    measure = pil_font_measurer(p.font, p.size_px, p.weight)
    pad_x = BOX_PAD_X_EM * p.size_px * 2
    pad_y = BOX_PAD_Y_EM * p.size_px * 2
    if p.box_width_mode == "fixed":
        text = wrap_text(b.heading, measure, max(1, p.box_width - pad_x))
    else:
        text = b.heading
    lines = text.split("\n")
    width = p.box_width if p.box_width_mode == "fixed" else max(measure(line) for line in lines) + pad_x
    height = p.box_height if p.box_height_mode == "fixed" else len(lines) * p.size_px * LINE_HEIGHT + pad_y
    return text, width, height

def _box_dialogue(b, p: TextPreset) -> str | None:
    if not p.box_background and p.box_border_width <= 0:
        return None
    _, width, height = _wrapped_lines_and_size(b, p)
    left = p.x - width / 2
    top = p.y - height / 2
    path = _rounded_rect_path(width, height, p.box_border_radius)
    fill_color = _ass_override_color(p.box_background_color)
    fill_alpha = f"{round((100 - p.box_background_opacity) / 100 * 255):02X}" if p.box_background else "FF"
    border_color = _ass_override_color(p.box_border_color)
    border_alpha = "00" if p.box_border_width > 0 else "FF"
    fx = (f"\\an7\\pos({left:.0f},{top:.0f})\\bord{p.box_border_width}"
          f"\\1a&H{fill_alpha}&\\3a&H{border_alpha}&\\1c{fill_color}\\3c{border_color}\\p1")
    return f"Dialogue: 0,{ass_time(b.start)},{ass_time(b.end)},P{p.id[:8]}box,,0,0,0,,{{{fx}}}{path}{{\\p0}}"

def _block_dialogue(b, p: TextPreset) -> str:
    fx = f"\\pos({p.x},{p.y})"
    if p.entrance == "fade_pop":
        fx += "\\fad(200,0)\\fscx80\\fscy80\\t(0,200,\\fscx100\\fscy100)"
    text, _, _ = _wrapped_lines_and_size(b, p)
    text = text.replace("\n", "\\N")
    return f"Dialogue: 0,{ass_time(b.start)},{ass_time(b.end)},P{p.id[:8]},,0,0,0,,{{{fx}}}{text}"

def render_ass(project: Project, presets: dict[str, TextPreset]) -> str:
    used = {b.preset_id: presets[b.preset_id] for b in project.text_blocks}
    header = ("[Script Info]\nScriptType: v4.00+\n"
              f"PlayResX: {project.width}\nPlayResY: {project.height}\nWrapStyle: 2\n\n"
              "[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, "
              "Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, "
              "Alignment, MarginL, MarginR, MarginV, Encoding\n")
    styles = "\n".join(_style(f"P{p.id[:8]}", p) for p in used.values())
    event_lines = []
    for b in project.text_blocks:
        p = presets[b.preset_id]
        box_line = _box_dialogue(b, p)
        if box_line:
            event_lines.append(box_line)
        event_lines.append(_block_dialogue(b, p))
    events = ("\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n"
              + "\n".join(event_lines))
    return header + styles + events + "\n"

# Generates the ASS subtitle file burned into exports: text-block dialogues (+captions, Task 12).
# Exposes render_ass, ass_time, hex_to_ass. Consumed by the export route; rendered by libass.
from app.models import Project, TextPreset

def ass_time(s: float) -> str:
    cs = int(s * 100)  # truncate to centiseconds (ASS precision)
    h, rem = divmod(cs, 360000); m, rem = divmod(rem, 6000); sec, cs = divmod(rem, 100)
    return f"{h}:{m:02d}:{sec:02d}.{cs:02d}"

def hex_to_ass(color: str) -> str:
    r, g, b = color[1:3], color[3:5], color[5:7]
    return f"&H00{b}{g}{r}".upper()

def _style(name: str, p: TextPreset) -> str:
    border = 3 if p.box else 1
    return (f"Style: {name},{p.font},{p.size_px},{hex_to_ass(p.color)},{hex_to_ass(p.color)},"
            f"{hex_to_ass(p.outline_color if not p.box else p.box_color)},{hex_to_ass(p.box_color)},"
            f"-1,0,0,0,100,100,0,0,{border},{p.outline_px},0,5,0,0,0,1")   # alignment 5 = center anchor, \pos places it

def _block_dialogue(b, p: TextPreset) -> str:
    fx = f"\\pos({p.x},{p.y})"
    if p.entrance == "fade_pop":
        fx += "\\fad(200,0)\\fscx80\\fscy80\\t(0,200,\\fscx100\\fscy100)"
    return f"Dialogue: 0,{ass_time(b.start)},{ass_time(b.end)},P{p.id[:8]},,0,0,0,,{{{fx}}}{b.heading}"

def render_ass(project: Project, presets: dict[str, TextPreset]) -> str:
    used = {b.preset_id: presets[b.preset_id] for b in project.text_blocks}
    header = ("[Script Info]\nScriptType: v4.00+\n"
              f"PlayResX: {project.width}\nPlayResY: {project.height}\nWrapStyle: 2\n\n"
              "[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, "
              "Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, "
              "Alignment, MarginL, MarginR, MarginV, Encoding\n")
    styles = "\n".join(_style(f"P{p.id[:8]}", p) for p in used.values())
    events = ("\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n"
              + "\n".join(_block_dialogue(b, presets[b.preset_id]) for b in project.text_blocks))
    return header + styles + events + "\n"

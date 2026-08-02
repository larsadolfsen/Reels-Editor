# Generates the ASS subtitle files burned into exports: text-block dialogues via render_ass() (accepts an optional text_blocks subset so app/main.py can render one ASS file per z-order band, see app.timeline.banded_layers), and karaoke caption dialogues via render_caption_ass() (word-wrap/pagination against the caption box's fixed size via app.caption_layout.paginate_words); both apply TextPreset.text_case via app.text_case before measuring/emitting.
# Exposes render_ass, render_caption_ass, ass_time, hex_to_ass. Consumed by the export route; rendered by libass.
from typing import Callable
from app.models import Project, TextPreset, CaptionWord
from app.font_metrics import wrap_text, wrap_text_runs, pil_font_measurer, WEIGHT_LABELS, nearest_available_weight
from app.caption_layout import paginate_words
from app.text_case import apply_text_case

CAPTION_PAD_LEFT_PX = 4   # captions only — text blocks are padding-free, their box hugs the glyphs
CAPTION_PAD_RIGHT_PX = 4
CAPTION_PAD_TOP_PX = 4
CAPTION_PAD_BOTTOM_PX = 3
LINE_HEIGHT = 1.15
HIGHLIGHT_PAD_EM = 0.2    # equal padding on all 4 sides of a per-line/per-word highlight rect
MIN_LINE_GAP_EM = 0.05    # minimum vertical gap (fraction of size_px) reserved between two adjacent
                          # lines' highlight rects on the same page — HIGHLIGHT_PAD_EM's vertical
                          # padding is clamped so it can never eat into this, otherwise a multi-line
                          # page's per-line rects overlap and merge into one solid block (the rects
                          # are stacked LINE_HEIGHT apart, which has less slack than 2*HIGHLIGHT_PAD_EM)

CAPTION_DEFAULT_BOX_WIDTH = 900    # px on the 1080x1920 canvas — used when the preset predates fixed-size captions
CAPTION_DEFAULT_BOX_HEIGHT = 350   # px

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

def _measure_range_for(b, p: TextPreset, weight: int) -> Callable[[int, int], float]:
    """Builds a measure_range(start, end) callable over b.heading that's aware of
    b.formatting_runs — a range spanning multiple runs (or run + unstyled text) is split at
    each run boundary and measured with that piece's own font/size/weight, then summed."""
    base_measure = pil_font_measurer(p.font, p.size_px, weight)
    if not b.formatting_runs:
        return lambda s, e: base_measure(b.heading[s:e])

    boundaries = sorted({0, len(b.heading)} | {r.start for r in b.formatting_runs} | {r.end for r in b.formatting_runs})
    measurer_cache: dict[tuple[str, int, int], Callable[[str], float]] = {}

    def measurer_for(pos: int) -> Callable[[str], float]:
        run = next((r for r in b.formatting_runs if r.start <= pos < r.end), None)
        font = (run.font if run and run.font else p.font)
        size = (run.size_px if run and run.size_px else p.size_px)
        rweight = nearest_available_weight(font, run.weight if run and run.weight else weight)
        key = (font, size, rweight)
        if key not in measurer_cache:
            measurer_cache[key] = pil_font_measurer(*key)
        return measurer_cache[key]

    def measure_range(start: int, end: int) -> float:
        total = 0.0
        pos = start
        for b_end in boundaries:
            if b_end <= pos:
                continue
            seg_end = min(b_end, end)
            if seg_end > pos:
                total += measurer_for(pos)(b.heading[pos:seg_end])
                pos = seg_end
            if pos >= end:
                break
        return total

    return measure_range

def _wrapped_lines_and_size(b, p: TextPreset, weight: int | None = None) -> tuple[str, float, float, list[tuple[int, int]]]:
    weight = weight if weight is not None else _resolved_weight(p)
    measure_range = _measure_range_for(b, p, weight)
    width_fixed = p.box_width_mode in ("fixed", "fill")
    height_fixed = p.box_height_mode in ("fixed", "fill")
    if width_fixed:
        text, spans = wrap_text_runs(b.heading, measure_range, max(1, p.box_width))
    else:
        text = b.heading
        spans = [(0, len(b.heading))] if "\n" not in b.heading else _spans_for_hard_breaks(b.heading)
    lines = text.split("\n")
    width = p.box_width if width_fixed else max(measure_range(s, e) for s, e in spans)
    height = p.box_height if height_fixed else len(lines) * p.size_px * LINE_HEIGHT
    return text, width, height, spans

def _spans_for_hard_breaks(text: str) -> list[tuple[int, int]]:
    spans = []
    pos = 0
    for line in text.split("\n"):
        spans.append((pos, pos + len(line)))
        pos += len(line) + 1
    return spans

def _box_dialogue(b, p: TextPreset, weight: int | None = None) -> str | None:
    if not p.box_background and p.box_border_width <= 0:
        return None
    _, width, height, _ = _wrapped_lines_and_size(b, p, weight)
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

def _run_style_tag(p: TextPreset, run: "FormatRun | None") -> str:
    """Full ASS override tag switching to a run's effective style (base preset + this run's
    sparse overrides), or back to the base style when run is None. Always emits every field
    rather than a diff against the previous state, so each run's tag is self-contained and the
    reset-to-base tag after a run ends never has to remember what came before it."""
    font = (run.font if run and run.font else p.font)
    size = (run.size_px if run and run.size_px else p.size_px)
    weight = nearest_available_weight(font, run.weight if run and run.weight else p.weight)
    color = (run.color if run and run.color else p.color)
    outline_color = (run.outline_color if run and run.outline_color else p.outline_color)
    outline_px = (run.outline_px if run and run.outline_px is not None else p.outline_px)
    italic = (run.italic if run and run.italic is not None else p.italic)
    underline = (run.underline if run and run.underline is not None else p.underline)
    fontname = f"{font} {WEIGHT_LABELS[weight]}"
    return (f"\\fn{fontname}\\fs{size}\\1c{_ass_override_color(color)}\\3c{_ass_override_color(outline_color)}"
            f"\\bord{outline_px}\\i{1 if italic else 0}\\u{1 if underline else 0}")

def _run_at(runs: list, offset: int):
    return next((r for r in runs if r.start <= offset < r.end), None)

def _tagged_text(b, p: TextPreset, text: str) -> str:
    """text is the wrapped output of _wrapped_lines_and_size — same length as b.heading except
    word-break spaces have become \\n in place, so offsets into b.heading still line up 1:1."""
    out = []
    active = "unset"
    for i, ch in enumerate(text):
        run = _run_at(b.formatting_runs, i)
        if run is not active:
            out.append(f"{{{_run_style_tag(p, run)}}}")
            active = run
        out.append("\\N" if ch == "\n" else ch)
    return "".join(out)

def _highlight_dialogues(b, p: TextPreset, weight: int | None = None) -> list[str]:
    if not b.formatting_runs:
        return []
    weight = weight if weight is not None else _resolved_weight(p)
    measure_range = _measure_range_for(b, p, weight)
    _, _, _, line_spans = _wrapped_lines_and_size(b, p, weight)
    out = []
    for run_i, run in enumerate(b.formatting_runs):
        highlighted = run.highlight if run.highlight is not None else p.highlight
        if not highlighted:
            continue
        color = run.highlight_color or p.highlight_color
        fill = _ass_override_color(color)
        for line_i, (line_start, line_end) in enumerate(line_spans):
            s, e = max(run.start, line_start), min(run.end, line_end)
            if s >= e:
                continue
            line_width = measure_range(line_start, line_end)
            if p.align == "left":
                left_origin = p.x
            elif p.align == "right":
                left_origin = p.x - line_width
            else:
                left_origin = p.x - line_width / 2
            x_offset = measure_range(line_start, s)
            rect_width = measure_range(s, e)
            rect_height = p.size_px * LINE_HEIGHT
            top = p.y + line_i * rect_height
            path = _rounded_rect_path(rect_width, rect_height, p.highlight_border_radius)
            fx = f"\\an7\\pos({left_origin + x_offset:.0f},{top:.0f})\\1a&H00&\\3a&HFF&\\1c{fill}\\p1"
            out.append(f"Dialogue: 0,{ass_time(b.start)},{ass_time(b.end)},"
                        f"P{p.id[:8]}hl{run_i}_{line_i},,0,0,0,,{{{fx}}}{path}{{\\p0}}")
    return out

def _shadow_tag(p: TextPreset) -> str:
    """ASS override tags for a whole-preset drop shadow: \\4c/\\4a set the shadow (back) color
    to opaque, \\xshad/\\yshad set independent offsets (overriding the style line's uniform
    Shadow distance, which stays 0), \\blur softens edges. Note ASS has no shadow-only blur
    primitive — \\blur softens both outline and shadow together."""
    if not p.shadow:
        return ""
    color = _ass_override_color(p.shadow_color)
    return f"\\4c{color}\\4a00\\xshad{p.shadow_offset_x}\\yshad{p.shadow_offset_y}\\blur{p.shadow_blur}"

def _shadow_only_fx(p: TextPreset) -> str:
    """Override tags for a shadow-ONLY render: fill and outline forced fully transparent so only
    the offset, blurred back-copy (the shadow) is visible. Isolates \\blur to this layer, since
    libass's \\blur otherwise softens the whole composited glyph (fill+outline+shadow) when
    applied in the same override block as the main text — the cause of "foggy" export letters
    when a preset has Shadow on with BLUR > 0, even though the CSS preview only blurs the
    shadow layer. Caller must guard on p.shadow being true before emitting a line with this."""
    return "\\1a&HFF&\\3a&HFF&" + _shadow_tag(p)

def _block_dialogue(b, p: TextPreset, weight: int | None = None) -> list[str]:
    pos_fx = f"\\pos({p.x},{p.y})"
    entrance_fx = ""
    if p.entrance == "fade_pop":
        entrance_fx = "\\fad(200,0)\\fscx80\\fscy80\\t(0,200,\\fscx100\\fscy100)"
    text, _, _, _ = _wrapped_lines_and_size(b, p, weight)
    if b.formatting_runs:
        body = _tagged_text(b, p, text)
    else:
        body = text.replace("\n", "\\N")
    lines = []
    if p.shadow:
        shadow_fx = pos_fx + _shadow_only_fx(p) + entrance_fx
        lines.append(f"Dialogue: 0,{ass_time(b.start)},{ass_time(b.end)},P{p.id[:8]},shadow,0,0,0,,{{{shadow_fx}}}{body}")
    fx = pos_fx + entrance_fx
    lines.append(f"Dialogue: 0,{ass_time(b.start)},{ass_time(b.end)},P{p.id[:8]},,0,0,0,,{{{fx}}}{body}")
    return lines

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
        if p.text_case != "none":
            # Substitute a transformed copy so measurement, wrapping, run tagging, and highlight
            # dialogues all see the same string; the caller's model stays as typed.
            b = b.model_copy(update={"heading": apply_text_case(b.heading, p.text_case)})
        weight = _resolved_weight(p)
        box_line = _box_dialogue(b, p, weight)
        if box_line:
            event_lines.append(box_line)
        event_lines.extend(_highlight_dialogues(b, p, weight))
        event_lines.extend(_block_dialogue(b, p, weight))
    events = ("\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n"
              + "\n".join(event_lines))
    return header + styles + events + "\n"

CAPTION_STYLE_NAME = "Caption"

def _caption_style(p: TextPreset, weight: int) -> str:
    fontname = f"{p.font} {WEIGHT_LABELS[weight]}"
    alignment = {"left": 7, "right": 9}.get(p.align, 8)
    if p.highlight_mode == "progressive_fill":
        primary, secondary = hex_to_ass(p.spotlight_color), hex_to_ass(p.color)
    else:
        primary, secondary = hex_to_ass(p.color), hex_to_ass(p.color)
    italic = -1 if p.italic else 0
    underline = -1 if p.underline else 0
    return (f"Style: {CAPTION_STYLE_NAME},{fontname},{p.size_px},{primary},{secondary},"
            f"{hex_to_ass(p.outline_color)},&H00000000,"
            f"0,{italic},{underline},0,100,100,0,0,1,{p.outline_px},0,{alignment},0,0,0,1")

def _karaoke_dialogue(page: list[list[CaptionWord]], p: TextPreset) -> str:
    fx = f"\\pos({p.x},{p.y})" + _shadow_tag(p)
    line_bodies = []
    for line in page:
        body = "".join(f"{{\\k{max(1, round((w.t_end - w.t_start) * 100))}}}{w.text} " for w in line).rstrip()
        line_bodies.append(body)
    body = "\\N".join(line_bodies)
    start, end = page[0][0].t_start, page[-1][-1].t_end
    return f"Dialogue: 0,{ass_time(start)},{ass_time(end)},{CAPTION_STYLE_NAME},,0,0,0,,{{{fx}}}{body}"

def _current_word_dialogues(page: list[list[CaptionWord]], p: TextPreset) -> list[str]:
    fx = f"\\pos({p.x},{p.y})" + _shadow_tag(p)
    highlight = _ass_override_color(p.spotlight_color)
    normal = _ass_override_color(p.color)
    outline_on = f"\\3c{_ass_override_color(p.spotlight_outline_color)}\\bord{p.spotlight_outline_px}" if p.spotlight_outline_px > 0 else ""
    outline_off = f"\\3c{_ass_override_color(p.outline_color)}\\bord{p.outline_px}" if p.spotlight_outline_px > 0 else ""
    shadow_on = (f"\\4c{_ass_override_color(p.spotlight_shadow_color)}\\4a00"
                 f"\\xshad{p.spotlight_shadow_offset_x}\\yshad{p.spotlight_shadow_offset_y}\\blur{p.spotlight_shadow_blur}"
                 if p.spotlight_shadow else "")
    shadow_off = ("\\4c" + _ass_override_color(p.shadow_color) + "\\4a00" +
                  f"\\xshad{p.shadow_offset_x}\\yshad{p.shadow_offset_y}\\blur{p.shadow_blur}"
                  if p.spotlight_shadow and p.shadow else
                  ("\\4a&HFF&" if p.spotlight_shadow else ""))
    flat = [word for line in page for word in line]
    dialogues = []
    for active in flat:
        line_bodies = []
        for line in page:
            segments = []
            for j, other in enumerate(line):
                seg = other.text + (" " if j < len(line) - 1 else "")
                if other is active:
                    segments.append(f"{{\\1c{highlight}{outline_on}{shadow_on}}}{seg}{{\\1c{normal}{outline_off}{shadow_off}}}")
                else:
                    segments.append(seg)
            line_bodies.append("".join(segments))
        body = "\\N".join(line_bodies)
        dialogues.append(f"Dialogue: 0,{ass_time(active.t_start)},{ass_time(active.t_end)},"
                          f"{CAPTION_STYLE_NAME},,0,0,0,,{{{fx}}}{body}")
    return dialogues

def _line_word_offsets(line: list[CaptionWord], measure: Callable[[str], float]) -> tuple[list[tuple[float, float]], float]:
    """For one line of words: per-word (x_offset, bare glyph width) plus the line's total width
    (word widths + inter-word spaces). Shared by _active_word_highlight_dialogues and
    _caption_highlight_dialogues so both measure lines identically."""
    offsets = []
    x = 0.0
    for j, word in enumerate(line):
        seg = word.text + (" " if j < len(line) - 1 else "")
        offsets.append((x, measure(word.text)))
        x += measure(seg)
    return offsets, x

def _line_left_origin(p: TextPreset, line_width: float) -> float:
    if p.align == "left":
        return p.x
    if p.align == "right":
        return p.x - line_width
    return p.x - line_width / 2

def _active_word_highlight_dialogues(page: list[list[CaptionWord]], p: TextPreset) -> list[str]:
    """Draws a rounded rect behind the currently-active word (no text-color swap). Callable
    regardless of highlight_mode — the caller (render_caption_ass) decides when to invoke it,
    gated on preset.spotlight_highlight. Same per-line x-offset/width math _caption_highlight_dialogues
    uses for TEXT-block marker highlights, and the same align-relative left-origin convention
    _caption_style's Alignment field expects (p.x is the line's left/right/center anchor depending
    on p.align). The rect is padded by HIGHLIGHT_PAD_EM on all 4 sides around the word's tight
    glyph box (size_px tall, not the looser size_px*LINE_HEIGHT line pitch), vertically centered
    within that line's pitch slot so the padding reads as equal on all sides rather than being
    swallowed by line-height leading."""
    if not p.spotlight_highlight or not page:
        return []
    weight = _resolved_weight(p)
    measure = pil_font_measurer(p.font, p.size_px, weight)
    fill = _ass_override_color(p.spotlight_highlight_color)
    pad = HIGHLIGHT_PAD_EM * p.size_px
    line_pitch = p.size_px * LINE_HEIGHT
    rect_height = p.size_px + 2 * pad

    line_layout = [_line_word_offsets(line, measure) for line in page]

    dialogues = []
    for line_i, line in enumerate(page):
        offsets, line_width = line_layout[line_i]
        left_origin = _line_left_origin(p, line_width)
        top = p.y + line_i * line_pitch + (line_pitch - rect_height) / 2
        for word_i, active in enumerate(line):
            word_x, word_w = offsets[word_i]
            left = left_origin + word_x - pad
            path = _rounded_rect_path(word_w + 2 * pad, rect_height, p.spotlight_highlight_border_radius)
            rect_fx = f"\\an7\\pos({left:.0f},{top:.0f})\\1a&H00&\\3a&HFF&\\1c{fill}\\p1"
            dialogues.append(f"Dialogue: 0,{ass_time(active.t_start)},{ass_time(active.t_end)},"
                              f"{CAPTION_STYLE_NAME},,0,0,0,,{{{rect_fx}}}{path}{{\\p0}}")
    return dialogues

def _caption_highlight_dialogues(page: list[list[CaptionWord]], p: TextPreset) -> list[str]:
    """CAPTIONS always-on marker highlight (preset.highlight): one rounded rect per visible line,
    hugging that line's actual rendered text (not the fixed caption box), padded by
    HIGHLIGHT_PAD_EM on all 4 sides the same way _active_word_highlight_dialogues pads a word —
    tight to the glyph height (size_px), vertically centered in the line's pitch slot. Independent
    of highlight_mode's per-word rendering (current_word/progressive_fill) and of the separate
    spotlight_highlight-gated active-word rect. Spans the whole page's active window (first word's
    t_start to last word's t_end in this page), same as the page's own text dialogue. Unlike
    _active_word_highlight_dialogues (only ever one word visible at a time, so its rect can never
    collide with a sibling), every line's rect here is visible simultaneously — rect_height is
    clamped to leave MIN_LINE_GAP_EM of vertical breathing room, or a 2+ line page's rects would
    overlap and merge into one solid block (HIGHLIGHT_PAD_EM's full vertical padding needs more
    slack than LINE_HEIGHT leaves between stacked lines)."""
    if not p.highlight or not page:
        return []
    weight = _resolved_weight(p)
    measure = pil_font_measurer(p.font, p.size_px, weight)
    fill = _ass_override_color(p.highlight_color)
    pad = HIGHLIGHT_PAD_EM * p.size_px
    line_pitch = p.size_px * LINE_HEIGHT
    rect_height = min(p.size_px + 2 * pad, line_pitch - MIN_LINE_GAP_EM * p.size_px)
    flat = [word for line in page for word in line]
    start, end = flat[0].t_start, flat[-1].t_end
    out = []
    for line_i, line in enumerate(page):
        _, line_width = _line_word_offsets(line, measure)
        left_origin = _line_left_origin(p, line_width)
        left = left_origin - pad
        top = p.y + line_i * line_pitch + (line_pitch - rect_height) / 2
        path = _rounded_rect_path(line_width + 2 * pad, rect_height, p.highlight_border_radius)
        fx = f"\\an7\\pos({left:.0f},{top:.0f})\\1a&H00&\\3a&HFF&\\1c{fill}\\p1"
        out.append(f"Dialogue: 0,{ass_time(start)},{ass_time(end)},{CAPTION_STYLE_NAME},,0,0,0,,{{{fx}}}{path}{{\\p0}}")
    return out

def render_caption_ass(project: Project, preset: TextPreset) -> str:
    words = project.captions.words if project.captions else []
    if preset.text_case != "none":
        words = [w.model_copy(update={"text": apply_text_case(w.text, preset.text_case)}) for w in words]
    weight = _resolved_weight(preset)
    header = ("[Script Info]\nScriptType: v4.00+\n"
              f"PlayResX: {project.width}\nPlayResY: {project.height}\nWrapStyle: 2\n\n"
              "[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, "
              "Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, "
              "Alignment, MarginL, MarginR, MarginV, Encoding\n")
    styles = _caption_style(preset, weight)
    box_width = preset.box_width if preset.box_width_mode == "fixed" and preset.box_width > 0 else CAPTION_DEFAULT_BOX_WIDTH
    box_height = preset.box_height if preset.box_height_mode == "fixed" and preset.box_height > 0 else CAPTION_DEFAULT_BOX_HEIGHT
    pad_x = CAPTION_PAD_LEFT_PX + CAPTION_PAD_RIGHT_PX
    pad_y = CAPTION_PAD_TOP_PX + CAPTION_PAD_BOTTOM_PX
    measure = pil_font_measurer(preset.font, preset.size_px, weight)
    pages = paginate_words(words, measure, max(1, box_width - pad_x), max(1, box_height - pad_y), preset.size_px, LINE_HEIGHT)
    event_lines = []
    for page in pages:
        event_lines.extend(_caption_highlight_dialogues(page, preset))
        if preset.highlight_mode != "off":
            event_lines.extend(_active_word_highlight_dialogues(page, preset))
        if preset.highlight_mode == "current_word":
            event_lines.extend(_current_word_dialogues(page, preset))
        else:
            event_lines.append(_karaoke_dialogue(page, preset))
    events = ("\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n"
              + "\n".join(event_lines))
    return header + styles + events + "\n"

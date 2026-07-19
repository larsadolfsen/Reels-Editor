# Tests for app.ass_render: ASS time/color helpers and text-block dialogue generation.
from app.models import Project, TextBlockLayer, TextPreset
from app.ass_render import ass_time, hex_to_ass, render_ass

def test_helpers():
    assert ass_time(83.456) == "0:01:23.45"
    assert hex_to_ass("#FFD400") == "&H0000D4FF"        # AABBGGRR, alpha 00

def test_text_block_dialogue():
    pr = TextPreset(name="Pop", size_px=96, x=540, y=700)
    p = Project(name="r", text_blocks=[TextBlockLayer(heading="BIG NEWS", preset_id=pr.id, start=1.0, end=4.0)])
    out = render_ass(p, {pr.id: pr})
    assert "PlayResX: 1080" in out and "PlayResY: 1920" in out
    line = next(l for l in out.splitlines() if l.startswith("Dialogue:") and "BIG NEWS" in l)
    assert "0:00:01.00" in line and "0:00:04.00" in line
    assert "\\pos(540,700)" in line and "\\fad(200,0)" in line          # fade_pop entrance
    assert "\\t(0,200,\\fscx100\\fscy100)" in line and "\\fscx80\\fscy80" in line

def test_entrance_none_has_no_fad():
    pr = TextPreset(name="Plain", entrance="none")
    p = Project(name="r", text_blocks=[TextBlockLayer(heading="H", preset_id=pr.id, start=0, end=2)])
    assert "\\fad" not in render_ass(p, {pr.id: pr})

def test_style_line_bold_column_is_always_zero_regardless_of_weight():
    # Bold-ness now lives entirely in which font face Fontname selects, not in ASS's
    # synthetic-bold flag — setting both would double-bold a 700-weight face.
    pr = TextPreset(name="Pop", weight=700, italic=True, underline=True)
    p = Project(name="r", text_blocks=[TextBlockLayer(heading="H", preset_id=pr.id, start=0, end=2)])
    out = render_ass(p, {pr.id: pr})
    line = next(l for l in out.splitlines() if l.startswith("Style:"))
    fields = line.split(",")
    # Format: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,
    #         Bold,Italic,Underline,StrikeOut,...
    assert fields[7:10] == ["0", "-1", "-1"]

def test_style_line_defaults_no_italic_underline():
    pr = TextPreset(name="Plain")
    p = Project(name="r", text_blocks=[TextBlockLayer(heading="H", preset_id=pr.id, start=0, end=2)])
    out = render_ass(p, {pr.id: pr})
    line = next(l for l in out.splitlines() if l.startswith("Style:"))
    fields = line.split(",")
    assert fields[7:10] == ["0", "0", "0"]

def test_style_line_fontname_includes_weight_label():
    pr = TextPreset(name="Pop", font="Public Sans", weight=500)
    p = Project(name="r", text_blocks=[TextBlockLayer(heading="H", preset_id=pr.id, start=0, end=2)])
    out = render_ass(p, {pr.id: pr})
    line = next(l for l in out.splitlines() if l.startswith("Style:"))
    fields = line.split(",")
    assert fields[1] == "Public Sans Medium"

def test_style_line_fontname_includes_regular_label_at_default_weight():
    # 400 gets its own generated "Regular" static file too, rather than a bare unsuffixed
    # family name — uniform handling across all four weights, no special-casing 400.
    pr = TextPreset(name="Pop", font="Public Sans")
    p = Project(name="r", text_blocks=[TextBlockLayer(heading="H", preset_id=pr.id, start=0, end=2)])
    out = render_ass(p, {pr.id: pr})
    line = next(l for l in out.splitlines() if l.startswith("Style:"))
    fields = line.split(",")
    assert fields[1] == "Public Sans Regular"

def test_font_weight_mismatch_clamps_to_nearest_available_weight():
    # JetBrains Mono has no 600 (SemiBold) static file — weight=600 must not raise (KeyError from
    # the measurer) and must not reference a nonexistent "SemiBold" face in Fontname (which would
    # silently fall back to a system font in libass, the exact bug this feature eliminates).
    pr = TextPreset(name="Pop", font="JetBrains Mono", weight=600)
    p = Project(name="r", text_blocks=[TextBlockLayer(heading="H", preset_id=pr.id, start=0, end=2)])
    out = render_ass(p, {pr.id: pr})
    line = next(l for l in out.splitlines() if l.startswith("Style:"))
    fields = line.split(",")
    assert fields[1] == "JetBrains Mono Medium"        # clamped to 500, not the missing 600 "SemiBold"

def test_multiline_heading_becomes_ass_hard_break():
    pr = TextPreset(name="Pop")
    p = Project(name="r", text_blocks=[TextBlockLayer(heading="LINE ONE\nLINE TWO", preset_id=pr.id, start=0, end=2)])
    out = render_ass(p, {pr.id: pr})
    line = next(l for l in out.splitlines() if l.startswith("Dialogue:"))
    assert "LINE ONE\\NLINE TWO" in line

from app.ass_render import _rounded_rect_path, _ass_override_color, _box_dialogue, _wrapped_lines_and_size

def test_rounded_rect_path_square_corners_when_radius_zero():
    path = _rounded_rect_path(100, 50, 0)
    assert path == "m 0 0 l 100 0 l 100 50 l 0 50"

def test_rounded_rect_path_has_four_bezier_corners_when_radius_positive():
    path = _rounded_rect_path(100, 50, 10)
    assert path.startswith("m 10 0")
    assert path.count(" b ") == 4

def test_rounded_rect_path_clamps_radius_to_half_min_dimension():
    path = _rounded_rect_path(20, 100, 50)
    assert path.startswith("m 10 0")   # radius clamped to width/2 = 10

def test_ass_override_color_format():
    assert _ass_override_color("#FFD400") == "&H00D4FF&"

def test_box_dialogue_none_when_no_background_and_no_border():
    pr = TextPreset(name="Plain")
    b = TextBlockLayer(heading="H", preset_id=pr.id, start=0, end=2)
    assert _box_dialogue(b, pr) is None

def test_box_dialogue_present_when_background_enabled():
    pr = TextPreset(name="Pop", box_background=True, box_background_color="#FF0000",
                     box_width_mode="fixed", box_width=300, box_height_mode="fixed", box_height=100)
    b = TextBlockLayer(heading="H", preset_id=pr.id, start=1.0, end=3.0)
    line = _box_dialogue(b, pr)
    assert line is not None
    assert line.startswith("Dialogue:")
    assert "0:00:01.00" in line and "0:00:03.00" in line
    assert "\\p1" in line and "\\p0" in line

def test_box_dialogue_partial_opacity_produces_intermediate_alpha():
    # box_background_opacity is a percent (100 = fully opaque); ASS alpha is inverted
    # (00 = opaque, FF = transparent), so 50% opacity should land roughly halfway (0x80),
    # neither the fully-opaque "00" nor the fully-transparent "FF" the old binary logic used.
    pr = TextPreset(name="Pop", box_background=True, box_background_color="#FF0000",
                     box_background_opacity=50,
                     box_width_mode="fixed", box_width=300, box_height_mode="fixed", box_height=100)
    b = TextBlockLayer(heading="H", preset_id=pr.id, start=0, end=2)
    line = _box_dialogue(b, pr)
    assert "\\1a&H80&" in line
    assert "\\1a&H00&" not in line and "\\1a&HFF&" not in line

def test_box_dialogue_pos_is_anchored_top_left():
    # The box's Style field names a style ("...box") that render_ass never defines in
    # [V4+ Styles], so libass falls back to undefined alignment behavior for \pos unless
    # the dialogue's own override forces top-left anchoring explicitly (\an7) — without
    # this, \pos(left, top) gets re-centered around the shape's bounding box instead of
    # anchoring its top-left corner, visibly offsetting the box from the text it should
    # sit behind (caught by comparing an actual export frame against the editor preview).
    pr = TextPreset(name="Pop", box_background=True, box_width_mode="fixed", box_width=300,
                     box_height_mode="fixed", box_height=100)
    b = TextBlockLayer(heading="H", preset_id=pr.id, start=0, end=2)
    line = _box_dialogue(b, pr)
    assert "\\an7" in line

def test_render_ass_emits_box_dialogue_before_text_dialogue():
    # box_width is wide enough that "BIG NEWS" (462px at the default size_px=96 in Public
    # Sans, per real Pillow/fontTools measurement) doesn't hit wrap_text's word-wrap — this
    # test is about Dialogue-line ordering, not word-wrap behavior (covered separately).
    pr = TextPreset(name="Pop", box_background=True, box_width_mode="fixed", box_width=600,
                     box_height_mode="fixed", box_height=100)
    p = Project(name="r", text_blocks=[TextBlockLayer(heading="BIG NEWS", preset_id=pr.id, start=1.0, end=4.0)])
    out = render_ass(p, {pr.id: pr})
    lines = [l for l in out.splitlines() if l.startswith("Dialogue:")]
    assert len(lines) == 2
    assert "\\p1" in lines[0] and "BIG NEWS" not in lines[0]
    assert "BIG NEWS" in lines[1]

def test_render_ass_omits_box_dialogue_when_no_box():
    pr = TextPreset(name="Plain")
    p = Project(name="r", text_blocks=[TextBlockLayer(heading="H", preset_id=pr.id, start=0, end=2)])
    out = render_ass(p, {pr.id: pr})
    lines = [l for l in out.splitlines() if l.startswith("Dialogue:")]
    assert len(lines) == 1

def test_wrapped_lines_and_size_fixed_dimensions_used_as_is():
    pr = TextPreset(name="Pop", size_px=48, box_width_mode="fixed", box_width=200,
                     box_height_mode="fixed", box_height=80)
    b = TextBlockLayer(heading="hello", preset_id=pr.id, start=0, end=2)
    text, width, height = _wrapped_lines_and_size(b, pr)
    assert (width, height) == (200, 80)

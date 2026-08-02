# Tests for app.ass_render: ASS time/color helpers and text-block dialogue generation.
from app.models import Project, TextBlockLayer, TextPreset, CaptionTrack, CaptionWord, FormatRun
from app.ass_render import (
    ass_time, hex_to_ass, render_ass, render_caption_ass,
    _current_word_dialogues, _active_word_highlight_dialogues,
)

def w(t, a, b): return CaptionWord(text=t, t_start=a, t_end=b)

def test_helpers():
    assert ass_time(83.456) == "0:01:23.45"
    assert hex_to_ass("#FFD400") == "&H0000D4FF"        # AABBGGRR, alpha 00

def test_render_ass_two_blocks_both_render():
    pr1 = TextPreset(name="a")
    pr2 = TextPreset(name="b")
    b1 = TextBlockLayer(heading="FIRST", preset_id=pr1.id, start=0, end=2)
    b2 = TextBlockLayer(heading="SECOND", preset_id=pr2.id, start=2, end=4)
    p = Project(name="r", text_blocks=[b1, b2])
    out = render_ass(p, {pr1.id: pr1, pr2.id: pr2})
    assert "FIRST" in out and "SECOND" in out

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

def test_block_dialogue_shadow_off_emits_no_shadow_tags():
    pr = TextPreset(name="Pop", shadow=False)
    p = Project(name="r", text_blocks=[TextBlockLayer(heading="H", preset_id=pr.id, start=0, end=2)])
    out = render_ass(p, {pr.id: pr})
    line = next(l for l in out.splitlines() if l.startswith("Dialogue:") and "H" in l)
    assert "\\xshad" not in line and "\\yshad" not in line and "\\blur" not in line

def test_block_dialogue_shadow_on_emits_offset_blur_and_color_tags():
    pr = TextPreset(name="Pop", shadow=True, shadow_color="#FF00FF",
                     shadow_offset_x=6, shadow_offset_y=-3, shadow_blur=8)
    p = Project(name="r", text_blocks=[TextBlockLayer(heading="H", preset_id=pr.id, start=0, end=2)])
    out = render_ass(p, {pr.id: pr})
    line = next(l for l in out.splitlines() if l.startswith("Dialogue:") and "H" in l)
    assert "\\xshad6" in line
    assert "\\yshad-3" in line
    assert "\\blur8" in line
    assert "\\4c&HFF00FF&" in line  # #FF00FF -> b=FF,g=00,r=FF, same &HBBGGRR& shape _ass_override_color already uses elsewhere in this file
    assert "\\4a00" in line

def test_block_dialogue_shadow_on_shadow_line_precedes_main_and_main_has_no_blur():
    pr = TextPreset(name="Pop", shadow=True, shadow_color="#FF00FF",
                     shadow_offset_x=6, shadow_offset_y=-3, shadow_blur=8)
    p = Project(name="r", text_blocks=[TextBlockLayer(heading="H", preset_id=pr.id, start=0, end=2)])
    out = render_ass(p, {pr.id: pr})
    dialogue_lines = [l for l in out.splitlines() if l.startswith("Dialogue:") and "H" in l]
    assert len(dialogue_lines) == 2
    shadow_line, main_line = dialogue_lines
    # Name field (5th comma-separated field) marks the shadow line
    assert shadow_line.split(",")[4] == "shadow"
    assert main_line.split(",")[4] == ""
    # Shadow line hides fill/outline so only the blurred shadow copy is visible
    assert "\\1a&HFF&\\3a&HFF&" in shadow_line
    assert "\\blur8" in shadow_line
    # Main line must NOT carry any shadow/blur tags — this is the bug fix
    assert "\\blur" not in main_line
    assert "\\4c" not in main_line
    assert "\\xshad" not in main_line

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
    text, width, height, _ = _wrapped_lines_and_size(b, pr)
    assert (width, height) == (200, 80)

def test_style_alignment_reflects_text_align():
    left = TextPreset(name="L", align="left")
    center = TextPreset(name="C", align="center")
    right = TextPreset(name="R", align="right")
    for pr, expected in [(left, "7"), (center, "8"), (right, "9")]:
        p = Project(name="r", text_blocks=[TextBlockLayer(heading="H", preset_id=pr.id, start=0, end=2)])
        out = render_ass(p, {pr.id: pr})
        line = next(l for l in out.splitlines() if l.startswith("Style:"))
        assert line.split(",")[18] == expected, f"align={pr.align} expected alignment {expected}"

def test_box_dialogue_left_edge_for_align_left():
    pr = TextPreset(name="L", align="left", x=100, y=200, box_background=True,
                     box_width_mode="fixed", box_width=300, box_height_mode="fixed", box_height=100)
    b = TextBlockLayer(heading="H", preset_id=pr.id, start=0, end=2)
    line = _box_dialogue(b, pr)
    assert "\\pos(100,200)" in line

def test_box_dialogue_left_edge_for_align_right():
    pr = TextPreset(name="R", align="right", x=900, y=200, box_background=True,
                     box_width_mode="fixed", box_width=300, box_height_mode="fixed", box_height=100)
    b = TextBlockLayer(heading="H", preset_id=pr.id, start=0, end=2)
    line = _box_dialogue(b, pr)
    assert "\\pos(600,200)" in line   # left = x - width = 900 - 300

def test_box_dialogue_left_edge_for_align_center_unchanged():
    pr = TextPreset(name="C", align="center", x=540, y=200, box_background=True,
                     box_width_mode="fixed", box_width=300, box_height_mode="fixed", box_height=100)
    b = TextBlockLayer(heading="H", preset_id=pr.id, start=0, end=2)
    line = _box_dialogue(b, pr)
    assert "\\pos(390,200)" in line   # left = x - width/2 = 540 - 150

def test_wrapped_lines_and_size_fill_mode_same_as_fixed():
    pr = TextPreset(name="Pop", size_px=48, box_width_mode="fill", box_width=200,
                     box_height_mode="fill", box_height=80)
    b = TextBlockLayer(heading="hello", preset_id=pr.id, start=0, end=2)
    text, width, height, _ = _wrapped_lines_and_size(b, pr)
    assert (width, height) == (200, 80)

def test_box_dialogue_present_with_fill_mode():
    pr = TextPreset(name="Pop", box_background=True, box_background_color="#FF0000",
                     box_width_mode="fill", box_width=300, box_height_mode="fill", box_height=100)
    b = TextBlockLayer(heading="H", preset_id=pr.id, start=1.0, end=3.0)
    line = _box_dialogue(b, pr)
    assert line is not None
    assert "\\p1" in line and "\\p0" in line

def test_render_ass_subset_only_renders_given_blocks():
    pr1 = TextPreset(name="A")
    pr2 = TextPreset(name="B")
    b1 = TextBlockLayer(heading="FIRST", preset_id=pr1.id, start=0, end=2)
    b2 = TextBlockLayer(heading="SECOND", preset_id=pr2.id, start=2, end=4)
    p = Project(name="r", text_blocks=[b1, b2])
    out = render_ass(p, {pr1.id: pr1, pr2.id: pr2}, text_blocks=[b1])
    assert "FIRST" in out
    assert "SECOND" not in out

def test_render_ass_subset_none_matches_default_behavior():
    pr = TextPreset(name="A")
    b = TextBlockLayer(heading="ONLY", preset_id=pr.id, start=0, end=2)
    p = Project(name="r", text_blocks=[b])
    assert render_ass(p, {pr.id: pr}, text_blocks=None) == render_ass(p, {pr.id: pr})

def test_render_ass_subset_empty_list_has_no_dialogue_lines():
    pr = TextPreset(name="A")
    b = TextBlockLayer(heading="ONLY", preset_id=pr.id, start=0, end=2)
    p = Project(name="r", text_blocks=[b])
    out = render_ass(p, {pr.id: pr}, text_blocks=[])
    assert not any(l.startswith("Dialogue:") for l in out.splitlines())

def test_karaoke_dialogue_joins_lines_with_ass_hard_break():
    from app.ass_render import _karaoke_dialogue
    pr = TextPreset(name="Cap")
    page = [[w("Hello", 0.0, 0.5)], [w("world", 0.5, 1.0)]]
    lines = _karaoke_dialogue(page, pr)
    assert len(lines) == 1  # no shadow configured -> no shadow line
    line = lines[0]
    assert "\\N" in line
    assert "Hello" in line and "world" in line
    assert line.startswith("Dialogue: 0,0:00:00.00,0:00:01.00")

def test_current_word_dialogues_highlight_word_on_any_line():
    from app.ass_render import _current_word_dialogues
    pr = TextPreset(name="Cap", color="#FFFFFF", highlight_color="#FFD400")
    page = [[w("Hello", 0.0, 0.5)], [w("world", 0.5, 1.0)]]
    dialogues = _current_word_dialogues(page, pr)
    assert len(dialogues) == 2
    assert "\\N" in dialogues[0] and "\\N" in dialogues[1]
    assert dialogues[0].count("{\\1c") == 2  # highlight-color tag + reset-to-normal tag around the active word

def test_progressive_fill_style_uses_spotlight_color_as_primary():
    from app.ass_render import _caption_style
    pr = TextPreset(name="Caption", color="#FFFFFF", spotlight_color="#00FF00", highlight_mode="progressive_fill")
    style = _caption_style(pr, 400)
    # PrimaryColour is the 2nd comma field after Style name/Fontname/Fontsize... assert the ASS color for spotlight_color appears
    assert "&H0000FF00&".upper() not in style  # sanity: literal hex isn't emitted, ASS uses BGR
    assert hex_to_ass("#00FF00") in style

def test_current_word_dialogue_no_outline_or_shadow_override_when_off():
    pr = TextPreset(name="Cap", highlight_mode="current_word", spotlight_outline_px=0, spotlight_shadow=False)
    words = [CaptionWord(text="hi", t_start=0.0, t_end=0.5), CaptionWord(text="there", t_start=0.5, t_end=1.0)]
    dialogues = _current_word_dialogues([words], pr)
    assert not any("\\bord" in d and pr.spotlight_outline_color in d for d in dialogues)

def test_current_word_dialogue_outline_override_when_on():
    from app.ass_render import _ass_override_color
    pr = TextPreset(name="Cap", highlight_mode="current_word",
                     spotlight_outline_color="#00FF00", spotlight_outline_px=6)
    words = [CaptionWord(text="hi", t_start=0.0, t_end=0.5), CaptionWord(text="there", t_start=0.5, t_end=1.0)]
    dialogues = _current_word_dialogues([words], pr)
    # Override/revert tags follow the codebase's established \3c convention (_ass_override_color,
    # &HBBGGRR&), not the Style-line-only hex_to_ass (&H00BBGGRR) — see _run_style_tag for precedent.
    assert any(f"\\bord{pr.spotlight_outline_px}" in d and _ass_override_color(pr.spotlight_outline_color) in d for d in dialogues)
    # reverts to the base outline afterward
    assert any(f"\\bord{pr.outline_px}" in d for d in dialogues)

def test_current_word_dialogue_shadow_override_when_on():
    pr = TextPreset(name="Cap", highlight_mode="current_word", spotlight_shadow=True,
                     spotlight_shadow_color="#0000FF", spotlight_shadow_offset_x=3,
                     spotlight_shadow_offset_y=2, spotlight_shadow_blur=1)
    words = [CaptionWord(text="hi", t_start=0.0, t_end=0.5)]
    dialogues = _current_word_dialogues([words], pr)
    assert any(f"\\xshad{pr.spotlight_shadow_offset_x}\\yshad{pr.spotlight_shadow_offset_y}\\blur{pr.spotlight_shadow_blur}" in d
               for d in dialogues)

def test_active_word_highlight_rect_emitted_for_current_word_when_spotlight_highlight_on():
    from app.ass_render import _ass_override_color
    pr = TextPreset(name="Cap", highlight_mode="current_word", spotlight_highlight=True, spotlight_highlight_color="#FF00FF")
    words = [CaptionWord(text="hi", t_start=0.0, t_end=0.5)]
    dialogues = _active_word_highlight_dialogues([words], pr)
    assert any(_ass_override_color(pr.spotlight_highlight_color) in d for d in dialogues)  # rect drawn with the right fill
    assert len(dialogues) == 1

def test_active_word_highlight_rect_empty_when_off():
    pr = TextPreset(name="Cap", highlight_mode="current_word", spotlight_highlight=False)
    words = [CaptionWord(text="hi", t_start=0.0, t_end=0.5)]
    assert _active_word_highlight_dialogues([words], pr) == []

def test_render_caption_ass_off_mode_has_no_current_word_or_karaoke_swap():
    project = Project(name="P", width=1080, height=1920)
    pr = TextPreset(name="Cap", highlight_mode="off")
    project.captions = CaptionTrack(preset_id=pr.id, words=[
        CaptionWord(text="hi", t_start=0.0, t_end=0.5), CaptionWord(text="there", t_start=0.5, t_end=1.0),
    ])
    ass = render_caption_ass(project, pr)
    assert ass.count("Dialogue:") == 1  # one plain karaoke_dialogue-shaped line, not one-per-word

def test_render_caption_ass_off_mode_no_rect_even_with_spotlight_highlight_on():
    # Pins the `if preset.highlight_mode != "off":` guard around
    # _active_word_highlight_dialogues in render_caption_ass's dispatch: the existing off-mode
    # test above uses the default spotlight_highlight=False, which wouldn't catch that guard
    # being wrong (a bug there could still coincidentally produce 1 Dialogue line).
    project = Project(name="P", width=1080, height=1920)
    pr = TextPreset(name="Cap", highlight_mode="off", spotlight_highlight=True)
    project.captions = CaptionTrack(preset_id=pr.id, words=[
        CaptionWord(text="hi", t_start=0.0, t_end=0.5), CaptionWord(text="there", t_start=0.5, t_end=1.0),
    ])
    ass = render_caption_ass(project, pr)
    assert ass.count("Dialogue:") == 1  # plain karaoke line only, no rect

def test_render_caption_ass_progressive_fill_draws_rect_when_spotlight_highlight_on():
    project = Project(name="P", width=1080, height=1920)
    pr = TextPreset(name="Cap", highlight_mode="progressive_fill", spotlight_highlight=True)
    project.captions = CaptionTrack(preset_id=pr.id, words=[
        CaptionWord(text="hi", t_start=0.0, t_end=0.5), CaptionWord(text="there", t_start=0.5, t_end=1.0),
    ])
    ass = render_caption_ass(project, pr)
    # 1 karaoke dialogue + 1 rect per word = 3
    assert ass.count("Dialogue:") == 3

def test_active_word_highlight_dialogues_emit_rect_per_active_word():
    from app.ass_render import _active_word_highlight_dialogues
    pr = TextPreset(name="Cap", x=540, y=700, size_px=48, spotlight_highlight=True,
                     spotlight_highlight_color="#FFD400", spotlight_highlight_border_radius=8)
    page = [[w("Hello", 0.0, 0.5), w("world", 0.5, 1.0)]]
    dialogues = _active_word_highlight_dialogues(page, pr)
    assert len(dialogues) == 2  # one rect per active word, no paired text dialogue
    first_window = [d for d in dialogues if d.startswith("Dialogue: 0,0:00:00.00,0:00:00.50")]
    assert len(first_window) == 1
    assert "\\p1" in first_window[0]

def test_active_word_highlight_dialogues_rect_height_is_tight_glyph_height_plus_padding():
    from app.ass_render import _active_word_highlight_dialogues, HIGHLIGHT_PAD_EM, _n
    pr = TextPreset(name="Cap", x=0, y=0, size_px=48, spotlight_highlight=True,
                     spotlight_highlight_color="#FFD400", align="left", spotlight_highlight_border_radius=0)
    page = [[w("Hi", 0.0, 0.5)]]
    rect = next(d for d in _active_word_highlight_dialogues(page, pr) if "\\p1" in d)
    pad = HIGHLIGHT_PAD_EM * pr.size_px
    expected_height = _n(pr.size_px + 2 * pad)  # tight glyph height (size_px), not size_px*1.15
    assert f"l 0 {expected_height}" in rect

def test_active_word_highlight_dialogues_rect_width_wider_than_bare_glyph_width():
    from app.ass_render import _active_word_highlight_dialogues, HIGHLIGHT_PAD_EM, _n
    from app.font_metrics import pil_font_measurer
    pr = TextPreset(name="Cap", x=0, y=0, size_px=48, spotlight_highlight=True,
                     spotlight_highlight_color="#FFD400", align="left", spotlight_highlight_border_radius=0)
    page = [[w("Hi", 0.0, 0.5)]]
    rect = next(d for d in _active_word_highlight_dialogues(page, pr) if "\\p1" in d)
    bare_width = pil_font_measurer(pr.font, pr.size_px, 400)("Hi")
    pad = HIGHLIGHT_PAD_EM * pr.size_px
    expected_width = _n(bare_width + 2 * pad)
    # radius 0 -> _rounded_rect_path emits "m 0 0 l {width} 0 l {width} {height} l 0 {height}"
    assert f"m 0 0 l {expected_width} 0" in rect

def test_active_word_highlight_dialogues_left_padding_shifts_rect_left_of_word_start():
    from app.ass_render import _active_word_highlight_dialogues, HIGHLIGHT_PAD_EM
    import re
    pr = TextPreset(name="Cap", x=100, y=0, size_px=48, spotlight_highlight=True,
                     spotlight_highlight_color="#FFD400", align="left")
    page = [[w("Hi", 0.0, 0.5)]]
    rect = next(d for d in _active_word_highlight_dialogues(page, pr) if "\\p1" in d)
    pos_x = int(re.search(r"\\pos\((-?\d+),", rect).group(1))
    pad = HIGHLIGHT_PAD_EM * pr.size_px
    assert pos_x == round(pr.x - pad)  # first word in a left-aligned line starts at p.x; rect is shifted left by pad

def test_active_word_highlight_dialogues_use_preset_radius():
    from app.ass_render import _active_word_highlight_dialogues
    pr_default = TextPreset(name="Cap", x=540, y=700, size_px=48, spotlight_highlight=True)  # radius default 4
    pr_custom = TextPreset(name="Cap", x=540, y=700, size_px=48, spotlight_highlight=True, spotlight_highlight_border_radius=12)
    page = [[w("Hi", 0.0, 0.5)]]
    rect_default = next(d for d in _active_word_highlight_dialogues(page, pr_default) if "\\p1" in d)
    rect_custom = next(d for d in _active_word_highlight_dialogues(page, pr_custom) if "\\p1" in d)
    assert rect_default != rect_custom  # different radius produces a different rect path, not a hardcoded value

def test_render_caption_ass_current_word_mode_with_spotlight_highlight_draws_rects_and_swaps():
    from app.ass_render import render_caption_ass
    pr = TextPreset(name="Cap", highlight_mode="current_word", spotlight_highlight=True, spotlight_highlight_border_radius=6)
    p = Project(name="r", captions=CaptionTrack(words=[w("Hi", 0.0, 0.5), w("there", 0.5, 1.0)], preset_id=pr.id))
    out = render_caption_ass(p, pr)
    dialogues = [l for l in out.splitlines() if l.startswith("Dialogue:")]
    assert len(dialogues) == 4  # 2 words * (rect + current-word-swap dialogue)
    assert any("\\p1" in d for d in dialogues)

def test_render_caption_ass_wraps_to_multiple_lines_when_box_is_narrow():
    from app.ass_render import render_caption_ass
    pr = TextPreset(name="Cap", highlight_mode="progressive_fill",
                     box_width_mode="fixed", box_width=1, box_height_mode="fixed", box_height=1000)
    p = Project(name="r", captions=CaptionTrack(words=[w("Hello", 0.0, 0.5), w("world", 0.5, 1.0)], preset_id=pr.id))
    out = render_caption_ass(p, pr)
    line = next(l for l in out.splitlines() if l.startswith("Dialogue:"))
    assert "\\N" in line  # box_width=1 forces every word onto its own line

def test_render_caption_ass_paginates_when_box_is_short():
    from app.ass_render import render_caption_ass
    pr = TextPreset(name="Cap", highlight_mode="progressive_fill", size_px=96,
                     box_width_mode="fixed", box_width=1, box_height_mode="fixed", box_height=50)
    # box_height=50 is smaller than one line (size_px*1.15 ~ 110) -> 1 line/page
    p = Project(name="r", captions=CaptionTrack(words=[w("Hello", 0.0, 0.5), w("world", 0.5, 1.0)], preset_id=pr.id))
    out = render_caption_ass(p, pr)
    dialogues = [l for l in out.splitlines() if l.startswith("Dialogue:")]
    assert len(dialogues) == 2
    assert "\\N" not in dialogues[0]

def test_render_caption_ass_falls_back_to_default_box_when_not_fixed():
    from app.ass_render import render_caption_ass
    pr = TextPreset(name="Cap", highlight_mode="progressive_fill")  # box_width_mode defaults "fit"
    p = Project(name="r", captions=CaptionTrack(words=[w("Hello", 0.0, 0.5), w("world", 0.5, 1.0)], preset_id=pr.id))
    out = render_caption_ass(p, pr)
    line = next(l for l in out.splitlines() if l.startswith("Dialogue:"))
    assert "Hello" in line and "world" in line
    assert "\\N" not in line  # fits comfortably inside the 900x350 default box

def test_progressive_fill_style_uses_highlight_as_primary():
    from app.ass_render import render_caption_ass
    pr = TextPreset(name="Caption", color="#FFFFFF", highlight_color="#FFD400", highlight_mode="progressive_fill")
    p = Project(name="r", captions=CaptionTrack(words=[w("hi", 1.0, 1.5)], preset_id=pr.id))
    out = render_caption_ass(p, pr)
    style = next(l for l in out.splitlines() if l.startswith("Style:"))
    fields = style.split(",")
    assert fields[3] == hex_to_ass("#FFD400")   # PrimaryColour
    assert fields[4] == hex_to_ass("#FFFFFF")   # SecondaryColour

def test_progressive_fill_emits_one_k_tagged_dialogue_per_group():
    from app.ass_render import render_caption_ass
    pr = TextPreset(name="Caption", highlight_mode="progressive_fill")
    p = Project(name="r", captions=CaptionTrack(
        words=[w("Hello", 1.0, 1.5), w("world", 1.5, 2.2)], preset_id=pr.id))
    out = render_caption_ass(p, pr)
    line = next(l for l in out.splitlines() if "Hello" in l)
    assert line.startswith("Dialogue: 0,0:00:01.00,0:00:02.20,Caption")
    assert "{\\k50}Hello" in line and "{\\k70}world" in line

def test_current_word_emits_one_dialogue_per_word_with_inline_override():
    from app.ass_render import render_caption_ass
    pr = TextPreset(name="Caption", color="#FFFFFF", highlight_color="#FFD400", highlight_mode="current_word")
    p = Project(name="r", captions=CaptionTrack(
        words=[w("Hello", 1.0, 1.5), w("world", 1.5, 2.2)], preset_id=pr.id))
    out = render_caption_ass(p, pr)
    dialogues = [l for l in out.splitlines() if l.startswith("Dialogue:")]
    assert len(dialogues) == 2
    first = next(l for l in dialogues if l.startswith("Dialogue: 0,0:00:01.00,0:00:01.50"))
    assert "{\\1c" in first and "Hello" in first and "world" in first
    second = next(l for l in dialogues if l.startswith("Dialogue: 0,0:00:01.50,0:00:02.20"))
    assert second.count("{\\1c") == 2

def test_karaoke_dialogue_shadow_on_emits_tags():
    from app.ass_render import render_caption_ass
    pr = TextPreset(name="Cap", highlight_mode="progressive_fill",
                     shadow=True, shadow_color="#00FFFF", shadow_offset_x=2, shadow_offset_y=5, shadow_blur=3)
    p = Project(name="r", captions=CaptionTrack(words=[w("hi", 0.0, 0.5)], preset_id=pr.id))
    out = render_caption_ass(p, pr)
    line = next(l for l in out.splitlines() if l.startswith("Dialogue:"))
    assert "\\xshad2" in line and "\\yshad5" in line and "\\blur3" in line

def test_karaoke_dialogue_shadow_on_shadow_line_precedes_main_and_main_has_no_blur():
    from app.ass_render import render_caption_ass
    pr = TextPreset(name="Cap", highlight_mode="progressive_fill",
                     shadow=True, shadow_color="#00FFFF", shadow_offset_x=2, shadow_offset_y=5, shadow_blur=3)
    p = Project(name="r", captions=CaptionTrack(words=[w("hi", 0.0, 0.5)], preset_id=pr.id))
    out = render_caption_ass(p, pr)
    dialogue_lines = [l for l in out.splitlines() if l.startswith("Dialogue:")]
    assert len(dialogue_lines) == 2
    shadow_line, main_line = dialogue_lines
    assert shadow_line.split(",")[4] == "shadow"
    assert main_line.split(",")[4] == ""
    assert "\\blur3" in shadow_line
    assert "\\blur" not in main_line and "\\4c" not in main_line

def test_current_word_dialogue_shadow_off_emits_no_tags():
    from app.ass_render import render_caption_ass
    pr = TextPreset(name="Cap", highlight_mode="current_word", shadow=False)
    p = Project(name="r", captions=CaptionTrack(words=[w("hi", 0.0, 0.5)], preset_id=pr.id))
    out = render_caption_ass(p, pr)
    line = next(l for l in out.splitlines() if l.startswith("Dialogue:"))
    assert "\\xshad" not in line and "\\blur" not in line

def test_current_word_dialogue_shadow_on_emits_tags():
    from app.ass_render import render_caption_ass
    pr = TextPreset(name="Cap", highlight_mode="current_word",
                     shadow=True, shadow_color="#0000FF", shadow_offset_x=4, shadow_offset_y=-2, shadow_blur=1)
    p = Project(name="r", captions=CaptionTrack(words=[w("hi", 0.0, 0.5)], preset_id=pr.id))
    out = render_caption_ass(p, pr)
    line = next(l for l in out.splitlines() if l.startswith("Dialogue:"))
    assert "\\xshad4" in line and "\\yshad-2" in line and "\\blur1" in line

def test_current_word_dialogue_shadow_on_shadow_line_precedes_main_and_main_has_no_blur():
    from app.ass_render import render_caption_ass
    pr = TextPreset(name="Cap", highlight_mode="current_word",
                     shadow=True, shadow_color="#0000FF", shadow_offset_x=4, shadow_offset_y=-2, shadow_blur=1)
    p = Project(name="r", captions=CaptionTrack(words=[w("hi", 0.0, 0.5)], preset_id=pr.id))
    out = render_caption_ass(p, pr)
    dialogue_lines = [l for l in out.splitlines() if l.startswith("Dialogue:")]
    assert len(dialogue_lines) == 2  # 1 word * (shadow line + main line)
    shadow_line, main_line = dialogue_lines
    assert shadow_line.split(",")[4] == "shadow"
    assert main_line.split(",")[4] == ""
    assert "\\blur1" in shadow_line
    assert "\\blur" not in main_line and "\\4c" not in main_line

def test_current_word_dialogue_no_shadow_line_when_both_shadow_flags_off():
    pr = TextPreset(name="Cap", highlight_mode="current_word", shadow=False, spotlight_shadow=False)
    words = [CaptionWord(text="hi", t_start=0.0, t_end=0.5), CaptionWord(text="there", t_start=0.5, t_end=1.0)]
    dialogues = _current_word_dialogues([words], pr)
    assert len(dialogues) == 2  # one main line per active word, no shadow lines
    assert all(d.split(",")[4] == "" for d in dialogues)

def test_current_word_dialogue_spotlight_shadow_only_still_emits_shadow_line():
    # p.shadow is off but spotlight_shadow (the active word's own override) is on — a shadow
    # line must still appear for the active word, since something is visible to blur.
    pr = TextPreset(name="Cap", highlight_mode="current_word", shadow=False, spotlight_shadow=True,
                     spotlight_shadow_blur=2)
    words = [CaptionWord(text="hi", t_start=0.0, t_end=0.5)]
    dialogues = _current_word_dialogues([words], pr)
    assert len(dialogues) == 2  # shadow line + main line for the one active word
    assert any(d.split(",")[4] == "shadow" and "\\blur2" in d for d in dialogues)

def test_karaoke_dialogue_shadow_off_emits_no_tags():
    from app.ass_render import render_caption_ass
    pr = TextPreset(name="Cap", highlight_mode="progressive_fill", shadow=False)
    p = Project(name="r", captions=CaptionTrack(words=[w("hi", 0.0, 0.5)], preset_id=pr.id))
    out = render_caption_ass(p, pr)
    line = next(l for l in out.splitlines() if l.startswith("Dialogue:"))
    assert "\\xshad" not in line and "\\blur" not in line

def test_render_caption_ass_expands_multi_word_entry_into_karaoke_segments():
    from app.ass_render import render_caption_ass
    pr = TextPreset(name="Caption", highlight_mode="progressive_fill")
    p = Project(name="r", captions=CaptionTrack(words=[w("talks about this", 0.0, 3.0)], preset_id=pr.id))
    out = render_caption_ass(p, pr)
    line = next(l for l in out.splitlines() if "talks" in l)
    assert line.count("{\\k") == 3
    assert "talks" in line and "about" in line and "this" in line

def test_render_caption_ass_no_words_still_valid_header():
    from app.ass_render import render_caption_ass
    pr = TextPreset(name="Caption")
    p = Project(name="r", captions=CaptionTrack(words=[], preset_id=pr.id))
    out = render_caption_ass(p, pr)
    assert "PlayResX: 1080" in out and "Style: Caption," in out
    assert not [l for l in out.splitlines() if l.startswith("Dialogue:")]

from app.models import FormatRun

def test_block_dialogue_with_no_runs_is_unchanged():
    pr = TextPreset(name="Pop", size_px=96)
    p = Project(name="r", text_blocks=[TextBlockLayer(heading="PLAIN TEXT", preset_id=pr.id, start=0, end=2)])
    out = render_ass(p, {pr.id: pr})
    line = next(l for l in out.splitlines() if l.startswith("Dialogue:") and "box" not in l)
    assert "PLAIN TEXT" in line
    assert "\\fn" not in line  # no per-run override tags when there are no runs

def test_block_dialogue_with_one_run_emits_override_and_reset_tags():
    pr = TextPreset(name="Pop", font="Public Sans", size_px=96, color="#FFFFFF", weight=400)
    run = FormatRun(start=0, end=3, color="#FF0000", weight=700)  # "BIG" in "BIG NEWS"
    p = Project(name="r", text_blocks=[TextBlockLayer(heading="BIG NEWS", preset_id=pr.id, start=0, end=2,
                                                        formatting_runs=[run])])
    out = render_ass(p, {pr.id: pr})
    line = next(l for l in out.splitlines() if l.startswith("Dialogue:") and "BIG" in l)
    assert "\\1c&H0000FF&" in line              # _ass_override_color("#FF0000") == "&H0000FF&" (BGR)
    assert "\\fnPublic Sans Bold" in line       # run's overridden weight face
    assert "\\fnPublic Sans Regular" in line    # reset back to base style after the run ends
    assert line.index("BIG") < line.index("NEWS")

def test_block_dialogue_run_preserves_unstyled_text_around_it():
    pr = TextPreset(name="Pop")
    run = FormatRun(start=4, end=8, color="#00FF00")  # "NEWS" in "BIG NEWS TODAY"
    p = Project(name="r", text_blocks=[TextBlockLayer(heading="BIG NEWS TODAY", preset_id=pr.id, start=0, end=2,
                                                        formatting_runs=[run])])
    out = render_ass(p, {pr.id: pr})
    line = next(l for l in out.splitlines() if l.startswith("Dialogue:") and "TODAY" in l)
    assert "BIG " in line and "NEWS" in line and " TODAY" in line

def test_no_highlight_runs_emits_no_highlight_dialogues():
    pr = TextPreset(name="Pop")
    run = FormatRun(start=0, end=3, color="#FF0000")  # not highlighted
    p = Project(name="r", text_blocks=[TextBlockLayer(heading="BIG NEWS", preset_id=pr.id, start=0, end=2,
                                                        formatting_runs=[run])])
    out = render_ass(p, {pr.id: pr})
    assert "hl0" not in out

def test_highlighted_run_on_single_line_emits_one_rectangle():
    pr = TextPreset(name="Pop", x=100, y=200, size_px=50, box_width_mode="fit")
    run = FormatRun(start=0, end=3, highlight=True, highlight_color="#00FF00")
    p = Project(name="r", text_blocks=[TextBlockLayer(heading="BIG NEWS", preset_id=pr.id, start=0, end=2,
                                                        formatting_runs=[run])])
    out = render_ass(p, {pr.id: pr})
    highlight_lines = [l for l in out.splitlines() if "hl0" in l]
    assert len(highlight_lines) == 1
    assert "\\p1" in highlight_lines[0]

def test_highlighted_run_spanning_two_wrapped_lines_emits_two_rectangles():
    pr = TextPreset(name="Pop", x=0, y=0, size_px=20, box_width_mode="fixed", box_width=90)
    # Force a wrap between "BIG" and "NEWS TODAY" by constraining box_width tightly; the
    # highlighted run covers "NEWS TODAY" which the fixed width should split across 2 lines.
    run = FormatRun(start=4, end=14, highlight=True)  # "NEWS TODAY"
    p = Project(name="r", text_blocks=[TextBlockLayer(heading="BIG NEWS TODAY", preset_id=pr.id, start=0, end=2,
                                                        formatting_runs=[run])])
    out = render_ass(p, {pr.id: pr})
    highlight_lines = [l for l in out.splitlines() if "hl" in l and l.startswith("Dialogue:")]
    assert len(highlight_lines) == 2

def test_highlighted_run_from_base_preset_default():
    pr = TextPreset(name="Pop", highlight=True, highlight_color="#0000FF")
    run = FormatRun(start=0, end=3)  # no per-run highlight override — falls through to preset default
    p = Project(name="r", text_blocks=[TextBlockLayer(heading="BIG NEWS", preset_id=pr.id, start=0, end=2,
                                                        formatting_runs=[run])])
    out = render_ass(p, {pr.id: pr})
    assert any("hl0" in l for l in out.splitlines())

def test_block_text_case_upper_transforms_dialogue_not_model():
    pr = TextPreset(name="Pop", text_case="upper")
    b = TextBlockLayer(heading="Big news", preset_id=pr.id, start=0, end=2)
    p = Project(name="r", text_blocks=[b])
    out = render_ass(p, {pr.id: pr})
    assert "BIG NEWS" in out and "Big news" not in out
    assert b.heading == "Big news"   # stored text untouched

def test_block_text_case_lower():
    pr = TextPreset(name="Pop", text_case="lower")
    p = Project(name="r", text_blocks=[TextBlockLayer(heading="BIG News", preset_id=pr.id, start=0, end=2)])
    out = render_ass(p, {pr.id: pr})
    assert "big news" in out and "BIG News" not in out

def test_block_text_case_none_is_byte_identical_to_default():
    pr = TextPreset(name="Pop")
    p = Project(name="r", text_blocks=[TextBlockLayer(heading="MiXeD", preset_id=pr.id, start=0, end=2)])
    assert render_ass(p, {pr.id: pr}) == render_ass(p, {pr.id: TextPreset(**{**pr.model_dump(), "text_case": "none"})})

def test_caption_text_case_upper_transforms_dialogues_not_words():
    pr = TextPreset(name="Cap", text_case="upper", box_width_mode="fixed", box_height_mode="fixed",
                    box_width=900, box_height=350)
    words = [w("Hello", 0.0, 0.5), w("there", 0.5, 1.0)]
    p = Project(name="r", captions=CaptionTrack(words=words, preset_id=pr.id))
    out = render_caption_ass(p, pr)
    assert "HELLO" in out and "THERE" in out
    assert "Hello" not in out
    assert words[0].text == "Hello"   # stored words untouched

def test_highlighted_run_uses_preset_border_radius_not_hardcoded_constant():
    run = FormatRun(start=0, end=3, highlight=True, highlight_color="#00FF00")
    pr_default = TextPreset(name="Pop", x=100, y=200, size_px=50, box_width_mode="fit")  # highlight_border_radius default 4
    pr_custom = TextPreset(name="Pop", x=100, y=200, size_px=50, box_width_mode="fit", highlight_border_radius=20)
    p_default = Project(name="r", text_blocks=[TextBlockLayer(heading="BIG NEWS", preset_id=pr_default.id, start=0, end=2, formatting_runs=[run])])
    p_custom = Project(name="r", text_blocks=[TextBlockLayer(heading="BIG NEWS", preset_id=pr_custom.id, start=0, end=2, formatting_runs=[run])])
    out_default = render_ass(p_default, {pr_default.id: pr_default})
    out_custom = render_ass(p_custom, {pr_custom.id: pr_custom})
    line_default = next(l for l in out_default.splitlines() if "hl0" in l)
    line_custom = next(l for l in out_custom.splitlines() if "hl0" in l)
    assert line_default != line_custom  # different radius produces a different rect path

def test_caption_highlight_dialogues_emit_one_rect_per_line_spanning_page_range():
    from app.ass_render import _caption_highlight_dialogues
    pr = TextPreset(name="Cap", x=540, y=700, highlight=True, highlight_color="#00FF00", highlight_border_radius=10)
    page = [[w("Hello", 1.0, 1.5)], [w("world", 1.5, 2.2)]]  # 2 lines
    lines = _caption_highlight_dialogues(page, pr)
    assert len(lines) == 2  # one rect per line, not one rect for the whole page/box
    for line in lines:
        assert line.startswith("Dialogue: 0,0:00:01.00,0:00:02.20")  # spans the whole page's active range
        assert "\\p1" in line

def test_caption_highlight_dialogues_empty_when_highlight_off():
    from app.ass_render import _caption_highlight_dialogues
    pr = TextPreset(name="Cap", highlight=False)
    page = [[w("Hello", 1.0, 1.5)]]
    assert _caption_highlight_dialogues(page, pr) == []

def test_caption_highlight_dialogues_rect_width_hugs_line_not_fixed_box():
    from app.ass_render import _caption_highlight_dialogues, HIGHLIGHT_PAD_EM, _n
    from app.font_metrics import pil_font_measurer
    pr = TextPreset(name="Cap", x=0, y=0, highlight=True, highlight_color="#00FF00", align="left",
                     highlight_border_radius=0, box_width_mode="fixed", box_width=900)
    page = [[w("Hi", 1.0, 1.5)]]
    line = _caption_highlight_dialogues(page, pr)[0]
    bare_width = pil_font_measurer(pr.font, pr.size_px, 400)("Hi")
    pad = HIGHLIGHT_PAD_EM * pr.size_px
    expected_width = _n(bare_width + 2 * pad)
    assert f"m 0 0 l {expected_width} 0" in line  # tight to "Hi", nowhere near the 900px fixed box width

def test_caption_highlight_dialogues_lines_do_not_overlap_vertically():
    # Bug: with the default HIGHLIGHT_PAD_EM (0.2) padding on all 4 sides, an unclamped rect_height
    # (size_px * 1.4) exceeds the line_pitch (size_px * LINE_HEIGHT == 1.15) two adjacent lines are
    # stacked at, so a 2-line page's highlight rects overlap and merge into one solid block in the
    # export — "too much padding" reported from real exports of multi-line highlighted captions.
    from app.ass_render import _caption_highlight_dialogues
    import re
    pr = TextPreset(name="Cap", x=0, y=0, size_px=96, highlight=True, highlight_color="#00FF00",
                     align="left", highlight_border_radius=0)
    page = [[w("Hello", 1.0, 1.5)], [w("world", 1.5, 2.2)]]
    lines = _caption_highlight_dialogues(page, pr)
    assert len(lines) == 2
    tops, heights = [], []
    for line in lines:
        tops.append(int(re.search(r"\\pos\(-?\d+,(-?\d+)\)", line).group(1)))
        heights.append(float(re.search(r"l 0 ([\d.]+)\{", line).group(1)))
    assert tops[0] + heights[0] <= tops[1]  # line 0's rect must end before line 1's rect begins

def test_render_caption_ass_includes_highlight_rect_before_karaoke_dialogue():
    from app.ass_render import render_caption_ass
    pr = TextPreset(name="Cap", highlight=True, highlight_color="#00FF00", highlight_mode="progressive_fill")
    p = Project(name="r", captions=CaptionTrack(words=[w("hi", 1.0, 1.5)], preset_id=pr.id))
    out = render_caption_ass(p, pr)
    dialogues = [l for l in out.splitlines() if l.startswith("Dialogue:")]
    assert len(dialogues) == 2
    assert "\\p1" in dialogues[0]  # the rect
    assert "hi" in dialogues[1]     # the karaoke text, after the rect

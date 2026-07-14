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

def test_style_line_reflects_bold_italic_underline():
    pr = TextPreset(name="Pop", bold=True, italic=True, underline=True)
    p = Project(name="r", text_blocks=[TextBlockLayer(heading="H", preset_id=pr.id, start=0, end=2)])
    out = render_ass(p, {pr.id: pr})
    line = next(l for l in out.splitlines() if l.startswith("Style:"))
    fields = line.split(",")
    # Format: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,
    #         Bold,Italic,Underline,StrikeOut,...
    assert fields[7:10] == ["-1", "-1", "-1"]

def test_style_line_defaults_no_bold_italic_underline():
    pr = TextPreset(name="Plain")
    p = Project(name="r", text_blocks=[TextBlockLayer(heading="H", preset_id=pr.id, start=0, end=2)])
    out = render_ass(p, {pr.id: pr})
    line = next(l for l in out.splitlines() if l.startswith("Style:"))
    fields = line.split(",")
    assert fields[7:10] == ["0", "0", "0"]

def test_multiline_heading_becomes_ass_hard_break():
    pr = TextPreset(name="Pop")
    p = Project(name="r", text_blocks=[TextBlockLayer(heading="LINE ONE\nLINE TWO", preset_id=pr.id, start=0, end=2)])
    out = render_ass(p, {pr.id: pr})
    line = next(l for l in out.splitlines() if l.startswith("Dialogue:"))
    assert "LINE ONE\\NLINE TWO" in line

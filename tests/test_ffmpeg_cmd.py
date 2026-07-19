# Tests for app.ffmpeg_cmd: pure construction of the trim+concat+burn export command.
from app.models import Project, ClipLayer
from app.ffmpeg_cmd import build_export_cmd, escape_filter_path

def proj():
    return Project(name="r", clips=[ClipLayer(media_id="m1", file_path="b.mp4", in_point=1, out_point=3, order=1),
                                    ClipLayer(media_id="m0", file_path="a.mp4", in_point=0, out_point=2, order=0)])

def test_inputs_in_order_and_trim_filters():
    cmd = build_export_cmd(proj(), "out.mp4")
    assert cmd[:1] == ["ffmpeg"] and cmd[-1] == "out.mp4"
    i = cmd.index("-filter_complex"); fc = cmd[i + 1]
    assert cmd[cmd.index("-i") + 1] == "a.mp4"                      # order 0 first
    assert "trim=start=1:end=3" in fc and "concat=n=2:v=1:a=1" in fc
    assert "scale=1080:1920:force_original_aspect_ratio=decrease" in fc

def test_ass_burn_appended_when_given():
    fc = build_export_cmd(proj(), "out.mp4", ass_path="C:/tmp/subs.ass")[  # ass filter chained after concat
        build_export_cmd(proj(), "out.mp4", ass_path="C:/tmp/subs.ass").index("-filter_complex") + 1]
    assert "ass='C\\:/tmp/subs.ass'" in fc

def test_escape_filter_path():
    assert escape_filter_path("C:\\tmp\\s.ass") == "C\\:/tmp/s.ass"

def test_ass_burn_includes_fontsdir_pointing_at_static_fonts():
    fc = build_export_cmd(proj(), "out.mp4", ass_path="C:/tmp/subs.ass")[
        build_export_cmd(proj(), "out.mp4", ass_path="C:/tmp/subs.ass").index("-filter_complex") + 1]
    assert ":fontsdir='static/fonts'" in fc

def test_no_fontsdir_when_no_ass_path():
    fc = build_export_cmd(proj(), "out.mp4")[build_export_cmd(proj(), "out.mp4").index("-filter_complex") + 1]
    assert "fontsdir" not in fc

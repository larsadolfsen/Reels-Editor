# Tests for app.models: entity construction, IDs, JSON round-trip.
from app.models import Project, ClipLayer, TextPreset, TextBlockLayer, CaptionTrack, CaptionWord

def test_ids_are_unique():
    a, b = ClipLayer(file_path="a.mp4", in_point=0, out_point=5, order=0), ClipLayer(file_path="b.mp4", in_point=0, out_point=5, order=1)
    assert a.id != b.id and len(a.id) == 32

def test_project_defaults():
    p = Project(name="reel1")
    assert (p.width, p.height, p.fps) == (1080, 1920, 30)
    assert p.clips == [] and p.text_blocks == [] and p.captions is None

def test_json_round_trip():
    p = Project(name="reel1", clips=[ClipLayer(file_path="a.mp4", in_point=1.0, out_point=4.5, order=0)],
                text_blocks=[TextBlockLayer(heading="H", subheading="s", preset_id="x", start=0, end=3)],
                captions=CaptionTrack(words=[CaptionWord(text="hi", t_start=0.1, t_end=0.4)]))
    assert Project.model_validate_json(p.model_dump_json()) == p

# Phase 6 smoke test: exercises app.main.export_project with every layer type combined
# (clips including a video-only one, a formatted text block with box, captions with
# karaoke highlight, a video box) and asserts the whole pipeline runs without raising.
from unittest.mock import patch
from app import export_jobs
from app.main import export_project
from app.models import (
    Project, MediaItem, ClipLayer, TextPreset, TextBlockLayer, FormatRun,
    CaptionTrack, CaptionWord, VideoBoxLayer,
)

def test_export_smoke_all_layer_types_combined(tmp_path, monkeypatch):
    monkeypatch.setattr("app.main.DATA_DIR", tmp_path)
    monkeypatch.setattr("app.export_jobs._executor", lambda fn: fn())

    text_preset = TextPreset(name="Heading", box_background=True, box_border_width=4, highlight=False)
    caption_preset = TextPreset(name="Captions", highlight_mode="progressive_fill")

    p = Project(
        name="smoke",
        media_library=[
            MediaItem(id="m0", file_path="a.mp4", duration=2, has_audio=True),
            MediaItem(id="m1", file_path="b.mp4", duration=2, has_audio=False),
        ],
        clips=[
            ClipLayer(media_id="m0", file_path="a.mp4", in_point=0, out_point=2, order=0),
            ClipLayer(media_id="m1", file_path="b.mp4", in_point=0.5, out_point=2, order=1),
        ],
        text_blocks=[
            TextBlockLayer(
                heading="Hello world", preset_id=text_preset.id, start=0, end=3, z_index=0,
                formatting_runs=[FormatRun(start=0, end=5, weight=700, highlight=True)],
            )
        ],
        text_presets={text_preset.id: text_preset, caption_preset.id: caption_preset},
        captions=CaptionTrack(
            preset_id=caption_preset.id,
            words=[
                CaptionWord(text="Hello", t_start=0.0, t_end=0.4),
                CaptionWord(text="world", t_start=0.4, t_end=0.8),
            ],
        ),
        video_boxes=[
            VideoBoxLayer(media_id="m0", file_path="a.mp4", in_point=0, out_point=1,
                          start=0.5, x=50, y=50, width=300, height=400, z_index=-1),
        ],
    )

    with patch("app.main.store.load_project", return_value=p), \
         patch("app.main.media.run_export") as run_export:
        result = export_project(p.id)

    assert "job_id" in result
    job = export_jobs.get_job(result["job_id"])
    assert job["status"] == "done"
    cmd = run_export.call_args[0][0]
    assert cmd[0] == "ffmpeg"
    assert "anullsrc=channel_layout=stereo:sample_rate=44100" in cmd  # clip m1 has no audio
    assert "-filter_complex" in cmd
    assert cmd[-1].endswith(".mp4")

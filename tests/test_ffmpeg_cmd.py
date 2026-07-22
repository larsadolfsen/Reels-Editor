# Tests for app.ffmpeg_cmd: pure construction of the trim+concat+burn export command.
from app.models import Project, ClipLayer, VideoBoxLayer, MediaItem
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

def test_fill_mode_branches_scale_pad_vs_crop_per_clip():
    p = Project(name="r", clips=[
        ClipLayer(media_id="m1", file_path="fit.mp4", in_point=0, out_point=2, order=0, fill_mode="fit"),
        ClipLayer(media_id="m2", file_path="fill.mp4", in_point=0, out_point=2, order=1, fill_mode="fill"),
    ])
    cmd = build_export_cmd(p, "out.mp4")
    fc = cmd[cmd.index("-filter_complex") + 1]
    parts = fc.split(";")
    fit_part = next(seg for seg in parts if "[v0]" in seg)
    fill_part = next(seg for seg in parts if "[v1]" in seg)
    assert "force_original_aspect_ratio=decrease" in fit_part and "pad=1080:1920" in fit_part
    assert "force_original_aspect_ratio=increase" in fill_part and "crop=1080:1920" in fill_part
    assert "pad=" not in fill_part

def test_bands_none_matches_legacy_ass_path_behavior():
    cmd_legacy = build_export_cmd(proj(), "out.mp4", ass_path="C:/tmp/subs.ass")
    cmd_bands_none = build_export_cmd(proj(), "out.mp4", ass_path="C:/tmp/subs.ass", bands=None)
    assert cmd_legacy == cmd_bands_none

def test_bands_with_single_video_box_adds_input_and_overlay():
    box = VideoBoxLayer(media_id="m1", file_path="pip.mp4", in_point=0, out_point=3,
                         start=1.0, x=100, y=200, width=300, height=500, z_index=5)
    bands = [{"kind": "video_box", "video_box": box}]
    cmd = build_export_cmd(proj(), "out.mp4", bands=bands)
    assert "pip.mp4" in cmd
    i = cmd.index("-filter_complex"); fc = cmd[i + 1]
    assert "trim=start=0:end=3" in fc
    assert "scale=300:500" in fc
    assert "overlay=x=100:y=200" in fc
    assert "between(t\\,1\\,4)" in fc  # end = start(1.0) + (out_point(3) - in_point(0)) = 4.0

def test_bands_ass_then_video_box_then_ass_alternates_filter_chain():
    box = VideoBoxLayer(media_id="m1", file_path="pip.mp4", out_point=2, start=0, height=1920, z_index=5)
    bands = [
        {"kind": "ass", "path": "C:/tmp/band0.ass"},
        {"kind": "video_box", "video_box": box},
        {"kind": "ass", "path": "C:/tmp/band1.ass"},
    ]
    cmd = build_export_cmd(proj(), "out.mp4", bands=bands)
    fc = cmd[cmd.index("-filter_complex") + 1]
    assert "band0.ass" in fc and "band1.ass" in fc
    assert fc.index("band0.ass") < fc.index("overlay=") < fc.index("band1.ass")

def test_bands_final_map_uses_last_band_output():
    box = VideoBoxLayer(media_id="m1", file_path="pip.mp4", out_point=2, start=0, height=1920, z_index=5)
    bands = [{"kind": "video_box", "video_box": box}]
    cmd = build_export_cmd(proj(), "out.mp4", bands=bands)
    map_indices = [i for i, x in enumerate(cmd) if x == "-map"]
    assert cmd[map_indices[0] + 1] == "[ov0]"
    assert cmd[map_indices[1] + 1] == "[a]"

def test_bands_empty_list_maps_straight_from_concat():
    cmd = build_export_cmd(proj(), "out.mp4", bands=[])
    fc = cmd[cmd.index("-filter_complex") + 1]
    assert fc.rstrip().endswith("[vc][a]")
    map_indices = [i for i, x in enumerate(cmd) if x == "-map"]
    assert cmd[map_indices[0] + 1] == "[vc]"

def test_build_audio_cmd_one_atrim_per_clip_and_vn():
    from app.ffmpeg_cmd import build_audio_cmd
    cmd = build_audio_cmd(proj(), "out.wav")
    assert cmd[:1] == ["ffmpeg"] and cmd[-1] == "out.wav"
    i = cmd.index("-filter_complex"); fc = cmd[i + 1]
    assert fc.count("atrim=") == 2
    assert "-vn" in cmd
    assert cmd[cmd.index("-map") + 1] == "[a]"

def test_caption_ass_path_chained_as_final_filter_no_bands():
    cmd = build_export_cmd(proj(), "out.mp4", ass_path="C:/tmp/subs.ass", caption_ass_path="C:/tmp/caps.ass")
    fc = cmd[cmd.index("-filter_complex") + 1]
    assert "[vo]ass='C\\:/tmp/caps.ass'" in fc
    assert cmd[cmd.index("-map") + 1] == "[vcap]"

def test_caption_ass_path_chained_after_bands():
    box = VideoBoxLayer(media_id="m1", file_path="pip.mp4", in_point=0, out_point=3, start=0, width=200, height=200)
    bands = [{"kind": "video_box", "video_box": box}]
    cmd = build_export_cmd(proj(), "out.mp4", bands=bands, caption_ass_path="C:/tmp/caps.ass")
    fc = cmd[cmd.index("-filter_complex") + 1]
    assert "ass='C\\:/tmp/caps.ass'" in fc
    assert cmd[cmd.index("-map") + 1] == "[vcap]"

def test_no_caption_ass_path_leaves_vmap_unchanged():
    cmd = build_export_cmd(proj(), "out.mp4")
    assert "vcap" not in cmd[cmd.index("-filter_complex") + 1]

def test_video_only_clip_gets_synthesized_silent_audio():
    p = Project(name="r",
                media_library=[MediaItem(id="m0", file_path="a.mp4", duration=2, has_audio=False)],
                clips=[ClipLayer(media_id="m0", file_path="a.mp4", in_point=0, out_point=2, order=0)])
    cmd = build_export_cmd(p, "out.mp4")
    assert "anullsrc=channel_layout=stereo:sample_rate=44100" in cmd
    fc = cmd[cmd.index("-filter_complex") + 1]
    assert "atrim=start=0:end=2,asetpts=PTS-STARTPTS[a0]" in fc
    assert "concat=n=1:v=1:a=1" in fc

def test_mixed_audio_clips_input_indices_do_not_collide():
    p = Project(name="r", media_library=[
        MediaItem(id="m0", file_path="a.mp4", duration=2, has_audio=False),
        MediaItem(id="m1", file_path="b.mp4", duration=2, has_audio=True),
    ], clips=[
        ClipLayer(media_id="m0", file_path="a.mp4", in_point=0, out_point=2, order=0),
        ClipLayer(media_id="m1", file_path="b.mp4", in_point=0, out_point=2, order=1),
    ])
    cmd = build_export_cmd(p, "out.mp4")
    # input order must be: clip0 video/audio file, then the synthesized silence for clip0,
    # then clip1's file (which supplies both its own video and audio streams)
    ia, ilavfi, ib = cmd.index("a.mp4"), cmd.index("anullsrc=channel_layout=stereo:sample_rate=44100"), cmd.index("b.mp4")
    assert ia < ilavfi < ib
    fc = cmd[cmd.index("-filter_complex") + 1]
    assert "[0:v]trim=start=0:end=2" in fc      # clip0 video reads real input 0
    assert "[1:a]atrim=start=0:end=2,asetpts=PTS-STARTPTS[a0]" in fc  # clip0 audio reads synthesized input 1
    assert "[2:v]trim=start=0:end=2" in fc      # clip1 video reads real input 2
    assert "[2:a]atrim=start=0:end=2,asetpts=PTS-STARTPTS[a1]" in fc  # clip1 audio reads its own input 2

def test_clip_with_no_media_library_entry_defaults_to_has_audio():
    # proj() in this file builds clips with media_id referencing MediaItems that don't exist
    # in an empty media_library — must not raise, must behave as if has_audio=True (today's behavior).
    cmd = build_export_cmd(proj(), "out.mp4")
    assert "anullsrc" not in " ".join(cmd)

def test_build_audio_cmd_video_only_clip_gets_synthesized_silent_audio():
    from app.ffmpeg_cmd import build_audio_cmd
    p = Project(name="r",
                media_library=[MediaItem(id="m0", file_path="a.mp4", duration=2, has_audio=False)],
                clips=[ClipLayer(media_id="m0", file_path="a.mp4", in_point=0, out_point=2, order=0)])
    cmd = build_audio_cmd(p, "out.wav")
    assert "anullsrc=channel_layout=stereo:sample_rate=44100" in cmd
    assert "a.mp4" not in cmd
    fc = cmd[cmd.index("-filter_complex") + 1]
    assert "atrim=start=0:end=2,asetpts=PTS-STARTPTS[a0]" in fc
    assert "concat=n=1:v=0:a=1" in fc

def test_build_audio_cmd_mixed_audio_clips_input_indices_do_not_collide():
    from app.ffmpeg_cmd import build_audio_cmd
    p = Project(name="r", media_library=[
        MediaItem(id="m0", file_path="a.mp4", duration=2, has_audio=False),
        MediaItem(id="m1", file_path="b.mp4", duration=2, has_audio=True),
    ], clips=[
        ClipLayer(media_id="m0", file_path="a.mp4", in_point=0, out_point=2, order=0),
        ClipLayer(media_id="m1", file_path="b.mp4", in_point=0, out_point=2, order=1),
    ])
    cmd = build_audio_cmd(p, "out.wav")
    ilavfi, ib = cmd.index("anullsrc=channel_layout=stereo:sample_rate=44100"), cmd.index("b.mp4")
    assert ilavfi < ib
    fc = cmd[cmd.index("-filter_complex") + 1]
    assert "[0:a]atrim=start=0:end=2,asetpts=PTS-STARTPTS[a0]" in fc
    assert "[1:a]atrim=start=0:end=2,asetpts=PTS-STARTPTS[a1]" in fc

def test_build_audio_cmd_clip_with_no_media_library_entry_defaults_to_has_audio():
    from app.ffmpeg_cmd import build_audio_cmd
    cmd = build_audio_cmd(proj(), "out.wav")
    assert "anullsrc" not in " ".join(cmd)

def test_default_quality_uses_crf_18():
    cmd = build_export_cmd(proj(), "out.mp4")
    assert cmd[cmd.index("-crf") + 1] == "18"

def test_high_quality_uses_crf_18():
    p = proj()
    p.export_quality = "high"
    cmd = build_export_cmd(p, "out.mp4")
    assert cmd[cmd.index("-crf") + 1] == "18"

def test_medium_quality_uses_crf_23():
    p = proj()
    p.export_quality = "medium"
    cmd = build_export_cmd(p, "out.mp4")
    assert cmd[cmd.index("-crf") + 1] == "23"

def test_unknown_quality_defaults_to_crf_18():
    p = proj()
    p.export_quality = "ultra"
    cmd = build_export_cmd(p, "out.mp4")
    assert cmd[cmd.index("-crf") + 1] == "18"

def test_preset_fast_unchanged():
    cmd = build_export_cmd(proj(), "out.mp4")
    assert cmd[cmd.index("-preset") + 1] == "fast"

def test_medium_quality_crf_applies_in_bands_branch():
    box = VideoBoxLayer(media_id="m1", file_path="pip.mp4", out_point=2, start=0, height=1920, z_index=5)
    p = proj()
    p.export_quality = "medium"
    cmd = build_export_cmd(p, "out.mp4", bands=[{"kind": "video_box", "video_box": box}])
    assert cmd[cmd.index("-crf") + 1] == "23"

def test_speed_2x_video_setpts_and_audio_atempo():
    p = Project(name="r",
                media_library=[MediaItem(id="m0", file_path="a.mp4", duration=4, has_audio=True)],
                clips=[ClipLayer(media_id="m0", file_path="a.mp4", in_point=0, out_point=4, order=0, speed=2.0)])
    fc = build_export_cmd(p, "out.mp4")[build_export_cmd(p, "out.mp4").index("-filter_complex") + 1]
    assert "setpts=(PTS-STARTPTS)/2" in fc
    assert "atempo=2" in fc

def test_speed_half_video_setpts_and_audio_atempo():
    p = Project(name="r",
                media_library=[MediaItem(id="m0", file_path="a.mp4", duration=4, has_audio=True)],
                clips=[ClipLayer(media_id="m0", file_path="a.mp4", in_point=0, out_point=4, order=0, speed=0.5)])
    fc = build_export_cmd(p, "out.mp4")[build_export_cmd(p, "out.mp4").index("-filter_complex") + 1]
    assert "setpts=(PTS-STARTPTS)/0.5" in fc
    assert "atempo=0.5" in fc

def test_speed_1x_export_unchanged_no_atempo():
    p = Project(name="r",
                media_library=[MediaItem(id="m0", file_path="a.mp4", duration=4, has_audio=True)],
                clips=[ClipLayer(media_id="m0", file_path="a.mp4", in_point=0, out_point=4, order=0, speed=1.0)])
    fc = build_export_cmd(p, "out.mp4")[build_export_cmd(p, "out.mp4").index("-filter_complex") + 1]
    assert "setpts=PTS-STARTPTS," in fc     # the plain reset, not the /speed form
    assert "atempo" not in fc

def test_speed_scales_synthesized_silence_duration():
    p = Project(name="r",
                media_library=[MediaItem(id="m0", file_path="a.mp4", duration=4, has_audio=False)],
                clips=[ClipLayer(media_id="m0", file_path="a.mp4", in_point=0, out_point=4, order=0, speed=2.0)])
    fc = build_export_cmd(p, "out.mp4")[build_export_cmd(p, "out.mp4").index("-filter_complex") + 1]
    assert "atrim=start=0:end=2,asetpts=PTS-STARTPTS[a0]" in fc   # 4s source / 2x = 2s silence

def test_build_audio_cmd_applies_atempo_for_speed():
    from app.ffmpeg_cmd import build_audio_cmd
    p = Project(name="r",
                media_library=[MediaItem(id="m0", file_path="a.mp4", duration=4, has_audio=True)],
                clips=[ClipLayer(media_id="m0", file_path="a.mp4", in_point=0, out_point=4, order=0, speed=2.0)])
    fc = build_audio_cmd(p, "out.wav")[build_audio_cmd(p, "out.wav").index("-filter_complex") + 1]
    assert "atempo=2" in fc

def test_image_clip_uses_loop_and_t_flags():
    p = Project(name="r",
                media_library=[MediaItem(id="m0", file_path="photo.jpg", duration=0.0, has_audio=False, kind="image")],
                clips=[ClipLayer(media_id="m0", file_path="photo.jpg", in_point=0, out_point=3, order=0)])
    cmd = build_export_cmd(p, "out.mp4")
    i = cmd.index("photo.jpg")
    assert cmd[i - 5:i - 1] == ["-loop", "1", "-t", "3"]

def test_image_clip_still_gets_synthesized_silent_audio():
    p = Project(name="r",
                media_library=[MediaItem(id="m0", file_path="photo.jpg", duration=0.0, has_audio=False, kind="image")],
                clips=[ClipLayer(media_id="m0", file_path="photo.jpg", in_point=0, out_point=3, order=0)])
    cmd = build_export_cmd(p, "out.mp4")
    assert "anullsrc=channel_layout=stereo:sample_rate=44100" in cmd

def test_mixed_image_and_video_sequence_only_images_get_loop_flag():
    p = Project(name="r", media_library=[
        MediaItem(id="m0", file_path="a.mp4", duration=2, has_audio=True, kind="video"),
        MediaItem(id="m1", file_path="photo.jpg", duration=0.0, has_audio=False, kind="image"),
    ], clips=[
        ClipLayer(media_id="m0", file_path="a.mp4", in_point=0, out_point=2, order=0),
        ClipLayer(media_id="m1", file_path="photo.jpg", in_point=0, out_point=4, order=1),
    ])
    cmd = build_export_cmd(p, "out.mp4")
    i_video = cmd.index("a.mp4")
    i_image = cmd.index("photo.jpg")
    assert "-loop" not in cmd[max(0, i_video - 4):i_video]
    assert cmd[i_image - 5:i_image - 1] == ["-loop", "1", "-t", "4"]
    fc = cmd[cmd.index("-filter_complex") + 1]
    assert "trim=start=0:end=2" in fc  # video clip trim unchanged
    assert "trim=start=0:end=4" in fc  # image clip trim unchanged (defensive, harmless with -t)

def test_image_clip_speed_scales_loop_duration():
    p = Project(name="r",
                media_library=[MediaItem(id="m0", file_path="photo.jpg", duration=0.0, has_audio=False, kind="image")],
                clips=[ClipLayer(media_id="m0", file_path="photo.jpg", in_point=0, out_point=4, order=0, speed=2.0)])
    cmd = build_export_cmd(p, "out.mp4")
    i = cmd.index("photo.jpg")
    assert cmd[i - 5:i - 1] == ["-loop", "1", "-t", "2"]  # 4s / 2x speed = 2s

def test_image_clip_speed_setpts_not_double_applied():
    # The `-t` on the looped input already encodes the speed-adjusted duration, so setpts must
    # NOT also divide by speed again (that would halve the duration a second time: 4s/2/2 = 1s
    # instead of the intended 2s).
    p = Project(name="r",
                media_library=[MediaItem(id="m0", file_path="photo.jpg", duration=0.0, has_audio=False, kind="image")],
                clips=[ClipLayer(media_id="m0", file_path="photo.jpg", in_point=0, out_point=4, order=0, speed=2.0)])
    cmd = build_export_cmd(p, "out.mp4")
    i = cmd.index("photo.jpg")
    assert cmd[i - 5:i - 1] == ["-loop", "1", "-t", "2"]
    fc = cmd[cmd.index("-filter_complex") + 1]
    assert "setpts=PTS-STARTPTS," in fc
    assert "setpts=(PTS-STARTPTS)/2" not in fc

def test_clip_volume_applies_volume_filter():
    p = Project(name="r",
                media_library=[MediaItem(id="m0", file_path="a.mp4", duration=2, has_audio=True)],
                clips=[ClipLayer(media_id="m0", file_path="a.mp4", in_point=0, out_point=2, order=0, volume=1.5)])
    fc = build_export_cmd(p, "out.mp4")[build_export_cmd(p, "out.mp4").index("-filter_complex") + 1]
    assert "volume=1.5" in fc
    assert "[0:a]atrim=start=0:end=2,asetpts=PTS-STARTPTS,volume=1.5[a0];" in fc

def test_clip_default_volume_emits_no_volume_filter():
    cmd = build_export_cmd(proj(), "out.mp4")
    fc = cmd[cmd.index("-filter_complex") + 1]
    assert "volume=" not in fc

def test_muted_clip_forces_volume_zero():
    p = Project(name="r",
                media_library=[MediaItem(id="m0", file_path="a.mp4", duration=2, has_audio=True)],
                clips=[ClipLayer(media_id="m0", file_path="a.mp4", in_point=0, out_point=2, order=0, volume=1.5, muted=True)])
    fc = build_export_cmd(p, "out.mp4")[build_export_cmd(p, "out.mp4").index("-filter_complex") + 1]
    assert "volume=0" in fc
    assert "volume=1.5" not in fc

def test_muted_clip_with_default_volume_still_forces_volume_zero():
    p = Project(name="r",
                media_library=[MediaItem(id="m0", file_path="a.mp4", duration=2, has_audio=True)],
                clips=[ClipLayer(media_id="m0", file_path="a.mp4", in_point=0, out_point=2, order=0, muted=True)])
    fc = build_export_cmd(p, "out.mp4")[build_export_cmd(p, "out.mp4").index("-filter_complex") + 1]
    assert ",volume=0[a0];" in fc

def _proj_with_music(volume=0.3, muted=False):
    p = proj()
    p.media_library = [MediaItem(id="music1", file_path="song.mp3", duration=180, has_audio=True, kind="audio")]
    from app.models import MusicTrack
    p.music = MusicTrack(media_id="music1", volume=volume, muted=muted)
    return p

def test_music_track_adds_input_trims_and_amixes():
    p = _proj_with_music(volume=0.4)
    cmd = build_export_cmd(p, "out.mp4")
    assert "song.mp3" in cmd
    fc = cmd[cmd.index("-filter_complex") + 1]
    assert "atrim=start=0:end=4" in fc          # proj()'s two 2s clips = 4s sequence duration
    assert "volume=0.4[amusic]" in fc
    assert "[a][amusic]amix=inputs=2:duration=first[amix]" in fc
    map_indices = [i for i, x in enumerate(cmd) if x == "-map"]
    assert cmd[map_indices[-1] + 1] == "[amix]"

def test_no_music_track_leaves_map_a_unchanged():
    cmd = build_export_cmd(proj(), "out.mp4")
    fc = cmd[cmd.index("-filter_complex") + 1]
    assert "amix" not in fc
    map_indices = [i for i, x in enumerate(cmd) if x == "-map"]
    assert cmd[map_indices[-1] + 1] == "[a]"

def test_muted_music_skips_amix():
    p = _proj_with_music(muted=True)
    cmd = build_export_cmd(p, "out.mp4")
    assert "song.mp3" not in cmd
    fc = cmd[cmd.index("-filter_complex") + 1]
    assert "amix" not in fc

def test_zero_volume_music_skips_amix():
    p = _proj_with_music(volume=0.0)
    cmd = build_export_cmd(p, "out.mp4")
    assert "song.mp3" not in cmd
    fc = cmd[cmd.index("-filter_complex") + 1]
    assert "amix" not in fc

def test_music_with_missing_media_item_skips_gracefully():
    p = proj()
    from app.models import MusicTrack
    p.music = MusicTrack(media_id="does-not-exist", volume=0.3)
    cmd = build_export_cmd(p, "out.mp4")
    fc = cmd[cmd.index("-filter_complex") + 1]
    assert "amix" not in fc

def test_music_input_index_bookkeeping_with_video_box_band():
    p = _proj_with_music(volume=0.3)
    box = VideoBoxLayer(media_id="m1", file_path="pip.mp4", in_point=0, out_point=2, start=0, height=1920, z_index=5)
    cmd = build_export_cmd(p, "out.mp4", bands=[{"kind": "video_box", "video_box": box}])
    # inputs in order: clip a.mp4 (order 0), clip b.mp4 (order 1), song.mp3 (music), pip.mp4 (band)
    ia, ib, imusic, ipip = cmd.index("a.mp4"), cmd.index("b.mp4"), cmd.index("song.mp3"), cmd.index("pip.mp4")
    assert ia < ib < imusic < ipip
    fc = cmd[cmd.index("-filter_complex") + 1]
    assert "[3:v]" in fc      # pip.mp4 is input index 3 (0=a.mp4, 1=b.mp4, 2=song.mp3, 3=pip.mp4)
    map_indices = [i for i, x in enumerate(cmd) if x == "-map"]
    assert cmd[map_indices[-1] + 1] == "[amix]"

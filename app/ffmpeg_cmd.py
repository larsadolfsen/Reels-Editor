# Pure ffmpeg export-command builder: per-clip trim/scale/pad-or-crop (branched on ClipLayer.fill_mode:
# "fit" letterboxes, "fill" center-crops), concat with silent-audio synthesis for video-only clips,
# image clips (MediaItem.kind == "image") get `-loop 1 -t <duration>` prepended to their input,
# optional ASS burn or banded chain alternating ASS burn-in with video-box overlays.
# CRF is derived from Project.export_quality ("high" -> 18, "medium" -> 23, default 18).
# Per-clip ClipLayer.speed (!= 1.0) scales video pace via setpts=(PTS-STARTPTS)/speed and real audio
# via atempo=speed (both in build_export_cmd and build_audio_cmd); synthesized silence duration is
# scaled by 1/speed to match. At speed == 1.0 the emitted commands are byte-identical to the pre-speed baseline.
from app.models import Project
from app.timeline import ordered

def escape_filter_path(path: str) -> str:
    return path.replace("\\", "/").replace(":", "\\:")

def _num(x: float) -> str:
    return f"{x:g}"

_QUALITY_CRF = {"high": "18", "medium": "23"}

def _crf_for(p: Project) -> str:
    return _QUALITY_CRF.get(p.export_quality, "18")

def build_export_cmd(p: Project, out_path: str, ass_path: str | None = None, bands: list[dict] | None = None, caption_ass_path: str | None = None) -> list[str]:
    crf = _crf_for(p)
    clips = ordered(p.clips)
    media_by_id = {m.id: m for m in p.media_library}
    cmd = ["ffmpeg", "-y"]
    parts = []
    input_index = 0
    for i, c in enumerate(clips):
        v_idx = input_index
        media = media_by_id.get(c.media_id)
        if media and media.kind == "image":
            duration = (c.out_point - c.in_point) / c.speed
            cmd += ["-loop", "1", "-t", _num(duration), "-i", c.file_path]
        else:
            cmd += ["-i", c.file_path]
        input_index += 1
        setpts = f"(PTS-STARTPTS)/{_num(c.speed)}" if c.speed != 1.0 else "PTS-STARTPTS"
        trim_prefix = f"[{v_idx}:v]trim=start={_num(c.in_point)}:end={_num(c.out_point)},setpts={setpts},"
        suffix = f",setsar=1,fps={p.fps}[v{i}];"
        if c.fill_mode == "fill":
            scale_segment = (
                f"scale={p.width}:{p.height}:force_original_aspect_ratio=increase,"
                f"crop={p.width}:{p.height}")
        else:
            scale_segment = (
                f"scale={p.width}:{p.height}:force_original_aspect_ratio=decrease,"
                f"pad={p.width}:{p.height}:(ow-iw)/2:(oh-ih)/2")
        parts.append(trim_prefix + scale_segment + suffix)
        has_audio = media.has_audio if media else True
        if has_audio:
            atempo = f",atempo={_num(c.speed)}" if c.speed != 1.0 else ""
            parts.append(f"[{v_idx}:a]atrim=start={_num(c.in_point)}:end={_num(c.out_point)},asetpts=PTS-STARTPTS{atempo}[a{i}];")
        else:
            a_idx = input_index
            cmd += ["-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=44100"]
            input_index += 1
            duration = (c.out_point - c.in_point) / c.speed
            parts.append(f"[{a_idx}:a]atrim=start=0:end={_num(duration)},asetpts=PTS-STARTPTS[a{i}];")
    streams = "".join(f"[v{i}][a{i}]" for i in range(len(clips)))
    fc = "".join(parts) + f"{streams}concat=n={len(clips)}:v=1:a=1[vc][a]"

    if bands is None:
        vmap = "[vc]"
        if ass_path:
            fc += f";[vc]ass='{escape_filter_path(ass_path)}':fontsdir='{escape_filter_path('static/fonts')}'[vo]"
            vmap = "[vo]"
        if caption_ass_path:
            fc += f";{vmap}ass='{escape_filter_path(caption_ass_path)}':fontsdir='{escape_filter_path('static/fonts')}'[vcap]"
            vmap = "[vcap]"
        cmd += ["-filter_complex", fc, "-map", vmap, "-map", "[a]",
                "-c:v", "libx264", "-preset", "fast", "-crf", crf, "-c:a", "aac", out_path]
        return cmd

    current = "[vc]"
    next_input_index = input_index
    for step, band in enumerate(bands):
        if band["kind"] == "ass":
            out_label = f"[ass{step}]"
            fc += f";{current}ass='{escape_filter_path(band['path'])}':fontsdir='{escape_filter_path('static/fonts')}'{out_label}"
            current = out_label
        else:
            v = band["video_box"]
            cmd += ["-i", v.file_path]
            end = v.start + (v.out_point - v.in_point)
            out_label = f"[ov{step}]"
            fc += (f";[{next_input_index}:v]trim=start={_num(v.in_point)}:end={_num(v.out_point)},"
                   f"setpts=PTS-STARTPTS+{_num(v.start)}/TB,scale={v.width}:{v.height}[box{step}]"
                   f";{current}[box{step}]overlay=x={v.x}:y={v.y}:"
                   f"enable='between(t\\,{_num(v.start)}\\,{_num(end)})'{out_label}")
            current = out_label
            next_input_index += 1

    if caption_ass_path:
        fc += f";{current}ass='{escape_filter_path(caption_ass_path)}':fontsdir='{escape_filter_path('static/fonts')}'[vcap]"
        current = "[vcap]"

    cmd += ["-filter_complex", fc, "-map", current, "-map", "[a]",
            "-c:v", "libx264", "-preset", "fast", "-crf", crf, "-c:a", "aac", out_path]
    return cmd

def build_audio_cmd(p: Project, wav_path: str) -> list[str]:
    clips = ordered(p.clips)
    media_by_id = {m.id: m for m in p.media_library}
    cmd = ["ffmpeg", "-y"]
    parts = []
    input_index = 0
    for i, c in enumerate(clips):
        media = media_by_id.get(c.media_id)
        has_audio = media.has_audio if media else True
        if has_audio:
            a_idx = input_index
            cmd += ["-i", c.file_path]
            input_index += 1
            atempo = f",atempo={_num(c.speed)}" if c.speed != 1.0 else ""
            parts.append(f"[{a_idx}:a]atrim=start={_num(c.in_point)}:end={_num(c.out_point)},asetpts=PTS-STARTPTS{atempo}[a{i}];")
        else:
            a_idx = input_index
            cmd += ["-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=44100"]
            input_index += 1
            duration = (c.out_point - c.in_point) / c.speed
            parts.append(f"[{a_idx}:a]atrim=start=0:end={_num(duration)},asetpts=PTS-STARTPTS[a{i}];")
    fc = "".join(parts) + "".join(f"[a{i}]" for i in range(len(clips))) + f"concat=n={len(clips)}:v=0:a=1[a]"
    return cmd + ["-filter_complex", fc, "-map", "[a]", "-vn", "-ac", "1", "-ar", "16000", wav_path]

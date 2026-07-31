# Pure ffmpeg export-command builder: per-clip trim/scale/pad-or-crop (branched on ClipLayer.fill_mode:
# "fit" letterboxes, "fill" center-crops), concat with silent-audio synthesis for video-only clips,
# image clips (MediaItem.kind == "image") get `-loop 1 -t <duration>` prepended to their input,
# optional ASS burn or banded chain alternating ASS burn-in with video-box overlays.
# CRF is derived from Project.export_quality ("high" -> 18, "medium" -> 23, default 18).
# Per-clip ClipLayer.speed (!= 1.0) scales video pace via setpts=(PTS-STARTPTS)/speed and real audio
# via atempo=speed (both in build_export_cmd and build_audio_cmd); synthesized silence duration is
# scaled by 1/speed to match. At speed == 1.0 the emitted commands are byte-identical to the pre-speed baseline.
# Per-clip ClipLayer.volume/muted apply a `volume=<v>` filter to each clip's real audio chain
# (muted forces volume=0, overriding any set volume); the synthesized-silence path needs no
# volume filter. At volume == 1.0 and muted == False, no filter is emitted (byte-identical baseline).
# Project.music (MusicTrack), when set and audible (not muted, volume > 0), adds the referenced
# media file as one more input, trims it to the clip sequence's total duration, applies its
# volume, and amix=inputs=2:duration=first-mixes it with the concatenated clip audio — replacing
# the final audio map target [a] with [amix]. amix's default normalization (no normalize=0) is
# used as-is. No music: output is byte-identical to the pre-music baseline.
# Banded export additionally supports "image_box" bands: a `-loop 1 -t <duration>` looped
# still-image input, scaled and overlaid with `enable='between(t,start,start+duration)'` —
# same overlay/enable pattern as video-box bands, minus trim/setpts (no source timeline to trim).
# A band dict may carry an optional "mask_path" (a PNG written by app/main.py via app/mask_image.py):
# the PNG is added as a `-loop 1 -t <box duration>` input, alphaextract pulls its alpha channel out,
# and alphamerge writes it as the box stream's alpha immediately before the existing overlay — for a
# video box, before the setpts timeline offset so both alphamerge inputs start at t=0. No "mask_path"
# on any band produces a byte-identical command to the pre-mask baseline.
# Banded export also supports "shape" bands: a `-loop 1 -t <duration>` looped PNG input
# (pre-rendered by app/shape_render.py, exactly the shape's own width x height with its
# fill/opacity baked into the PNG's alpha channel) is overlaid directly — no scale or
# alphamerge step, since the PNG already carries everything the compositing needs.
from app.models import Project
from app.timeline import ordered, sequence_duration

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
        is_image = bool(media and media.kind == "image")
        # Image clips already bake the speed-adjusted duration into the `-t` flag on the looped
        # input above, so applying /speed to setpts here would double-apply it. Video clips still
        # need the /speed setpts scaling since their input stream runs at native duration.
        if is_image:
            setpts = "PTS-STARTPTS"
        else:
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
            if c.muted:
                volume_filter = ",volume=0"
            elif c.volume != 1.0:
                volume_filter = f",volume={_num(c.volume)}"
            else:
                volume_filter = ""
            parts.append(f"[{v_idx}:a]atrim=start={_num(c.in_point)}:end={_num(c.out_point)},asetpts=PTS-STARTPTS{atempo}{volume_filter}[a{i}];")
        else:
            a_idx = input_index
            cmd += ["-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=44100"]
            input_index += 1
            duration = (c.out_point - c.in_point) / c.speed
            parts.append(f"[{a_idx}:a]atrim=start=0:end={_num(duration)},asetpts=PTS-STARTPTS[a{i}];")
    streams = "".join(f"[v{i}][a{i}]" for i in range(len(clips)))
    fc = "".join(parts) + f"{streams}concat=n={len(clips)}:v=1:a=1[vc][a]"

    amap = "[a]"
    if p.music and not p.music.muted and p.music.volume > 0:
        music_media = media_by_id.get(p.music.media_id)
        if music_media:
            music_idx = input_index
            cmd += ["-i", music_media.file_path]
            input_index += 1
            music_duration = sequence_duration(clips)
            fc += (f";[{music_idx}:a]atrim=start=0:end={_num(music_duration)},asetpts=PTS-STARTPTS,"
                   f"volume={_num(p.music.volume)}[amusic]"
                   f";[a][amusic]amix=inputs=2:duration=first[amix]")
            amap = "[amix]"

    if bands is None:
        vmap = "[vc]"
        if ass_path:
            fc += f";[vc]ass='{escape_filter_path(ass_path)}':fontsdir='{escape_filter_path('static/fonts')}'[vo]"
            vmap = "[vo]"
        if caption_ass_path:
            fc += f";{vmap}ass='{escape_filter_path(caption_ass_path)}':fontsdir='{escape_filter_path('static/fonts')}'[vcap]"
            vmap = "[vcap]"
        cmd += ["-filter_complex", fc, "-map", vmap, "-map", amap,
                "-c:v", "libx264", "-preset", "fast", "-crf", crf, "-c:a", "aac", out_path]
        return cmd

    current = "[vc]"
    next_input_index = input_index
    for step, band in enumerate(bands):
        if band["kind"] == "ass":
            out_label = f"[ass{step}]"
            fc += f";{current}ass='{escape_filter_path(band['path'])}':fontsdir='{escape_filter_path('static/fonts')}'{out_label}"
            current = out_label
        elif band["kind"] == "video_box":
            v = band["video_box"]
            cmd += ["-i", v.file_path]
            box_input = next_input_index
            next_input_index += 1
            end = v.start + (v.out_point - v.in_point)
            out_label = f"[ov{step}]"
            mask_path = band.get("mask_path")
            if mask_path:
                # alphamerge must see both streams starting at t=0, so the timeline offset
                # (setpts ... +start/TB) is applied after the merge rather than before it.
                # The mask PNG at mask_path must be exactly v.width x v.height — alphamerge requires
                # its two input streams to have matching dimensions, and the box stream is scaled to
                # v.width:v.height below, so any mismatch fails at ffmpeg runtime with an opaque error.
                cmd += ["-loop", "1", "-t", _num(v.out_point - v.in_point), "-i", mask_path]
                mask_input = next_input_index
                next_input_index += 1
                fc += (f";[{box_input}:v]trim=start={_num(v.in_point)}:end={_num(v.out_point)},"
                       f"setpts=PTS-STARTPTS,scale={v.width}:{v.height}[boxs{step}]"
                       f";[{mask_input}:v]alphaextract[maskv{step}]"
                       f";[boxs{step}][maskv{step}]alphamerge,"
                       f"setpts=PTS-STARTPTS+{_num(v.start)}/TB[box{step}]")
            else:
                fc += (f";[{box_input}:v]trim=start={_num(v.in_point)}:end={_num(v.out_point)},"
                       f"setpts=PTS-STARTPTS+{_num(v.start)}/TB,scale={v.width}:{v.height}[box{step}]")
            fc += (f";{current}[box{step}]overlay=x={v.x}:y={v.y}:"
                   f"enable='between(t\\,{_num(v.start)}\\,{_num(end)})'{out_label}")
            current = out_label
        elif band["kind"] == "image_box":
            b = band["image_box"]
            cmd += ["-loop", "1", "-t", _num(b.duration), "-i", b.file_path]
            box_input = next_input_index
            next_input_index += 1
            end = b.start + b.duration
            out_label = f"[ov{step}]"
            mask_path = band.get("mask_path")
            if mask_path:
                # The mask PNG at mask_path must be exactly b.width x b.height — alphamerge requires
                # its two input streams to have matching dimensions, and the box stream is scaled to
                # b.width:b.height below, so any mismatch fails at ffmpeg runtime with an opaque error.
                cmd += ["-loop", "1", "-t", _num(b.duration), "-i", mask_path]
                mask_input = next_input_index
                next_input_index += 1
                fc += (f";[{box_input}:v]scale={b.width}:{b.height}[boxs{step}]"
                       f";[{mask_input}:v]alphaextract[maskv{step}]"
                       f";[boxs{step}][maskv{step}]alphamerge[box{step}]")
            else:
                fc += f";[{box_input}:v]scale={b.width}:{b.height}[box{step}]"
            fc += (f";{current}[box{step}]overlay=x={b.x}:y={b.y}:"
                   f"enable='between(t\\,{_num(b.start)}\\,{_num(end)})'{out_label}")
            current = out_label
        else:  # "shape"
            s = band["shape"]
            png_path = band["png_path"]
            cmd += ["-loop", "1", "-t", _num(s.duration), "-i", png_path]
            box_input = next_input_index
            next_input_index += 1
            end = s.start + s.duration
            out_label = f"[ov{step}]"
            # The PNG already carries the shape's fill/opacity baked into its own alpha channel
            # (app/shape_render.py) and is already exactly s.width x s.height, so — unlike
            # video_box/image_box — no scale or alphamerge step is needed before the overlay.
            fc += (f";{current}[{box_input}:v]overlay=x={s.x}:y={s.y}:"
                   f"enable='between(t\\,{_num(s.start)}\\,{_num(end)})'{out_label}")
            current = out_label

    if caption_ass_path:
        fc += f";{current}ass='{escape_filter_path(caption_ass_path)}':fontsdir='{escape_filter_path('static/fonts')}'[vcap]"
        current = "[vcap]"

    cmd += ["-filter_complex", fc, "-map", current, "-map", amap,
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

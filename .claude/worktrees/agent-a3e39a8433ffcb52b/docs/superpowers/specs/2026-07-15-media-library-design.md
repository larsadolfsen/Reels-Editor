# Media library separate from timeline clips

Date: 2026-07-15

## Problem

The MEDIA panel (left column) currently renders `project.clips` directly —
the same list that backs the timeline. Importing a file pushes straight into
`project.clips`, and clicking a MEDIA row calls `selectClip()`, which opens
the VIDEO context panel and seeks the player. Visually and functionally the
MEDIA panel is indistinguishable from a second view onto the timeline, which
is wrong: it's meant to be an import staging area, decoupled from the
player/timeline/VIDEO panel.

## Data model

New `MediaItem` entity, and a `media_id` link from `ClipLayer` back to it:

```python
class MediaItem(BaseModel):
    id: str = Field(default_factory=new_id)
    file_path: str
    duration: float

class ClipLayer(BaseModel):
    id: str = Field(default_factory=new_id)
    media_id: str          # NEW — references MediaItem.id
    file_path: str
    in_point: float = 0.0
    out_point: float
    order: int

class Project(BaseModel):
    ...
    media_library: list[MediaItem] = []   # NEW
    clips: list[ClipLayer] = []
```

`file_path` stays duplicated on `ClipLayer` — nothing that reads clips today
(`ffmpeg_cmd.py`, `ass_render.py`, `timeline.py`, `preview.js`, `timeline.js`)
needs to join through `MediaItem`, and duplicating avoids a lookup at every
call site. `media_id` exists purely as a traceable link for future features
(e.g. re-adding the same media, or an "already on timeline" indicator on
library rows) — nothing reads it yet.

## Import flow

`addClip()` (`static/editor.js`) changes from "probe → push one ClipLayer"
to "probe → push a MediaItem to `project.media_library` → push a ClipLayer
(with `media_id` set) to `project.clips`". Both are saved in the same
`saveProject()` call, same as today. Media still lands on the timeline
automatically on import — there is no explicit "add to timeline" action in
this task (see Non-goals).

## MEDIA panel

`renderClipList()` is renamed `renderMediaList()` and reads from
`project.media_library` instead of `project.clips`. Row click toggles a new
local `selectedMediaId` variable (highlight class only, same visual pattern
as the existing `.selected` class) — it does **not** call `selectClip()`,
`showPanel()`, or `Preview.seek()`, and is entirely independent from the
timeline/VIDEO-panel `selected` state. Clicking a MEDIA row never touches
the player or the right-hand context panel.

Everything else in the MEDIA panel (thumbnail, filename, formatted
duration, import button, collapsed rail) is unchanged.

## Non-goals

- No explicit "Add to timeline" button/action. Import remains the only way
  media reaches the timeline. Wiring a real add-to-timeline action (and
  deciding what happens if the same media is added twice) is deferred to a
  later task.
- No dedup or "already on timeline" indicator in the MEDIA panel.
- Timeline rendering, VIDEO panel, trim/reorder are untouched — they keep
  working off `project.clips` exactly as today.

## Testing

- `tests/test_models.py`: add a `MediaItem` round-trip case; add `media_id`
  to existing `ClipLayer` fixtures.
- No new backend behavior beyond the model change, so no new Python logic
  to test.
- The click-decoupling is thin UI wiring with no reasonably-coverable pure
  logic; verify manually in the browser: import a file, confirm it appears
  in MEDIA and on the timeline, click the MEDIA row and confirm the player/
  timeline/VIDEO panel are unaffected while the row highlights.

# AUDIO panel — design

Date: 2026-07-29
Status: approved

## Goal

Three related changes to the editor's timeline and right-hand context panels:

1. The timeline's main video row is labelled `MAIN` instead of `VIDEO`.
2. Clicking the timeline's AUDIO row opens a new context panel dedicated to the timeline's
   audio, not the existing music-import panel.
3. The two audio-derived automations — auto silence removal and auto-caption — move into that
   new panel, together, under one tab.

The AUTO SLICE panel disappears as a standalone destination; its icon-rail slot becomes an
`AUTO` entry opening the new panel.

The rail's existing `AUDIO` entry is the *insert* action — it adds a background-music track to
the timeline — and is not touched. The new entry is deliberately labelled `AUTO` rather than
`AUDIO` to avoid a duplicate label beside it; the panel it opens is still headed `AUDIO`,
matching the timeline row it belongs to.

## Rationale

The AUDIO timeline row visualises the clips' own audio. Both auto-caption (transcribe the
clips' audio) and auto silence removal (detect silence/filler in the clips' audio) operate on
exactly that. Today they are split across two unrelated destinations — auto-caption is buried
in the CAPTIONS panel's Closed-captions tab, auto silence removal is its own AUTO SLICE rail
entry — and clicking the AUDIO row lands on music import, which has nothing to do with the row
it was clicked from.

## Non-goals

- No change to the music track feature. `Project.music`, the rail's `AUDIO` entry, and
  `#panel-audio` keep working exactly as they do now.
- No backend change. `CaptionTrack.language`, `POST /api/projects/{id}/transcribe`, and the
  `/auto-slice/*` routes are untouched.
- No change to the auto-slice detection/apply algorithm or its three-step flow.
- No change to the CAPTIONS panel's transcript list, Filler-words tab, or any styling tab.

## Data model

Unchanged. This is a pure UI relocation:

- `CaptionTrack.language` still stores the transcription language; the settings row that writes
  it simply renders in a different panel.
- No new entities, no new persisted fields, no migration.

## Components

### 1. Timeline row label

`static/index.html` — `<div class="row-label" id="label-video">VIDEO</div>` becomes `MAIN`.

The id `label-video` and the row's `data-row="video"` are the keys `Timeline.setRowVisible`
and `timeline.css` use; both stay. Only the display text changes. Caps match the sibling
labels (`CAPTIONS`, `AUDIO`) — `.row-label` has no `text-transform`, so the casing in the HTML
is what renders.

### 2. New panel `#panel-audio-track`

A new `.context-panel` section in `static/index.html`:

```
#panel-audio-track
  .style-panel-header            "AUDIO"
  #panel-audio-track-main
    #audio-track-tab-bar         UI.tabBar, one tab: { value: "auto", label: "Auto" }
    #audio-track-auto-body
      .style-group-label         "AUTO CAPTION"
      #audio-language-row        UI.settingsRow -> language drill-down
      #audio-auto-caption-btn    "Auto-caption"
      #audio-transcribe-error    <p hidden>
      .style-group-label         "AUTO SILENCE"
      #auto-slice-idle           }
      #auto-slice-results        } moved verbatim from #panel-auto-slice
      #auto-slice-confirm        }
  #panel-audio-track-language    language drill-down subpanel (hidden by default)
    #audio-language-subpanel-header
    #audio-language-list
```

The tab bar carries a single tab today. That is deliberate: the panel is expected to gain more
tabs, and a tab bar established now keeps the later addition a pure content change.

`#panel-auto-slice` is deleted as a wrapper; its three inner view divs move into the new panel
with their ids and classes intact, so `panel-auto-slice.js` and `auto-slice-panel.css` keep
working unchanged.

### 3. Files

Per the project's one-feature-per-file convention:

| File | Change |
|---|---|
| `static/panel-audio-track.js` | **new**. `window.AudioTrackPanel.render()` — owns the tab bar and delegates to `AudioTrackPanel.renderLanguage()`, the auto-caption button wiring, and `AutoSlicePanel.render()`. |
| `static/audio-panel-auto-caption.js` | **new**. The `runAutoCaption()` function moved out of `panel-captions.js`, plus the `#audio-auto-caption-btn` click listener. Keeps the global name `runAutoCaption` so `clip-sequence.js`'s auto-caption-on-clip-add call site needs no change. Its error element becomes `#audio-transcribe-error`; on success it re-renders the captions panel (for the transcript list) and the audio panel. |
| `static/audio-panel-language.js` | **new**, replaces `static/caption-panel-language.js` (deleted). Same settings-row + drill-down implementation, still writing `CaptionTrack.language` via `ensureCaptionTrack()`. Ids rename `caption-language-*` → `audio-language-*`, `#panel-captions-language` → `#panel-audio-track-language`. Exposes `window.AudioTrackPanel.renderLanguage()`. |
| `static/panel-auto-slice.js` | Logic unchanged. Only the idle hint text changes: it currently points the user at the CAPTIONS panel to transcribe first, but auto-caption now sits directly above it in the same tab. |
| `static/panel-captions.js` | Removes the `CaptionPanel.renderLanguage()` call, the `#panel-captions-language` hide, the `#caption-transcribe-error` reset, and `runAutoCaption()` + its listener. |
| `static/panel-nav.js` | The `auto-slice` rail entry becomes `audio-track` (label `AUTO`, Lucide `audio-lines` icon) in the same slot. `openAutoSlicePanel()` → `openAudioTrackPanel()` (sets `selected = { type: "audio-track" }`, calls `AudioTrackPanel.render()`). `showPanel()`'s section list and `PANEL_NAV_HANDLERS` updated to match. |
| `static/editor.js` | The `Timeline.render` action `onSelectAudio: () => openAudioPanel()` becomes `openAudioTrackPanel()`. |
| `static/index.html` | Row label, the new panel markup, the removed caption-panel markup, and the `<script>` tag set. |
| `static/css/components/auto-slice-panel.css` | Unchanged — every class name survives the move. |

### 4. What explicitly stays put

- The CAPTIONS panel's Closed-captions tab keeps the editable transcript list
  (`#caption-transcript-section`). Only the language row, the Auto-caption button, and the
  transcribe error line leave it.
- The rail's `AUDIO` entry still opens `#panel-audio` for music import. `panel-media.js`'s
  audio-row plus icon still calls `openAudioPanel()`.

## Data flow

Clicking the timeline AUDIO row → `Timeline.render`'s `onSelectAudio` → `openAudioTrackPanel()`
→ `showPanel("audio-track")` + `AudioTrackPanel.render()`. Identical entry from the rail's
`AUTO` button via `PANEL_NAV_HANDLERS`.

`AudioTrackPanel.render()` calls `ensureCaptionTrack()` (so the language row has a track to
read), `AudioTrackPanel.renderLanguage()`, and `AutoSlicePanel.render()` — the latter already
self-heals its own view state and the no-transcript hint.

Auto-caption still writes `project` from the `/transcribe` response and re-renders the timeline;
the only difference is which DOM elements hold its button label and error text.

## Error handling

Unchanged from today:

- Transcription failure (including the 503 when the `ml` extra is not installed) shows the
  response's `detail` in `#audio-transcribe-error`.
- `Api.detectAutoSlice` / `Api.applyAutoSlice` returning null leaves the panel in its current
  view with the button re-enabled.
- Calling `runAutoCaption()` from `clip-sequence.js` while the AUDIO panel is closed still
  updates hidden DOM harmlessly, same as today.

## Testing

This change touches no Python. The full `pytest` suite runs before completion to prove the
backend is unaffected, but it cannot cover any of the actual work here.

**Stated untested gap:** the repo has no JavaScript test runner (`tests/` is pytest-only), so
this panel wiring — element ids, show/hide routing, tab bar, click handlers — has no automated
coverage. This is a pure relocation of existing, already-working logic: no new algorithm is
introduced, and the moved functions keep their bodies. Verification is manual in the browser
preview against a throwaway project (never real project data, since the app's unload
keepalive-save flushes in-memory mutations to disk):

1. Timeline main row reads `MAIN`.
2. Clicking the timeline AUDIO row opens the new AUDIO panel, not ADD MUSIC.
3. The rail's `AUTO` button opens the same panel; `AUTO SLICE` is gone from the rail.
4. The rail's `AUDIO` button still opens music import and music import still works.
5. Language row opens its drill-down, selects a language, and persists.
6. Auto-caption runs and populates the CAPTIONS transcript list.
7. Detect → approve → Confirm & Apply still cuts ranges out of the timeline.
8. CAPTIONS panel's remaining tabs render with no console errors.

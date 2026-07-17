# Backlog

Running list of things to do, picked one at a time. Add items as they come up (in any thread); check them off here once shipped and merged.

## To do

Major roadmap revised — see [2026-07-17-major-plan-revision-design.md](specs/2026-07-17-major-plan-revision-design.md) for process rules (brainstorm before every phase, small parallel-worktree tasks, visual checkpoint per phase) and full phase detail. Phases below, in order:

- [ ] **Phase 1 — Text Box finish** — see [2026-07-17-text-box-design.md](specs/2026-07-17-text-box-design.md) and [2026-07-17-text-box.md](plans/2026-07-17-text-box.md); needs its own brainstorm before planning the drag subthread (the other two are just finishing the existing plan, no brainstorm needed)
  - [ ] [sequential] Existing plan Task 12 — `CLAUDE.md` inventory update (docs only)
  - [ ] [sequential] Existing plan Task 13 — end-to-end browser + export verification, then `superpowers:finishing-a-development-branch` (needs ffmpeg on PATH)
  - [ ] [new, brainstorm first] Drag-to-reposition the box body on the stage — the existing plan explicitly deferred this to resize-only; likely touches `preview.js` (mousedown/drag on `.text-block`, distinct from `UI.resizeHandles`) and `editor.js` (write back to `offset_x`/`offset_y`), no backend change expected
- [ ] **Phase 2 — Text panel accordion restructure** — components built with an eye to reuse by Phase 3 Captions; needs its own brainstorm before planning (in particular: exact STYLE-preset UX, and whether highlight is `TextPreset` fields or a separate model)
  - [ ] [parallel-safe] Backend: `GET /api/presets` / `POST /api/presets` routes in `app/main.py` — `store.load_presets`/`store.save_preset` already exist, routes never built (original plan's Task 8)
  - [ ] [parallel-safe] Backend: `TextPreset` highlight fields (e.g. `highlight: bool`, `highlight_color: str`) + migration, mirroring the existing box-field pattern in `app/models.py`
  - [ ] [parallel-safe] Backend: `ass_render.py` highlight rendering (background box behind glyphs, distinct from the Box `\p1` dialogue) + tests
  - [ ] [depends on preset routes] UI: STYLE accordion — new component (save-as-preset flow, preset list, apply-preset) plus wiring in `editor.js`
  - [ ] [parallel-safe] UI: FONT accordion consolidation — move size/weight/italic/underline/color/outline out of MISC into FONT alongside the existing font-family row; add highlight toggle + color swatch
  - [ ] [parallel-safe] UI: POSITION accordion — extract existing align/anchor-grid/offset controls out of MISC into their own accordion
  - [ ] [parallel-safe] UI: TIME accordion — extract existing start/end controls out of MISC into their own accordion
  - [ ] [parallel-safe] UI: `preview.js` highlight rendering — background-behind-glyphs CSS on `.text-block` spans, reads the new highlight fields
  - [ ] [parallel-safe] UI: inline text editing — make the `.text-block` div on the stage `contenteditable`, wire input to update `project.text_blocks[].heading` + `saveProject()`, keep the panel textarea in sync both ways
  - [ ] [sequential, after the above land] Confirm BOX accordion (already built in Phase 1) sits correctly among the new six-accordion order; no code expected, just placement/verification
- [ ] **Phase 3 — Captions** — revives original plan's Tasks 10-12; needs its own brainstorm before planning (in particular: how a caption track's FONT/STYLE/BOX/POSITION settings are modeled — one shared preset for the whole track, or per-line)
  - [ ] [parallel-safe] Backend: `app/transcribe.py` — faster-whisper wrapper, `words_from_segments`/`transcribe_file` (original plan's Task 10)
  - [ ] [parallel-safe] Backend: `ffmpeg_cmd.build_audio_cmd` — export assembled reel's audio to wav for transcription (original plan's Task 10)
  - [ ] [sequential, needs both above] Backend: `POST /api/projects/{pid}/transcribe` route wiring
  - [ ] [parallel-safe] Backend: `ass_render.group_words` + karaoke `\k` dialogue generation + tests (original plan's Task 12)
  - [ ] [depends on Phase 2 accordion components existing] UI: wire FONT/STYLE/BOX/POSITION accordions into the CAPTIONS panel, reusing Phase 2's components against the caption track's preset instead of a text block's
  - [ ] [parallel-safe] UI: HIGHLIGHT accordion for captions — mode toggle (current-word-only vs progressive-fill karaoke), reusing the Phase 2 highlight fields/rendering as the base
  - [ ] [parallel-safe] UI: caption list subpanel — new drill-down component (like the font list) showing every caption word/line with timestamps, inline-editable text
  - [ ] [sequential, after transcribe route] UI: "Auto-caption" button wiring in `editor.js`
  - [ ] [sequential, after the above land] UI: `preview.js` caption overlay — active line/word rendering + live highlight tick per the chosen mode
- [ ] **Phase 4 — Video Box (picture-in-picture):** needs its own brainstorming session first — `ClipLayer` has no position/size concept yet; subthread breakdown deferred until that brainstorm defines the data model
- [ ] **Phase 5 — Export polish:** needs its own brainstorm before planning; likely subthreads — one preview/export parity spot-check per layer type (text, box, captions, video box), one cleanup task per known limitation (audio-stream requirement, clip-join hiccup), one whole-milestone end-to-end verification pass
- [ ] Logo dot and REEL positioning — no spec/details yet, gather when picked up
- [ ] Move Color control into FONT accordion + shrink color swatch to 28x28px — no spec/details yet, gather when picked up; largely superseded by Phase 2's accordion restructure above, but keep until Phase 2 is picked up
- [ ] Redesign safe-zone guide overlay for clarity — dashed lines/labels in `static/css/components/safe-zones.css` are hard to see against busy video content; needs higher-contrast styling (shaded bands, label chips, etc.), preview-only, no spec yet
- [ ] Accordion section spacing/divider — add bottom padding/margin to accordion body content (`static/css/components/accordion.css`), and move the divider from `border-top` to `border-bottom`; no spec/details yet, gather when picked up

## Done

- [x] Font Family row: two stacked lines (label above, value+chevron below) — see [2026-07-17-font-family-drilldown-design.md](specs/2026-07-17-font-family-drilldown-design.md), task 7
- [x] Font Family drill-down header: align with `#style-panel-collapse-toggle` — see [2026-07-17-font-family-drilldown-design.md](specs/2026-07-17-font-family-drilldown-design.md), task 8
- [x] Divider between FONT and MISC accordion content — see [2026-07-17-font-family-drilldown-design.md](specs/2026-07-17-font-family-drilldown-design.md), task 12
- [x] Font list rows: replace Apply-button flow with hover-to-preview + click-to-save — see [2026-07-17-font-family-drilldown-design.md](specs/2026-07-17-font-family-drilldown-design.md), task 9
- [x] Font list: checkmark on applied font, pinned to top of list — see [2026-07-17-font-family-drilldown-design.md](specs/2026-07-17-font-family-drilldown-design.md), task 10
- [x] Font list row background: transparent at rest, lighter grey on hover only — see [2026-07-17-font-family-drilldown-design.md](specs/2026-07-17-font-family-drilldown-design.md), task 11
- [x] `UI.resizeHandles` component (Text Box plan Task 6) — see [2026-07-17-text-box.md](plans/2026-07-17-text-box.md)
- [x] Font Family revision: manual verification in browser — see [2026-07-17-font-family-drilldown-design.md](specs/2026-07-17-font-family-drilldown-design.md), task 13
- [x] Text Box component, Tasks 1-5 (Pillow/fontTools dep, `TextPreset` box fields + migration, word-wrap, ASS rounded-rect box rendering) — see [2026-07-17-text-box.md](plans/2026-07-17-text-box.md); merged, `pytest -q` green (40 passed)
- [x] Text Box component, Tasks 7-11 (BOX accordion markup/wiring, `preview.js` box CSS rendering, stage resize handles) — see [2026-07-17-text-box.md](plans/2026-07-17-text-box.md); merged, verified live in browser
- [x] `UI.divider` component, extracted from one-off `.style-divider` CSS, used for the VIDEO/TEXT panel dividers and between Font Family drill-down rows — see `static/ui-divider.js`

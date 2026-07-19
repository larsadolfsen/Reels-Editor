# Phase 3 — Video Box (Picture-in-Picture) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add one or more picture-in-picture "video box" layers, positioned/sized on the 1080×1920 canvas with independent timeline placement and trim, freely z-ordered against text blocks, draggable into the main sequence.

**Architecture:** A new `VideoBoxLayer` model (own `project.video_boxes` list) parallels the existing `TextBlockLayer`. A shared `z_index` field on both drives one merged stacking order, applied as CSS `z-index` in the browser preview and as an alternating ASS-burn/ffmpeg-overlay "banded" filter graph at export. New UI: a VIDEO BOX timeline row + context panel (add/trim/time/position/size), a LAYERS panel for drag-to-reorder, and a drag-to-stitch interaction converting a video box into a main-sequence clip.

**Tech Stack:** FastAPI/Pydantic backend (`app/*.py`), vanilla JS frontend (no build step, `window.UI.*`/`window.Api.*` conventions), ffmpeg/ffprobe for export, pytest for backend tests.

**Design doc:** [docs/superpowers/specs/2026-07-19-phase-3-video-box-design.md](../../specs/2026-07-19-phase-3-video-box-design.md)

## Global Constraints

- No JS build step/bundler — new icons (if any) copied from Lucide, existing `viewBox`/stroke wrapper style.
- One `UI.*`/`Api.*` component or one backend module per file — never grouped into shared catch-alls.
- No inline `style="..."` in `static/index.html` or JS-rendered markup — styling lives in `static/css/**` component files as classes (dynamic per-instance values like computed pixel positions set via `.style.propertyName =` in JS are the existing, established exception — see `preview.js`'s text-block rendering — not a `style="..."` attribute in markup).
- Every `static/*.js` and `static/css/**/*.css` file opens with a one/two-line purpose comment.
- Video boxes: muted always, aspect-ratio locked on resize, timeline `end` always derived (`start + out_point - in_point`, never stored), sourced only from `project.media_library`.
- Zero video boxes on a project must produce byte-identical export behavior to before this phase (no regression for existing projects).

---

## Task Batches (execution order)

**Batch 0 — Foundation (sequential, land first, blocks everything else):**
- [Task 1: Backend data model](task-1-data-model.md)

**Batch 1 — Scaffolding (sequential, after Task 1, blocks the parallel batch):**
- [Task 2: Frontend scaffolding](task-2-scaffolding.md)

**Batch 2 — Parallel component tasks (dispatch simultaneously after Task 2 merges; each touches only its own new file(s) plus, where noted, a non-overlapping region of an existing shared file):**
- [Task 3: ASS banding support](task-3-ass-render-banding.md)
- [Task 4: ffmpeg banded export](task-4-ffmpeg-export-banding.md)
- [Task 5: Video-box drag interaction](task-5-ui-video-box-drag.md)
- [Task 6: Video-box stage preview](task-6-video-box-preview.md)
- [Task 7: Timeline VIDEO BOX row](task-7-timeline-row.md)
- [Task 8: VIDEO BOX context panel](task-8-panel-video-box.md)
- [Task 9: LAYERS panel](task-9-panel-layers.md)

**Batch 3 — Integration (sequential, after all of Batch 2 merges):**
- [Task 10: editor.js wiring + drag-to-stitch + finishing the branch](task-10-editor-integration.md)

## Status

Each task file has a status marker at its top: `**Status:** not started` / `started` / `complete`. Update it the moment a task is dispatched, not only on completion.

- Task 1: not started
- Task 2: not started
- Task 3: not started
- Task 4: not started
- Task 5: not started
- Task 6: not started
- Task 7: not started
- Task 8: not started
- Task 9: not started
- Task 10: not started

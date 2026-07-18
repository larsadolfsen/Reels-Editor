# Phase 4 — Video Box (Picture-in-Picture)

**Parent:** [2026-07-17-major-plan-revision-design.md](2026-07-17-major-plan-revision-design.md)
**Status:** planning only, minimal — this phase's first real step is its own full brainstorming session (not a verification pass like Phases 1–3, since there's no existing design to check against).

## Goal

Add a second visual clip layer that can be composited picture-in-picture over the main timeline sequence — a small video positioned/sized on the 1080×1920 canvas, independent of the primary clip sequence.

## Why this phase is thin

`ClipLayer` (`app/models.py`) currently has no position/size concept at all — it's a flat sequence entry (`file_path`, `in_point`, `out_point`, `order`). Every other phase in this roadmap (Text Box, accordion restructure, rich-text formatting, Captions) builds on data models and UI patterns that already exist somewhere in the codebase. Video Box doesn't: the data model itself — does a video-box clip get a new layer type distinct from `ClipLayer`, or does `ClipLayer` grow optional position/size fields used only when it's flagged as picture-in-picture? — is an open design question that needs full exploration, not just verification of a pre-drafted breakdown.

## What's likely reusable (informal, not a commitment)

Based on Phase 1's Text Box work: `UI.resizeHandles` (`static/ui-resize-handles.js`) is explicitly built generic/DOM-only so it can be reused here for on-stage resizing without new code. Whatever drag-to-reposition mechanism Phase 1 lands with (see [phase-1-text-styling-complete-design.md](2026-07-17-phase-1-text-styling-complete-design.md)) is likely reusable too, since both are "a rectangle on the stage you can move and resize."

## Next step

When this phase is picked up: run a full `superpowers:brainstorming` session (not a quick verification) to settle the data model, then a `superpowers:writing-plans` session to produce the actual subthread breakdown — this document intentionally does not attempt that breakdown yet.

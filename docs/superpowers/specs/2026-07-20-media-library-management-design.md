# Media Library Management — Design

**Status:** brainstormed 2026-07-20, ready to plan. No open questions.

## What / Why

Library rows are display-only. Add: rename an item, see whether it's in use, remove unused items.

## Data model

- `MediaItem.name: str = ""` — display name; empty means "derive from `file_path`'s stem" (so existing projects need no migration and show what they show today).

## Design

- Row hover reveals two icon buttons (Lucide pencil, trash) on each `#clip-list` row.
- Rename: pencil swaps the name label for an inline text input (commit on Enter/blur, Escape cancels — same pattern as `caption-panel-words.js`'s inline editing); writes `MediaItem.name`, saves. Timeline clip blocks and VIDEO panel show the same name.
- In-use indicator: rows referenced by ≥1 `ClipLayer` (or the future `MusicTrack`) show a small usage count chip; their trash button is **disabled** with a tooltip ("used by N clips") — no cascade delete (decided: simplest safe behavior).
- Remove: trash on an unused row removes the `MediaItem` from `media_library` (the file on disk is untouched — the library stores paths, not copies), saves, re-renders.

## Tasks

1. `MediaItem.name` field + name-resolution helper (backend: model only; test default/fallback).
2. Library row hover actions: rename flow.
3. Usage-count computation + disabled-trash remove flow.

## Testing

- `test_models.py`: `name` default, old JSON loads.
- UI manual verification: rename persists and shows on timeline; trash disabled while in use, works after the clip is deleted; file on disk untouched.

## Out of scope

- Deleting/moving files on disk.
- Cascade-deleting clips that use an item.
- Folders/tags/search in the library.

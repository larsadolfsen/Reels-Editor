# Copy/Duplicate Items — Design

**Status:** brainstormed 2026-07-20, ready to plan. No open questions.

## What / Why

Duplicate the selected clip or text block: Ctrl+D plus a panel button.

## Design

- **Clip:** deep-copy the selected `ClipLayer` with a `new_id()`-style id, insert immediately after the original in `order` (shift the rest), same `media_id`/trims/settings.
- **Text block:** deep-copy the block *and its preset* (new ids for both; `preset_id` re-linked), heading copied, position offset by +20/+20 px so the copy is visibly distinct, new block selected. Requires the multi-text-block item (a second block must be editable) — dependency noted.
- Ctrl+D in the global keyboard handler acts on `selected` (clip or text block), with the existing input-focus guard; `preventDefault` (browser bookmark). Panel button: a "Duplicate" icon button (Lucide copy) in the VIDEO and TEXT panels.
- Captions/music are singletons — no duplicate.

## Data model

None — copies of existing entities with fresh ids.

## Tasks

1. `duplicateClip(id)` / `duplicateTextBlock(id)` in `editor.js` + panel buttons.
2. Ctrl+D wiring.

## Testing

JS mutations — manual verification: duplicate clip plays twice back-to-back and exports so; duplicated text block is independently editable/styled (changing one preset doesn't affect the other); Ctrl+D respects focus guard. `pytest -q` green.

## Out of scope

- Cross-project copy/paste.
- A clipboard model (cut/paste) — this is duplicate-in-place only.

## Dependency note

Text-block duplication needs multi-block editing from [2026-07-20-empty-project-and-multi-text-design.md](2026-07-20-empty-project-and-multi-text-design.md).

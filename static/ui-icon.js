// Reusable icon service, framework-free. Attaches to window.UI.
// Depends on nothing. Path data for every icon currently in use lives here — this file's own
// payload, not a shared catch-all (see the UI-consistency design spec's non-goals).
const globalObj = typeof window !== "undefined" ? window : global;
globalObj.UI = globalObj.UI || {};

// Lucide-sourced path/shape data, viewBox 0 0 24 24. Key = kebab-case Lucide icon name.
// Every entry below has been spot-checked against its real current call site in this codebase
// (not just transcribed from the design brief) — see task-9-report.md for the verification notes.
const ICON_PATHS = {
  plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
  pencil: '<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/>',
  trash: '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  "volume-2": '<path d="M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z"/><path d="M16 9a5 5 0 0 1 0 6"/><path d="M19.364 18.364a9 9 0 0 0 0-12.728"/>',
  "volume-x": '<path d="M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z"/><line x1="22" x2="16" y1="9" y2="15"/><line x1="16" x2="22" y1="9" y2="15"/>',
  play: '<polygon points="6,4 20,12 6,20" fill="currentColor"/>',
  pause: '<rect x="6" y="4" width="4" height="16" fill="currentColor"/><rect x="14" y="4" width="4" height="16" fill="currentColor"/>',
  "step-back": '<polygon points="19,4 19,20 8,12" fill="currentColor"/><rect x="4" y="4" width="2" height="16" fill="currentColor"/>',
  "step-forward": '<polygon points="5,4 16,12 5,20" fill="currentColor"/><rect x="18" y="4" width="2" height="16" fill="currentColor"/>',
  restart: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>',
  "panel-left-close": '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M15 3v18"/><path d="m8 9 3 3-3 3"/>',
  "panel-left-open": '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M15 3v18"/><path d="m10 15-3-3 3-3"/>',
  "grip-vertical": '<circle cx="9" cy="5" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="19" r="1"/>',
  scissors: '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M8.12 8.12 12 12"/><path d="M20 4 8.12 15.88"/><path d="M14.8 14.8 20 20"/>',
  // Real markup match found in static/style-section-size.js's STEP_DOWN_ICON, which is actually
  // Lucide's "a-arrow-down" icon, not "chevrons-up-down" as the design brief mislabeled it —
  // path data verified byte-accurate, key renamed here to the real Lucide name per this file's
  // own "kebab-case Lucide icon name" convention.
  "a-arrow-down": '<path d="m14 12 4 4 4-4"/><path d="M18 16V7"/><path d="m2 16 4.039-9.69a.5.5 0 0 1 .923 0L11 16"/><path d="M3.304 13h6.392"/>',
  italic: '<line x1="19" x2="10" y1="4" y2="4"/><line x1="14" x2="5" y1="20" y2="20"/><line x1="15" x2="9" y1="4" y2="20"/>',
};

// Wrapper attributes shared by every icon already inlined across this codebase's markup
// (play/pause/restart/step/bold/italic/underline etc.) — see CLAUDE.md's icon convention.
// Note: play/pause/step-back/step-forward use fill="currentColor" shapes rather than stroked
// paths in the current markup; their per-shape fill="currentColor" attribute overrides the
// wrapper's fill="none" so the shapes render solid, matching current behavior.
globalObj.UI.icon = function icon(name, { size = 24 } = {}) {
  const inner = ICON_PATHS[name];
  if (!inner) {
    throw new Error(`UI.icon: unknown icon "${name}"`);
  }
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
};

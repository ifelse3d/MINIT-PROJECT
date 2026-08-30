"use client";

// ---------------------------------------------------------------------------
// WHERE A POPUP PORTALS TO (C-1, work order 51).
//
// Two constraints, learned one bug at a time:
//   * NOT inside the glass top bar (or anything with filter/transform/
//     backdrop-filter): those become the containing block for fixed
//     descendants, and "fixed inset-0" turns into "the 56px bar" — the
//     cut-off-modal bug of work order 46. So the portal must ESCAPE the
//     caller's ancestors.
//   * NOT outside `.v2-root` either: every design token (--v2-card-raised,
//     --v2-border, --v2-shadow-lg…) is defined ON .v2-root — a popup
//     portalled to <body> resolves them all to nothing and renders as a
//     bare transparent rectangle (the tester's "裸样式" secondary-calendars
//     and income-purpose-templates dialogs, work order 51 C-1).
//
// .v2-root itself has no filter/transform (only position: relative), so a
// fixed-position child of it still measures against the viewport — both
// constraints hold. Bare routes (/login, legal) have no .v2-root and fall
// back to <body>, where the shared popups are not used.
// ---------------------------------------------------------------------------

export function portalTarget(): HTMLElement {
  return (document.querySelector(".v2-root") as HTMLElement | null) ?? document.body;
}

/**
 * Render-safe variant for Radix `container` props (② work order 89 — the
 * calendar day Sheet was the THIRD portal found escaping to <body>, serif
 * fonts and all; Tooltip and HoverCard were the same family). Radix portals
 * default to document.body, so every shadcn portal passes this instead.
 * `undefined` during SSR keeps the default until the client renders — the
 * portalled content only ever mounts on interaction, after hydration.
 */
export function portalContainer(): HTMLElement | undefined {
  return typeof document === "undefined" ? undefined : portalTarget();
}

// ---------------------------------------------------------------------------
// MULTI-PAGE STAGING — the one rule, shared (D0-1, work order 56).
//
// Several files staged together are read as PAGES OF ONE DOCUMENT. That only
// makes sense for photographs: a PDF or an Office file is already a whole
// multi-page container, so "several at once" is one-per-send for those. This
// is OUR design, not a platform limit (拍板 3) — say so when explaining it.
//
// The home page's AskBox (A-5) and the Constitution page both enforce it;
// the rule lives here so the next door does not grow a third copy.
// ---------------------------------------------------------------------------

export function isPhotoType(mimeType: string): boolean {
  return mimeType.startsWith("image/");
}

/**
 * May these files be staged TOGETHER? One file of any kind is always fine;
 * several are fine only when every one of them is a photo.
 */
export function canStageTogether(mimeTypes: string[]): boolean {
  return mimeTypes.length <= 1 || mimeTypes.every(isPhotoType);
}

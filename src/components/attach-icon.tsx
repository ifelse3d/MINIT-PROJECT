import { Paperclip } from "lucide-react";

// ---------------------------------------------------------------------------
// THE icon for "choose a file / upload", everywhere (J, 2026-08-28:
// 「所有選檔案還是上傳的都用這個回形針的LOGO」).
//
// Before this the app used three different things for the same job: a 📷
// emoji on most pickers, a 📎 emoji on the calendar one, and a lucide Camera
// glyph in the chat box. The emoji are also drawn by the operating system, so
// the same button looked different on Windows, Android and iOS — the reason
// the home cards lost theirs on the same day.
//
// 🔴 A paperclip even where the label says "take a photo". On a phone the
// single control opens the camera, the album and the file browser together, so
// the button's real job is "attach something" — and one mark for one job beats
// a mark that is only right on one of the three paths.
//
// NOT for: a badge saying where data came from, a "view the original photo"
// button, or the walkthrough's step illustrations. Those are not attaching
// anything.
// ---------------------------------------------------------------------------

export function AttachIcon({ className = "h-5 w-5" }: { className?: string }) {
  return <Paperclip className={className} strokeWidth={2} aria-hidden />;
}

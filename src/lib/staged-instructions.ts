// ---------------------------------------------------------------------------
// WHAT THE PERSON JUST SAID ABOUT THE PAPERS THEY ATTACHED (work order 105
// §1-3). Pure logic, no I/O, no model call, unit tested.
//
// THE COMPLAINT THIS EXISTS FOR. J attached two photos of one meeting and
// typed, in the chat box:
//
//     「這兩張是一樣的，只是有另外放出來講解。更詳細的」
//
// Report 103 §7 recorded what happened: the paperclip only STAGED the files,
// so the sentence reached the extractor as a spelling hint and nothing else.
// The two papers were read as page 1 and page 2, the agenda came out twice,
// and asking again in words changed nothing — the app answered questions
// about files it was holding by explaining where the upload box is.
//
// 🔴 WHY A WORD LIST AND NOT A MODEL. This runs on every keystroke's worth of
// typed context, before anything is charged, and it decides how two documents
// are MERGED. A model call here would cost an action to answer a question the
// person already answered in plain words, and would put a vendor between
// somebody's sentence and their own files. The vocabulary below is small,
// explicit and testable; when it does not recognise a sentence it says so
// (`none`) and the app behaves exactly as it did before — the tick-box on the
// upload strip (104 §10) is still there, and still wins where it was used.
//
// 🔴 IT NEVER GUESSES "versions". Reading two PAGES as two VERSIONS deletes a
// decision nobody can get back, so a sentence has to say BOTH that the papers
// are the same thing AND (or) that one is fuller. "Two pages", "page 2",
// "muka surat 2", "第二页" push the other way and win outright.
// ---------------------------------------------------------------------------

export type StagedInstruction =
  /** "these are the same thing, use the fuller one" — merge as versions. */
  | { kind: "versions" }
  /** "this is page 2" — the ordinary concatenation, said out loud. */
  | { kind: "pages" }
  /** Nothing about how these papers relate. */
  | { kind: "none" };

/** Said the papers are two tellings of ONE thing. */
const SAME_THING = [
  // Chinese
  "一样", "一樣", "同一", "同样", "同樣", "重复", "重複", "两个版本", "兩個版本",
  "版本", "同一份", "同一场", "同一場", "相同",
  // Malay
  "sama sahaja", "sama saja", "yang sama", "dokumen sama", "versi",
  "perkara yang sama", "benda yang sama",
  // English
  "the same", "same thing", "same document", "same meeting", "duplicate",
  "two versions", "another version", "both are the same",
];

/** Said one of them carries MORE — the fuller telling is the document. */
const FULLER = [
  "更详细", "更詳細", "比较详细", "比較詳細", "详细的那", "詳細的那",
  "最详细", "最詳細", "多一点", "多一點", "完整", "详细一点", "詳細一點",
  "lebih terperinci", "lebih lengkap", "paling lengkap", "yang penuh",
  "more detailed", "the detailed one", "fuller", "more complete", "longer one",
];

/** Said these really are separate pages — this beats everything above. */
const PAGES = [
  "两页", "兩頁", "第二页", "第二頁", "第一页", "第一頁", "两张不同", "兩張不同",
  "不同页", "不同頁", "下一页", "下一頁", "接下来那页", "接下來那頁",
  "muka surat", "halaman kedua", "halaman 2", "muka surat 2", "sambungan",
  "page 2", "page two", "second page", "next page", "two pages", "different pages",
];

function hasAny(text: string, needles: readonly string[]): boolean {
  return needles.some((n) => text.includes(n));
}

/**
 * Read one typed sentence. `none` whenever it is not clearly about how the
 * attached papers relate to each other — silence is always safe here, because
 * `none` means "carry on exactly as before".
 */
export function readStagedInstruction(raw: string): StagedInstruction {
  const text = raw.toLowerCase().trim();
  if (text === "") return { kind: "none" };
  // Explicitly pages: never reinterpreted, whatever else the sentence says.
  if (hasAny(text, PAGES)) return { kind: "pages" };
  const same = hasAny(text, SAME_THING);
  const fuller = hasAny(text, FULLER);
  // Either half is enough on its own: "這兩張是一樣的" says it, and "用比較
  // 詳細的那份" says it. What is NOT enough is neither.
  if (same || fuller) return { kind: "versions" };
  return { kind: "none" };
}

/** Did the person's sentence ask for something to be redone? Used only to
 *  decide whether an ALREADY-DELIVERED reading is re-merged and handed back
 *  as a new card — which costs nothing, because nothing is re-read. */
export function asksToRedo(raw: string): boolean {
  return readStagedInstruction(raw).kind === "versions";
}

// ---------------------------------------------------------------------------
// 拍板 0-3 (J, 2026-08-27, work order 32 · D22): the ONE form convention.
// Required field = red asterisk after the label. Optional field = NOTHING —
// no "(pilihan)", no "（可选）", no "(optional)" tails anywhere. A tail like
// "（可不附）" reads as a nudge ("you probably should"), which is exactly the
// steering J objected to on the transfer-screenshot button.
// ---------------------------------------------------------------------------

/** The red asterisk marking a required field (aria-hidden: the form's own
 *  validation speaks when the field is missing, in words, in place). */
export function Req() {
  return (
    <span aria-hidden className="ml-0.5 text-red-600 dark:text-red-400">
      *
    </span>
  );
}

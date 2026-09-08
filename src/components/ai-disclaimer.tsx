// ---------------------------------------------------------------------------
// The standing "AI can be wrong" line (work order 100 §0-5, J's 拍板 —
// Anthropic-style, under every AI input box).
//
// ALL THREE LANGUAGES AT ONCE, deliberately not <Tri>: this is a safety
// notice, and the person reading over the treasurer's shoulder may not share
// the treasurer's interface language. One quiet line, never hidden.
// ---------------------------------------------------------------------------

export function AiMistakesNote({ className = "" }: { className?: string }) {
  return (
    <p
      // §1 (109): leading-snug, not -relaxed — on the chat screen every line
      // of this is a line of conversation somebody does not get to see.
      // 130 §8: on a phone it is TWO lines by construction (a break after the
      // BM/中文 pair, not wherever a 375px column happens to wrap a 12px
      // string into three), at 13px so it stays readable; from `sm` up it is
      // the one quiet line it always was.
      className={`text-center text-[13px] leading-snug text-[color:var(--v2-text-soft)] sm:text-xs ${className}`}
    >
      <span className="block sm:inline">MinitAI boleh silap — sila semak. · AI 会犯错，请核对。</span>
      <span className="hidden sm:inline"> · </span>
      <span className="block sm:inline">AI can make mistakes — please check.</span>
    </p>
  );
}

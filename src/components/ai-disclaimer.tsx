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
      className={`text-center text-xs leading-relaxed text-[color:var(--v2-text-soft)] ${className}`}
    >
      MinitAI boleh silap — sila semak. · AI 会犯错，请核对。 · AI can make
      mistakes — please check.
    </p>
  );
}

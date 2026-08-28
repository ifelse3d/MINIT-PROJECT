// ---------------------------------------------------------------------------
// The brand mark: J's own artwork, rendered as an image.
//
// 🔴 IT IS NOT A DRAWING WE MAINTAIN. There was once an inline-SVG "redraw" of
// the logo here, kept because a vector stays sharp at the 28px collapsed rail.
// It was thinner and more saturated than the real mark, so the app and the
// browser tab showed two different logos — and when that was noticed on
// 2026-08-28 the first fix went the wrong way and regenerated the tab FROM the
// redraw. J caught it at once: 「MinitAI 的 LOGO 應該是這個，爲什麼你換了呢」.
//
// So: one mark, and it is the artwork. scripts/assets/minit-logo.png is the
// source, `npm run icons` renders every size from it, and this component just
// shows one. Sharpness is handled by serving the 192px file into a 28–64px
// box rather than by redrawing it: that covers the largest use (the 64px
// sign-in tile) on a 3x screen. It is deliberately the PWA icon — the same
// picture at the same size, and a second copy under another name would just be
// 67KB of identical bytes.
//
// aria-hidden with an empty alt: every place this appears, the word "MinitAI"
// is already next to it in real text, so announcing the mark as well would
// just say the name twice.
// ---------------------------------------------------------------------------

export function BrandLogo({
  size = 36,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    // A fixed-size icon from /public. next/image would add an optimiser round
    // trip (and Vercel quota) for a file that is already exactly the bytes we
    // want to serve, at exactly the size we serve it.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/icon-192.png"
      alt=""
      aria-hidden
      width={size}
      height={size}
      className={className}
      draggable={false}
    />
  );
}

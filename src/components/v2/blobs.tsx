"use client";

// ---------------------------------------------------------------------------
// Soft floating colour washes that sit over the lilac→mint gradient field
// ("Minit Glass"). Three slow-drifting radial blobs — purple, mint, blue —
// add depth behind the frosted glass without competing with content.
// ---------------------------------------------------------------------------

export function GradientBlobs() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      {/* Purple — top left */}
      <div
        className="v2-blob v2-blob-anim"
        style={{
          top: "-14%",
          left: "-8%",
          width: "40vw",
          height: "40vw",
          background:
            "radial-gradient(circle at 35% 35%, rgba(150,132,246,0.42), transparent 68%)",
        }}
      />
      {/* Mint — bottom right */}
      <div
        className="v2-blob v2-blob-anim"
        style={{
          bottom: "-16%",
          right: "-10%",
          width: "42vw",
          height: "42vw",
          background:
            "radial-gradient(circle at 60% 55%, rgba(103,206,164,0.40), transparent 68%)",
          animationDelay: "-7s",
        }}
      />
      {/* Blue — centre right */}
      <div
        className="v2-blob v2-blob-anim"
        style={{
          top: "30%",
          right: "18%",
          width: "26vw",
          height: "26vw",
          background:
            "radial-gradient(circle at 50% 50%, rgba(120,170,246,0.28), transparent 70%)",
          animationDelay: "-11s",
        }}
      />
      {/* Faint wash keeps text legible over the brightest blobs */}
      <div className="absolute inset-0 bg-gradient-to-b from-white/25 via-transparent to-white/20 dark:from-black/40 dark:to-black/50" />
    </div>
  );
}

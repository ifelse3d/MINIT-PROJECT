// ---------------------------------------------------------------------------
// A-1 (work order 31): the shared route-loading skeleton.
//
// J, 8/27: 「換頁慢」. Every page in this app is force-dynamic (per-user,
// per-org), so each navigation waits on the server — and with ZERO
// loading.tsx files in the tree, the click did nothing visible until the new
// page arrived. On a slow connection that reads as "the app is broken".
//
// Next.js streams a segment's loading.tsx INSTANTLY on navigation, then swaps
// in the page when it resolves. One shared skeleton, re-exported by a
// one-line loading.tsx in each big route segment, so every section responds
// to the tap immediately and looks the same doing it.
//
// Deliberately generic — a heading bar and three card blocks. A skeleton that
// mimics one page's exact layout drifts the moment the page changes; the job
// here is "something is happening", not a preview.
// ---------------------------------------------------------------------------

export function RouteLoading() {
  return (
    <div
      className="mx-auto flex w-full max-w-5xl animate-pulse flex-col gap-4 pb-12"
      // The words are in the four UI languages' shared ground: none. A
      // skeleton has no text — screen readers get the state instead.
      role="status"
      aria-label="Loading…"
    >
      <div className="h-9 w-56 rounded-xl bg-[color:var(--v2-primary-soft)]" />
      <div className="h-4 w-80 max-w-full rounded-lg bg-[color:var(--v2-primary-soft)] opacity-70" />
      <div className="v2-glass mt-2 h-40 rounded-3xl opacity-60" />
      <div className="v2-glass h-40 rounded-3xl opacity-40" />
      <div className="v2-glass h-40 rounded-3xl opacity-25" />
    </div>
  );
}

export default RouteLoading;

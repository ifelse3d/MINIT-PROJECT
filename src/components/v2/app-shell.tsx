"use client";

// ---------------------------------------------------------------------------
// APP SHELL — decides how much chrome a route gets.
//
// Signed-in routes get the full shell: floating sidebar, search bar, org chip,
// theme toggle, AI launcher. /login gets a BARE shell instead — no nav to a
// page you cannot reach yet, no search over records you cannot see, no theme
// toggle. Only the language switcher stays, because the sign-in form itself is
// bilingual and the visitor must be able to read it.
//
// This is a client component purely so it can read the pathname; the layout
// (server) still does the org/usage fetching and passes the results down.
// ---------------------------------------------------------------------------

import { usePathname } from "next/navigation";
import { LanguageSwitcher } from "@/components/language-provider";
import { GradientBlobs } from "./blobs";
import { Sidebar } from "./sidebar";
import { TopSearch } from "./top-search";
import { MobileTopBar } from "./mobile-nav";
import { AIDock, useAIDock } from "./ai-dock";

/** Routes rendered without nav/search/theme chrome. */
const BARE_ROUTES = ["/login"];

function isBareRoute(pathname: string | null): boolean {
  if (!pathname) return false;
  return BARE_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );
}

export function AppShell({
  children,
  showAiLauncher,
  aiRemaining,
  aiUsedPct,
  aiBlocked,
}: {
  children: React.ReactNode;
  showAiLauncher: boolean;
  aiRemaining: number | null;
  /** Share of the monthly free quota already spent, 0–100. null = unknown. */
  aiUsedPct: number | null;
  aiBlocked: boolean;
}) {
  const pathname = usePathname();
  // Hooks must run on every render, including the bare /login branch below.
  const dock = useAIDock();

  if (isBareRoute(pathname)) {
    return (
      // Bare shell = /login: a dark, full-bleed screen. The switcher floats
      // absolutely (z-20, above the page's own fixed backdrop) so the sign-in
      // column can centre itself in the viewport instead of being pushed down.
      <div className="v2-root v2-safe relative min-h-screen">
        <div className="absolute right-4 top-4 z-20 sm:right-8 sm:top-7">
          <div className="flex items-center gap-1 rounded-full border border-white/[0.16] bg-white/[0.05] p-[5px] shadow-[inset_0_1px_0_rgba(255,255,255,0.18)] backdrop-blur-md backdrop-saturate-150">
            <LanguageSwitcher tone="dark" />
          </div>
        </div>
        <main className="relative z-10">{children}</main>
      </div>
    );
  }

  return (
    <div className="v2-root v2-safe min-h-screen">
      <GradientBlobs />
      {/* The docked assistant is NOT an overlay: it takes real width off the
          right, and this padding hands that width over so no card ends up
          hidden behind it. `push` is 0 on phones (the sheet floats) and 0 when
          the rail is collapsed, so the page is untouched the rest of the time.
          The transition is dropped mid-drag — animating every pointermove makes
          the resize feel like it is lagging behind the handle. */}
      <div
        className={
          dock.dragging ? "" : "transition-[padding] duration-300 ease-out"
        }
        style={{ paddingRight: dock.push || undefined }}
      >
        <div className="mx-auto flex w-full max-w-[1600px] gap-6 px-4 py-6 sm:px-6">
          {/* Floating sidebar — tablet & desktop */}
          <Sidebar />

          {/* Center column */}
          <main className="min-w-0 flex-1">
            {/* Phone-only top bar with menu; search bar for tablet & up */}
            <MobileTopBar />
            <div className="hidden md:block">
              <TopSearch />
            </div>
            <div className="mt-4 md:mt-6">{children}</div>
          </main>
        </div>
      </div>

      {/* Minit AI: a docked, resizable rail on tablet/desktop that leaves the
          page usable, and a bottom sheet on phones. */}
      {showAiLauncher && (
        <AIDock
          dock={dock}
          initialRemaining={aiRemaining}
          initialUsedPct={aiUsedPct}
          blocked={aiBlocked}
        />
      )}
    </div>
  );
}

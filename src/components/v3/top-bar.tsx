"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Menu, Search } from "lucide-react";
import { LanguageSwitcher, Tri, useTriText } from "@/components/language-provider";
import { useEinvoisOperator } from "@/lib/einvois-pref";
import { IconTip } from "@/components/ui/tooltip";
import { BRAND_NAME } from "@/lib/brand";
import { isChatScreenRoute } from "@/lib/chat-screen";
import { NAV_ITEMS, SETTINGS_NAV, type NavItem } from "@/components/nav-items";
import { ThemeToggle } from "./top-search";
import { ProfileMenu } from "./profile-menu";
import { CommandPalette } from "./command-palette";

// ---------------------------------------------------------------------------
// The sticky top bar (violet redesign §5) — one bar for every width:
//
//   [☰ <1024] [page title]   [ 🔍 compact search  / ]   [BM 中文 EN] [☾] [(av)]
//
// - Sticky at z-40, glass background — the ONE contained return of
//   backdrop-filter (§5.2); the full-page glassmorphism stays dead.
// - The search is small and centred (client: "small small and fixed at top
//   bar"), absolute-positioned so its focus growth overlays instead of
//   pushing the right-side controls. `/` focuses it; below lg it collapses
//   to an icon that opens the command palette; Ctrl/Cmd+K opens the palette
//   at any width.
// - The right side ends in the profile AVATAR (§5.2) — the gear is gone.
// ---------------------------------------------------------------------------

/** The three words for the current page — longest matching nav href wins. */
function pageWords(
  pathname: string,
  einvoisOperator: boolean,
): { bm: string; zh: string; en: string } {
  if (pathname === "/") return { bm: "Utama", zh: "主页", en: "Home" };
  if (pathname === "/more") return { bm: "Lagi", zh: "更多", en: "More" };
  if (pathname.startsWith("/admin"))
    return { bm: "Konsol operasi", zh: "管理台", en: "Ops console" };
  if (pathname.startsWith("/search"))
    return { bm: "Carian", zh: "搜索", en: "Search" };
  const all: NavItem[] = [...NAV_ITEMS, ...SETTINGS_NAV.filter((s) => !NAV_ITEMS.includes(s))];
  const match = all
    // D49: a non-operator landing on a gated e-Invois URL gets the 404
    // screen — the top bar must not caption that screen with the hidden
    // page's name (the label would be the one thing the gate leaked).
    .filter((i) => !(i.beta && !einvoisOperator))
    .filter((i) => pathname === i.href || pathname.startsWith(`${i.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0];
  return match
    ? { bm: match.bm, zh: match.zh, en: match.en }
    : { bm: BRAND_NAME, zh: BRAND_NAME, en: BRAND_NAME };
}

export function TopBar({
  pathname,
  onOpenDrawer,
}: {
  pathname: string;
  onOpenDrawer: () => void;
}) {
  const t = useTriText();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [paletteOpen, setPaletteOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const einvoisOperator = useEinvoisOperator();
  const words = pageWords(pathname, einvoisOperator);

  // `/` focuses the search (or opens the palette when the input is hidden);
  // Ctrl/Cmd+K opens the palette at any width (§5.5).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable);
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen(true);
        return;
      }
      if (e.key === "/" && !typing) {
        e.preventDefault();
        const input = inputRef.current;
        if (input && input.offsetParent !== null) input.focus();
        else setPaletteOpen(true);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <header
      className="sticky top-0 z-40 border-b border-[color:var(--v2-border)]"
      style={{
        background: "var(--v2-glass)",
        backdropFilter: "var(--v2-glass-blur)",
        WebkitBackdropFilter: "var(--v2-glass-blur)",
      }}
    >
      <div className="relative flex h-14 items-center gap-2 px-4 sm:px-5">
        {/* Left: hamburger (<lg) + the page's name. */}
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <IconTip label={t("Menu", "菜单", "Menu")} side="bottom">
            <button
              type="button"
              onClick={onOpenDrawer}
              aria-label={t("Buka menu", "打开菜单", "Open the menu")}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm text-[color:var(--v2-text)] hover:bg-[color:var(--v2-card-nested)] lg:hidden"
            >
              <Menu className="h-5 w-5" strokeWidth={1.8} />
            </button>
          </IconTip>
          <h1 className="shrink-0 truncate text-[15px] font-semibold">
            <Tri bm={words.bm} zh={words.zh} en={words.en} />
          </h1>
          {/* §1 (work order 109), J: 「上面太空了…我圈起來紅色的可以放到上面
              HOME 旁邊去」. The home page used to open with a 3xl "MinitAI"
              and its tagline sitting on top of the conversation — a third of
              the screen spent saying the name of the app the person is
              already inside. The name moves HERE, beside the page's own name,
              where a product name belongs. The tagline follows it but only
              where there is room: below lg the centred search is gone but the
              phone's own controls are not, and a wrapped strapline in the top
              bar would be the same waste in a smaller font. */}
          {isChatScreenRoute(pathname) && (
            <p className="hidden min-w-0 items-baseline gap-2 sm:flex">
              <span aria-hidden className="text-[color:var(--v2-text-soft)]">
                ·
              </span>
              <span className="shrink-0 text-[15px] font-semibold text-[color:var(--v2-primary)]">
                {BRAND_NAME}
              </span>
              <span className="hidden truncate text-sm text-[color:var(--v2-text-soft)] xl:inline">
                <Tri
                  bm="Dokumen persatuan, tanpa borang."
                  zh="社团文件，不用填表。"
                  en="Society paperwork, without forms."
                />
              </span>
            </p>
          )}
        </div>

        {/* Centre: the compact search — absolute, so focus growth overlays
            (§5.2) instead of nudging the avatar. lg+ only. */}
        <form
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            if (q.trim()) router.push(`/search?q=${encodeURIComponent(q.trim())}`);
          }}
          className="absolute left-1/2 hidden -translate-x-1/2 lg:block"
        >
          <div className="relative">
            <Search
              aria-hidden
              className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--v2-text-soft)]"
              strokeWidth={1.8}
            />
            {/* #4 (J review 27-evening): the "/" kbd hint is gone — nobody in
                the audience knows what it means. The shortcut itself still
                works for those who do. */}
            <input
              ref={inputRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t("Cari…", "搜索…", "Search…")}
              className="h-[34px] w-80 rounded-sm border border-[color:var(--v2-border-strong)] bg-[color:var(--v2-card)] pl-8 pr-3 text-sm outline-none transition-[width] duration-150 focus:w-[420px] focus:border-[color:var(--v2-primary)] focus:ring-[3px] focus:ring-[color:var(--v2-primary-ring)]"
            />
          </div>
        </form>

        {/* Right: search icon (<lg) · language · theme · avatar. */}
        <div className="flex shrink-0 items-center gap-2">
          <IconTip label={t("Cari", "搜索", "Search")} side="bottom">
            <button
              type="button"
              onClick={() => setPaletteOpen(true)}
              aria-label={t("Cari", "搜索", "Search")}
              className="flex h-9 w-9 items-center justify-center rounded-sm text-[color:var(--v2-text)] hover:bg-[color:var(--v2-card-nested)] lg:hidden"
            >
              <Search className="h-5 w-5" strokeWidth={1.8} />
            </button>
          </IconTip>
          <div className="hidden sm:block">
            <LanguageSwitcher />
          </div>
          <ThemeToggle />
          <ProfileMenu />
        </div>
      </div>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </header>
  );
}

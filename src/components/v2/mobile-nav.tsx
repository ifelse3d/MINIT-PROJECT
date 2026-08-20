"use client";

// ---------------------------------------------------------------------------
// Responsive navigation for phones/tablets, where the floating sidebar and
// right AI panel are hidden. A glass top bar with a menu (every route from
// nav-items.ts plus Orgs/Settings/Sign out, big tap targets, trilingual) and
// a floating button to open the AI assistant.
// ---------------------------------------------------------------------------

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, Menu, Sparkles, X } from "lucide-react";
import { LanguageSwitcher, Tri } from "@/components/language-provider";
import { ACCOUNT_NAV, isActivePath, sidebarPages } from "@/components/nav-items";
import { OrgChip, useAuthEmail, signOutToLogin } from "./org-chip";
import { SearchForm, ThemeToggle } from "./top-search";
import { cn } from "./glass";
import { AnimatePresence, motion } from "framer-motion";

/** Glass top bar + slide-down menu. Shown below md (sidebar hidden). */
export function MobileTopBar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const email = useAuthEmail();

  return (
    <div className="mb-4 md:hidden">
      <div className="v2-glass flex items-center justify-between rounded-3xl px-4 py-3">
        <Link href="/" className="flex items-center gap-2.5" onClick={() => setOpen(false)}>
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-[#5b4bd6] to-[#6f5ef2] text-white">
            <Sparkles className="h-4 w-4" strokeWidth={1.9} />
          </span>
          <span className="text-lg font-semibold tracking-tight">Minit</span>
        </Link>
        <div className="flex items-center gap-2">
          <div className="v2-glass rounded-full px-2 py-1">
            <LanguageSwitcher />
          </div>
          <button
            type="button"
            aria-label="Menu"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            className="v2-pill flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-[#5b4bd6] to-[#6f5ef2] text-white"
          >
            {open ? <X className="h-6 w-6" strokeWidth={2} /> : <Menu className="h-6 w-6" strokeWidth={2} />}
          </button>
        </div>
      </div>

      {/* Search on the phone. This used to live only inside `hidden md:block`,
          so the phone — the device our users actually hold — had no way to
          search records, and /search told them to "type in the search bar
          above" pointing at a bar that did not exist. (2026-07-28 audit.) */}
      <div className="mt-2">
        <SearchForm />
      </div>

      <AnimatePresence>
        {open && (
          <motion.nav
            initial={{ opacity: 0, height: 0, y: -8 }}
            animate={{ opacity: 1, height: "auto", y: 0 }}
            exit={{ opacity: 0, height: 0, y: -8 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="v2-glass mt-2 rounded-3xl p-3">
              {/* The pages you work in — same set as the desktop sidebar, but
                  flat: a phone drawer has room, and headings only add text. */}
              <div className="grid grid-cols-2 gap-2">
                {sidebarPages().map((item) => {
                  const active = isActivePath(pathname, item.href);
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setOpen(false)}
                      className={cn(
                        "flex items-center gap-3 rounded-2xl px-4 py-3.5 text-base font-medium transition-colors",
                        active
                          ? "bg-gradient-to-r from-[#5b4bd6]/90 to-[#6f5ef2]/90 text-white"
                          : "text-[color:var(--v2-text)] hover:bg-white/50 dark:hover:bg-white/10"
                      )}
                    >
                      <Icon className="h-5 w-5 shrink-0" strokeWidth={1.7} />
                      <Tri bm={item.bm} zh={item.zh} en={item.en} />
                    </Link>
                  );
                })}
              </div>
              {/* Account: history, organisations, settings */}
              <div className="mt-2 grid grid-cols-2 gap-2 border-t border-white/40 pt-3 dark:border-white/10">
                {ACCOUNT_NAV.map((item) => {
                  const active = isActivePath(pathname, item.href);
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setOpen(false)}
                      className={cn(
                        "flex items-center gap-3 rounded-2xl px-4 py-3.5 text-base font-medium transition-colors",
                        active
                          ? "bg-gradient-to-r from-[#5b4bd6]/90 to-[#6f5ef2]/90 text-white"
                          : "text-[color:var(--v2-text)] hover:bg-white/50 dark:hover:bg-white/10"
                      )}
                    >
                      <Icon className="h-5 w-5 shrink-0" strokeWidth={1.7} />
                      <Tri bm={item.bm} zh={item.zh} en={item.en} />
                    </Link>
                  );
                })}
              </div>
              {/* Theme toggle had no mobile equivalent at all before. */}
              <div className="mt-2 flex items-center gap-3 border-t border-white/40 pt-3 dark:border-white/10">
                <ThemeToggle />
                <span className="text-base text-[color:var(--v2-text-soft)]">
                  <Tri bm="Warna terang / gelap" zh="浅色／深色" en="Light / dark" />
                </span>
              </div>
              {email && (
                <div className="mt-2 flex items-center justify-between gap-2 border-t border-white/40 pt-3 dark:border-white/10">
                  <OrgChip />
                  <button
                    type="button"
                    onClick={signOutToLogin}
                    className="flex min-h-11 items-center gap-2 rounded-2xl px-4 py-2.5 text-base font-medium text-[color:var(--v2-text-soft)] hover:bg-white/50 dark:hover:bg-white/10"
                  >
                    <LogOut className="h-5 w-5 shrink-0" strokeWidth={1.7} />
                    <Tri bm="Keluar" zh="退出" en="Sign out" />
                  </button>
                </div>
              )}
            </div>
          </motion.nav>
        )}
      </AnimatePresence>
    </div>
  );
}

// The AI launcher used to live here as a modal drawer. It is now a docked,
// resizable rail that does not cover or dim the page — see ./ai-dock.tsx.

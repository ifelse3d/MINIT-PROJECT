"use client";

// ---------------------------------------------------------------------------
// /more — the phone's fourth tab. B-2 (work order 27, J 8/26 #3): no longer a
// flat junk-drawer list — it renders the SAME grouped layout as the desktop
// sidebar (SIDEBAR_NAV, one visibleGroupChildren source), so the two surfaces
// cannot disagree about what exists or where it lives. The bottom bar itself
// stays four tabs, untouched.
// ---------------------------------------------------------------------------

import Link from "next/link";
import { useState } from "react";
import { LogOut, Settings as SettingsIcon } from "lucide-react";
import { LanguageSwitcher, Tri } from "@/components/language-provider";
import { SIDEBAR_NAV, visibleGroupChildren } from "@/components/nav-items";
import { useActiveOrg } from "@/components/v3/org-chip";
import { SignOutConfirm } from "@/components/sign-out-confirm";
import { useEinvoisVisible } from "@/lib/einvois-pref";

export default function MorePage() {
  const [einvoisVisible] = useEinvoisVisible();
  const { email, org } = useActiveOrg();
  // B-1 (work order 32): sign-out asks first — it clears local data.
  const [confirmSignOut, setConfirmSignOut] = useState(false);

  // Every sidebar entry; Home is the bottom bar's own first tab, so that one
  // item is skipped here. Other top-level items (C-1: the calendar) render as
  // single rows so they cannot silently drop off the phone.
  const entries = SIDEBAR_NAV.filter(
    (e) => !(e.kind === "item" && e.item.href === "/"),
  );

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 pb-6">
      <h1 className="text-2xl font-semibold tracking-tight">
        <Tri bm="Lagi" zh="更多" en="More" />
      </h1>

      {org && (
        // A-5 (work order 31): same wording and tap-through as the sidebar's
        // org card — "当前机构：J · 切换 →", a link, not a dead label.
        <p className="text-base text-[color:var(--v2-text-soft)]">
          <Link href="/orgs" className="hover:underline">
            <Tri bm="Pertubuhan semasa" zh="当前机构" en="Current organisation" />
            {": "}
            <span className="font-semibold text-[color:var(--v2-text)]">{org.name}</span>
            {" · "}
            <Tri bm="Tukar" zh="切换" en="Switch" /> →
          </Link>
        </p>
      )}

      {entries.map((group) => {
        if (group.kind !== "group") {
          const Icon = group.item.icon;
          return (
            <ul
              key={group.item.href}
              className="v2-glass flex flex-col overflow-hidden p-0"
            >
              <li>
                <Link
                  href={group.item.href}
                  className="flex min-h-14 items-center gap-3 px-4 text-base font-medium transition-colors hover:bg-[color:var(--v2-primary-soft)]"
                >
                  <Icon
                    className="h-5 w-5 shrink-0 text-[color:var(--v2-primary)]"
                    strokeWidth={1.8}
                  />
                  <Tri bm={group.item.bm} zh={group.item.zh} en={group.item.en} />
                </Link>
              </li>
            </ul>
          );
        }
        const items = visibleGroupChildren(group, einvoisVisible);
        if (items.length === 0) return null;
        const GroupIcon = group.icon;
        return (
          <section key={group.id} className="flex flex-col gap-2">
            <h2 className="flex items-center gap-2 px-1 text-sm font-semibold uppercase tracking-wide text-[color:var(--v2-text-soft)]">
              <GroupIcon className="h-4 w-4 shrink-0" strokeWidth={1.8} />
              <Tri bm={group.bm} zh={group.zh} en={group.en} />
            </h2>
            <ul className="v2-glass flex flex-col divide-y divide-[color:var(--v2-border)] overflow-hidden p-0">
              {items.map((item) => {
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className="flex min-h-14 items-center gap-3 px-4 text-base font-medium transition-colors hover:bg-[color:var(--v2-primary-soft)]"
                    >
                      <Icon className="h-5 w-5 shrink-0 text-[color:var(--v2-primary)]" strokeWidth={1.8} />
                      <Tri bm={item.bm} zh={item.zh} en={item.en} />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}

      {/* §7.2: settings became a sub-sectioned family — one door from here;
          the tab strip on the settings pages does the rest on a phone. */}
      <section className="flex flex-col gap-2">
        <h2 className="flex items-center gap-2 px-1 text-sm font-semibold uppercase tracking-wide text-[color:var(--v2-text-soft)]">
          <SettingsIcon className="h-4 w-4 shrink-0" strokeWidth={1.8} />
          <Tri bm="Tetapan" zh="设置" en="Settings" />
        </h2>
        <ul className="v2-glass flex flex-col overflow-hidden p-0">
          <li>
            <Link
              href="/settings"
              className="flex min-h-14 items-center gap-3 px-4 text-base font-medium transition-colors hover:bg-[color:var(--v2-primary-soft)]"
            >
              <SettingsIcon className="h-5 w-5 shrink-0 text-[color:var(--v2-primary)]" strokeWidth={1.8} />
              <Tri bm="Buka tetapan" zh="打开设置" en="Open settings" />
            </Link>
          </li>
        </ul>
      </section>

      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <LanguageSwitcher />
          {/* A-4 (work order 31): the side-by-side view exists but only the
              settings page said so — say it where the languages are picked. */}
          <p className="text-xs text-[color:var(--v2-text-soft)]">
            <Link href="/settings" className="underline underline-offset-4">
              <Tri
                bm="Mahu ketiga-tiga bahasa serentak? Buka di Tetapan →"
                zh="想三种语言并排显示？到「设置」打开 →"
                en="Want all three languages at once? Turn it on in Settings →"
              />
            </Link>
          </p>
        </div>
        {email && (
          <button
            type="button"
            onClick={() => setConfirmSignOut(true)}
            className="flex items-center gap-2 rounded-md border border-[color:var(--v2-outline-border)] px-4 py-2 text-base font-medium text-[color:var(--v2-text-soft)] transition-colors hover:bg-[color:var(--v2-primary-soft)]"
          >
            <LogOut className="h-4 w-4" strokeWidth={1.8} />
            <Tri bm="Keluar" zh="退出" en="Sign out" />
          </button>
        )}
      </div>
      <SignOutConfirm open={confirmSignOut} onClose={() => setConfirmSignOut(false)} />
    </div>
  );
}

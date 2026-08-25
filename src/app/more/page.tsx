"use client";

// ---------------------------------------------------------------------------
// /more — the phone's fourth tab. B-2 (work order 27, J 8/26 #3): no longer a
// flat junk-drawer list — it renders the SAME grouped layout as the desktop
// sidebar (SIDEBAR_NAV, one visibleGroupChildren source), so the two surfaces
// cannot disagree about what exists or where it lives. The bottom bar itself
// stays four tabs, untouched.
// ---------------------------------------------------------------------------

import Link from "next/link";
import { LogOut } from "lucide-react";
import { LanguageSwitcher, Tri } from "@/components/language-provider";
import { SIDEBAR_NAV, visibleGroupChildren } from "@/components/nav-items";
import { signOutToLogin, useActiveOrg } from "@/components/v3/org-chip";
import { useEinvoisVisible } from "@/lib/einvois-pref";

export default function MorePage() {
  const [einvoisVisible] = useEinvoisVisible();
  const { email, org } = useActiveOrg();

  // Every sidebar group; Home is the bottom bar's own first tab, so the item
  // entry is skipped here.
  const groups = SIDEBAR_NAV.filter((e) => e.kind === "group");

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 pb-6">
      <h1 className="text-2xl font-semibold tracking-tight">
        <Tri bm="Lagi" zh="更多" en="More" />
      </h1>

      {org && (
        <p className="text-base text-[color:var(--v2-text-soft)]">
          <Tri bm="Anda merekod untuk" zh="您正在记录的机构" en="You are recording for" />
          {": "}
          <span className="font-semibold text-[color:var(--v2-text)]">{org.name}</span>
        </p>
      )}

      {groups.map((group) => {
        if (group.kind !== "group") return null;
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

      <div className="flex items-center justify-between gap-3">
        <LanguageSwitcher />
        {email && (
          <button
            type="button"
            onClick={signOutToLogin}
            className="flex items-center gap-2 rounded-xl border border-[color:var(--v2-outline-border)] px-4 py-2 text-base font-medium text-[color:var(--v2-text-soft)] transition-colors hover:bg-[color:var(--v2-primary-soft)]"
          >
            <LogOut className="h-4 w-4" strokeWidth={1.8} />
            <Tri bm="Keluar" zh="退出" en="Sign out" />
          </button>
        )}
      </div>
    </div>
  );
}

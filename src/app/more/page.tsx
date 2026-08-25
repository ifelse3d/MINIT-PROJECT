"use client";

// ---------------------------------------------------------------------------
// /more — the fourth tab (Stage R, 2026-08-25). Everything occasional lives
// here: calendar, filings, constitution, members, glossary, photos, history,
// the optional tax file, and the account rows. On the phone this IS the More
// tab's landing page; on desktop the rail lists the same entries, and this
// page still works for anyone who lands on it.
// ---------------------------------------------------------------------------

import Link from "next/link";
import { LogOut } from "lucide-react";
import { LanguageSwitcher, Tri } from "@/components/language-provider";
import { PRIMARY_NAV, visibleGroupChildren } from "@/components/nav-items";
import { signOutToLogin, useActiveOrg } from "@/components/v3/org-chip";
import { useEinvoisVisible } from "@/lib/einvois-pref";

export default function MorePage() {
  const [einvoisVisible] = useEinvoisVisible();
  const { email, org } = useActiveOrg();

  const more = PRIMARY_NAV.find((e) => e.kind === "group" && e.id === "more");
  const items = more ? visibleGroupChildren(more, einvoisVisible) : [];

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

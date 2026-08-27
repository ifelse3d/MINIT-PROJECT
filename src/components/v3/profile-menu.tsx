"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2, LogOut, Settings, UserRound } from "lucide-react";
import { Tri, useTriText } from "@/components/language-provider";
import { IconTip } from "@/components/ui/tooltip";
import { SignOutConfirm } from "@/components/sign-out-confirm";
import { useActiveOrg } from "./org-chip";
import { cn } from "./surfaces";

// ---------------------------------------------------------------------------
// The profile avatar + dropdown (violet redesign §5.2–5.3) — REPLACES the
// top-bar gear and the rail-footer org block. The org context lives HERE
// now: one place answers "who am I, which organisation am I recording for".
//
// §5.2: the avatar is a solid --v2-primary circle (one of the three places
// a full round is correct), NOT the gradient — white initials over the
// gradient's light end would be 3.96:1, short of AA at 12px.
// §5.3: Log out never signs out on the first click (SignOutConfirm).
// ---------------------------------------------------------------------------

export function ProfileMenu() {
  const { email, org, orgCount } = useActiveOrg();
  const t = useTriText();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Close on outside click / Escape / route change.
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  useEffect(() => {
    // Deferred a tick — the eslint baseline forbids sync setState in effects.
    const id = setTimeout(() => setOpen(false), 0);
    return () => clearTimeout(id);
  }, [pathname]);

  if (!email) return null;
  const initials = email.slice(0, 2).toUpperCase();

  const row =
    "flex min-h-10 w-full items-center gap-3 rounded-sm px-3 text-base transition-colors hover:bg-[color:var(--v2-card-nested)]";

  return (
    <div ref={wrapRef} className="relative">
      <IconTip label={email} side="bottom">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label={email}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-[color:var(--v2-primary-fill)] text-xs font-semibold text-[color:var(--v2-primary-on)] outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--v2-primary-ring)]"
        >
          {initials}
        </button>
      </IconTip>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-11 z-50 w-72 rounded-md border border-[color:var(--v2-border)] bg-[color:var(--v2-card-raised)] p-1.5 shadow-[var(--v2-shadow-lg)]"
        >
          {/* Header block: who is signed in. */}
          <div className="border-b border-[color:var(--v2-border)] px-3 py-2.5">
            <p className="truncate text-sm text-[color:var(--v2-text-soft)]">{email}</p>
          </div>

          <Link href="/settings" role="menuitem" onClick={() => setOpen(false)} className={row}>
            <UserRound className="h-4 w-4 shrink-0" strokeWidth={1.8} />
            <Tri bm="Akaun saya" zh="我的账号" en="My account" />
          </Link>
          <Link href="/settings" role="menuitem" onClick={() => setOpen(false)} className={row}>
            <Settings className="h-4 w-4 shrink-0" strokeWidth={1.8} />
            <Tri bm="Tetapan" zh="设置" en="Settings" />
          </Link>

          {/* §5.3: the org context lives HERE now — this row is what allowed
              the rail-footer org block to go. */}
          <div className="my-1 border-t border-[color:var(--v2-border)]" />
          <Link href="/orgs" role="menuitem" onClick={() => setOpen(false)} className={row}>
            <Building2 className="h-4 w-4 shrink-0" strokeWidth={1.8} />
            <span className="min-w-0 flex-1 truncate">
              {org ? (
                <>
                  {org.name}
                  {org.is_demo && (
                    <span className="ml-1.5 rounded-xs bg-amber-500 px-1 text-xs font-bold text-white">
                      DEMO
                    </span>
                  )}
                </>
              ) : (
                <Tri bm="Pilih pertubuhan" zh="选择机构" en="Choose an organisation" />
              )}
            </span>
            <span className="shrink-0 text-sm text-[color:var(--v2-text-soft)]">
              {orgCount !== null && orgCount > 1
                ? t("Tukar ›", "切换 ›", "Switch ›")
                : "›"}
            </span>
          </Link>

          <div className="my-1 border-t border-[color:var(--v2-border)]" />
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              setConfirmSignOut(true);
            }}
            className={cn(row, "text-[#dc2626]")}
          >
            <LogOut className="h-4 w-4 shrink-0" strokeWidth={1.8} />
            <Tri bm="Log keluar" zh="退出" en="Log out" />
          </button>
        </div>
      )}
      <SignOutConfirm open={confirmSignOut} onClose={() => setConfirmSignOut(false)} />
    </div>
  );
}

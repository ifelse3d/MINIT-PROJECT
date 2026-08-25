"use client";

import { useActionState, useEffect, useSyncExternalStore } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Tri } from "@/components/language-provider";
import { clearStashedInviteCode, readStashedInviteCode } from "@/lib/invite-stash";
import { joinWithInvite, type JoinState } from "./actions";

const INITIAL: JoinState = { error: null, ok: false };

export function JoinForm() {
  const [state, formAction, pending] = useActionState(joinWithInvite, INITIAL);

  // A code stashed at sign-up fills itself in — the person already typed it
  // once; making them find the WhatsApp message again is a toll.
  // useSyncExternalStore (empty server snapshot) rather than state-in-effect,
  // so hydration stays clean and the lint stays at baseline.
  const initialCode = useSyncExternalStore(
    () => () => {},
    readStashedInviteCode,
    () => "",
  );

  // Success: the membership and the active-org cookie exist on the server.
  // Full navigation (not router.push) so the server render sees the cookie.
  useEffect(() => {
    if (!state.ok) return;
    clearStashedInviteCode();
    const t = setTimeout(() => window.location.assign("/"), 1200);
    return () => clearTimeout(t);
  }, [state.ok]);

  const inputCls =
    "w-full rounded-xl border border-[color:var(--v2-outline-border)] bg-[color:var(--v2-card)] px-3 py-2 text-base text-[color:var(--v2-text)] outline-none transition-[border-color,box-shadow] duration-150 focus:border-[color:var(--v2-primary)] focus:shadow-[0_0_0_3px_rgba(91,75,214,0.18)]";

  if (state.ok) {
    return (
      <div className="flex flex-col gap-2 rounded-xl border-2 border-green-400 bg-green-50 p-4">
        <p className="text-lg font-semibold text-green-900">
          ✓{" "}
          <Tri
            bm={`Selamat datang${state.orgName ? ` ke ${state.orgName}` : ""}! Membuka halaman utama…`}
            zh={`欢迎加入${state.orgName ? `「${state.orgName}」` : ""}！正在打开主页……`}
            en={`Welcome${state.orgName ? ` to ${state.orgName}` : ""}! Opening the home page…`}
          />
        </p>
        <Link href="/" className="text-base text-green-900 underline underline-offset-4">
          <Tri
            bm="Kalau halaman tidak terbuka sendiri, tekan di sini"
            zh="如果这一页没有自己打开，请点这里"
            en="If the page does not open by itself, tap here"
          />{" "}
          →
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} className="v2-glass flex flex-col gap-4 p-5">
      <label className="flex flex-col gap-1">
        <span className="text-base font-semibold">
          <Tri bm="Kod jemputan" zh="邀请码" en="Invite code" />
        </span>
        <input
          name="code"
          defaultValue={initialCode}
          key={initialCode /* re-mount when the stash hydrates */}
          className={`${inputCls} font-mono uppercase tracking-widest`}
          placeholder="ABCD-EFGH"
          autoComplete="off"
          required
          maxLength={16}
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-base font-semibold">
          <Tri bm="Nama anda" zh="您的姓名" en="Your name" />
        </span>
        <input name="name" className={inputCls} required maxLength={120} />
        <span className="text-sm text-muted-foreground">
          <Tri
            bm="Dokumen yang anda sahkan nanti akan mencetak nama ini."
            zh="之后确认文件时，落款会印这个名字。"
            en="Documents you confirm later will print this name."
          />
        </span>
      </label>

      {state.error && (
        <p className="rounded-xl border-2 border-red-300 bg-red-50 p-3 text-base font-medium text-red-900">
          {state.error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? (
            <Tri bm="Sebentar…" zh="请稍候…" en="One moment…" />
          ) : (
            <Tri bm="Sertai" zh="加入" en="Join" />
          )}
        </Button>
        <Link href="/orgs/new" className="text-base underline underline-offset-4">
          <Tri
            bm="Tiada kod? Buka pertubuhan baharu"
            zh="没有邀请码？开一个新社团"
            en="No code? Start a new society"
          />{" "}
          →
        </Link>
      </div>
    </form>
  );
}

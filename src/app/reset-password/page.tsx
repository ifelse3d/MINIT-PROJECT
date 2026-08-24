"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Tri, useTriText } from "@/components/language-provider";
import { getSupabaseBrowser } from "@/db/supabase-browser";
import { PasswordInput } from "@/components/password-input";
import {
  AUTH_CARD,
  MIN_PASSWORD_LENGTH,
  authInputClass,
  passwordRequirementProblem,
} from "../login/glass";

// ---------------------------------------------------------------------------
// /reset-password — the second half of "I forgot my password".
//
// WHY THIS PAGE EXISTS (2026-08-22)
// Until today the app had no way back in. Sign-up asked for a password ONCE and
// there was no reset screen, so a typo — or a forgotten password — meant an
// account nobody could ever open again, and for a treasurer that is the whole
// organisation's paperwork behind a door with no key. J found this on the first
// real sign-up, which is exactly when you want to find it.
//
// HOW THE LINK IN THE EMAIL ENDS UP HERE
// /login calls resetPasswordForEmail(email, { redirectTo: <origin>/reset-password }).
// Supabase mails a one-time link; opening it puts a RECOVERY session in the
// cookie and lands here. That session may do exactly one useful thing —
// updateUser({ password }) — which is what the form below does.
//
// 🔴 TWO THINGS THIS PAGE DEPENDS ON, BOTH OUTSIDE THE CODE:
//   1. /reset-password is in PUBLIC_PATHS (src/proxy.ts). The recovery session
//      is established by the page load itself, so the gate would otherwise
//      bounce the arriving link to /login and throw the token away.
//   2. The Supabase project's Redirect URLs must allow this path on BOTH the
//      Vercel origin and localhost (Authentication → URL Configuration).
//      Miss that and the mail links somewhere that refuses to open.
// ---------------------------------------------------------------------------

type Phase = "checking" | "ready" | "noSession" | "done";

export default function ResetPasswordPage() {
  const t = useTriText();
  const [phase, setPhase] = useState<Phase>("checking");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The recovery session arrives asynchronously: @supabase/ssr reads the token
  // out of the URL and writes the cookie after this component mounts. Checking
  // once on mount would race it, so we also listen for the auth event.
  useEffect(() => {
    const supabase = getSupabaseBrowser();
    let settled = false;

    const settle = (hasSession: boolean) => {
      if (settled) return;
      settled = true;
      setPhase(hasSession ? "ready" : "noSession");
    };

    supabase.auth.getSession().then(({ data }) => {
      if (data.session) settle(true);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) settle(true);
    });

    // If nothing has arrived by now, the link was stale, already used, or the
    // page was opened by hand. Say so instead of showing a form that cannot work.
    const timer = setTimeout(() => settle(false), 2500);

    return () => {
      clearTimeout(timer);
      sub.subscription.unsubscribe();
    };
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const problem = passwordRequirementProblem(password);
    if (problem === "length") {
      setError(
        t(
          `Kata laluan sekurang-kurangnya ${MIN_PASSWORD_LENGTH} aksara`,
          `密码至少 ${MIN_PASSWORD_LENGTH} 个字符`,
          `Password must be at least ${MIN_PASSWORD_LENGTH} characters`,
        ),
      );
      return;
    }
    if (problem === "classes") {
      setError(
        t(
          "Perlu huruf besar, huruf kecil, nombor dan simbol (contoh: ! ? @ #)",
          "需要大写字母、小写字母、数字和符号（例如：! ? @ #）",
          "Needs an uppercase letter, a lowercase letter, a number and a symbol (e.g. ! ? @ #)",
        ),
      );
      return;
    }
    if (password !== confirm) {
      setError(
        t(
          "Kata laluan tidak sama — taip semula",
          "两次输入的密码不一样——请重新输入",
          "The two passwords do not match — type it again",
        ),
      );
      return;
    }
    setBusy(true);
    try {
      // PDPA (Hard Rule 5): the vendor's message is not logged or shown raw —
      // it can echo the address back.
      const { error: err } = await getSupabaseBrowser().auth.updateUser({ password });
      if (err) {
        setError(
          t(
            "Tidak berjaya menukar kata laluan — minta pautan baharu",
            "密码更改失败——请重新索取连结",
            "Could not change the password — ask for a new link",
          ),
        );
        return;
      }
      setPhase("done");
    } finally {
      setBusy(false);
    }
  }

  const inputCls = authInputClass(Boolean(error));

  return (
    <>
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col items-center justify-center gap-7 px-4 py-10 sm:py-16">
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[color:var(--v2-primary)] text-2xl font-bold text-white">
            M
          </span>
          <span className="text-4xl font-bold leading-none tracking-tight">Minit</span>
        </div>

        <div className={`flex w-full flex-col gap-5 ${AUTH_CARD}`}>
          <h1 className="text-center text-2xl font-bold leading-tight tracking-tight">
            <Tri bm="Tetapkan Kata Laluan Baharu" zh="设定新密码" en="Set a new password" />
          </h1>

          {phase === "checking" && (
            <p className="flex items-center justify-center gap-2 py-4 text-base text-[color:var(--v2-text-soft)]">
              <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2.4} />
              <Tri bm="Sebentar…" zh="请稍候……" en="One moment…" />
            </p>
          )}

          {phase === "noSession" && (
            <div className="flex flex-col gap-4">
              <p className="text-base font-medium leading-relaxed text-amber-800">
                <Tri
                  bm="Pautan ini sudah tamat tempoh atau telah digunakan. Minta satu lagi dari skrin log masuk."
                  zh="这条连结已经过期或已经用过了。请回登录页再要一条。"
                  en="This link has expired or was already used. Ask for another one from the sign-in screen."
                />
              </p>
              <a
                href="/login"
                className="text-center font-semibold text-[color:var(--v2-primary)] underline underline-offset-2"
              >
                <Tri bm="Kembali ke log masuk" zh="回到登录页" en="Back to sign in" />
              </a>
            </div>
          )}

          {phase === "done" && (
            <div className="flex flex-col gap-4">
              <p className="text-base leading-relaxed">
                <Tri
                  bm="Kata laluan sudah ditukar. Anda sudah log masuk."
                  zh="密码已经换好了，你已经登录。"
                  en="Password changed. You are signed in."
                />
              </p>
              {/* Full navigation, not <Link>: updateUser() has just rotated the
                  session cookie and the server has to be handed the new one.
                  Same reason /login uses window.location.assign after sign-in. */}
              <button
                type="button"
                onClick={() => window.location.assign("/")}
                className="flex w-full items-center justify-center rounded-xl bg-[color:var(--v2-primary)] p-3.5 text-base font-semibold text-white"
              >
                <Tri bm="Teruskan" zh="继续" en="Continue" />
              </button>
            </div>
          )}

          {phase === "ready" && (
            <form onSubmit={submit} className="flex flex-col gap-5">
              <label className="flex flex-col gap-2">
                <span className="text-sm font-semibold text-[color:var(--v2-text-soft)]">
                  <Tri bm="Kata laluan baharu" zh="新密码" en="New password" />
                </span>
                <PasswordInput
                  autoComplete="new-password"
                  placeholder="••••••••••••"
                  value={password}
                  onChange={setPassword}
                  className={inputCls}
                  required
                  minLength={MIN_PASSWORD_LENGTH}
                />
                <span className="text-sm leading-relaxed text-[color:var(--v2-text-soft)]">
                  <Tri
                    bm={`${MIN_PASSWORD_LENGTH} aksara ke atas, dengan huruf besar, huruf kecil, nombor dan simbol (contoh: Bulan#2026)`}
                    zh={`${MIN_PASSWORD_LENGTH} 个字符以上，要有大写字母、小写字母、数字和符号（例如：Bulan#2026）`}
                    en={`${MIN_PASSWORD_LENGTH}+ characters with an uppercase letter, a lowercase letter, a number and a symbol (e.g. Bulan#2026)`}
                  />
                </span>
              </label>

              <label className="flex flex-col gap-2">
                <span className="text-sm font-semibold text-[color:var(--v2-text-soft)]">
                  <Tri
                    bm="Taip kata laluan sekali lagi"
                    zh="再输入一次密码"
                    en="Type the password again"
                  />
                </span>
                <PasswordInput
                  autoComplete="new-password"
                  placeholder="••••••••••••"
                  value={confirm}
                  onChange={setConfirm}
                  className={inputCls}
                  required
                  minLength={MIN_PASSWORD_LENGTH}
                />
              </label>

              {error && <p className="text-base font-medium text-red-700">{error}</p>}

              <button
                type="submit"
                disabled={busy}
                className="mt-1 flex w-full items-center justify-center gap-2 rounded-xl bg-[color:var(--v2-primary)] p-3.5 text-base font-semibold text-white transition-[filter] duration-150 hover:brightness-105 active:translate-y-px disabled:cursor-wait disabled:opacity-60"
              >
                {busy && <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2.4} />}
                <Tri bm="Simpan kata laluan" zh="保存密码" en="Save password" />
              </button>
            </form>
          )}
        </div>
      </div>
    </>
  );
}

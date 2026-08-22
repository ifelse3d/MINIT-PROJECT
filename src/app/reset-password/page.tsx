"use client";

import { useEffect, useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { Tri, useTriText } from "@/components/language-provider";
import { getSupabaseBrowser } from "@/db/supabase-browser";
import { PasswordInput } from "@/components/password-input";
import {
  GLASS_CARD,
  LoginBackdrop,
  MIN_PASSWORD_LENGTH,
  glassInputClass,
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

  const inputCls = glassInputClass(Boolean(error));

  return (
    <>
      <LoginBackdrop />

      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-[460px] flex-col items-center justify-center gap-[34px] px-[18px] py-10 sm:px-6 sm:py-16">
        <div className="v2-rise v2-rise-1 flex flex-col items-center gap-4">
          <div className="flex items-center gap-[18px]">
            <span className="flex h-[62px] w-[62px] items-center justify-center rounded-[18px] bg-gradient-to-br from-[#9c8dff] to-[#6d5ae6] text-white shadow-[0_14px_34px_rgba(60,36,170,0.5)]">
              <Sparkles className="h-[30px] w-[30px]" strokeWidth={1.7} />
            </span>
            <span className="text-4xl font-bold leading-none tracking-[-0.02em] text-white sm:text-[46px]">
              Minit
            </span>
          </div>
        </div>

        <div
          className={`v2-rise v2-rise-2 flex w-full flex-col gap-5 rounded-[26px] px-5 pb-[22px] pt-[26px] sm:px-8 sm:pb-7 sm:pt-[34px] ${GLASS_CARD}`}
        >
          <h1 className="text-center text-[25px] font-bold leading-tight tracking-[-0.01em] text-white [text-shadow:0_1px_12px_rgba(10,6,40,0.35)]">
            <Tri bm="Tetapkan Kata Laluan Baharu" zh="设定新密码" en="Set a new password" />
          </h1>

          {phase === "checking" && (
            <p className="flex items-center justify-center gap-2 py-4 text-base text-white/[0.72]">
              <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2.4} />
              <Tri bm="Sebentar…" zh="请稍候……" en="One moment…" />
            </p>
          )}

          {phase === "noSession" && (
            <div className="flex flex-col gap-4">
              <p className="text-base leading-relaxed text-[#ffe0a8]">
                <Tri
                  bm="Pautan ini sudah tamat tempoh atau telah digunakan. Minta satu lagi dari skrin log masuk."
                  zh="这条连结已经过期或已经用过了。请回登录页再要一条。"
                  en="This link has expired or was already used. Ask for another one from the sign-in screen."
                />
              </p>
              <a
                href="/login"
                className="text-center font-semibold text-white underline decoration-white/60 underline-offset-[3px] hover:decoration-white"
              >
                <Tri bm="Kembali ke log masuk" zh="回到登录页" en="Back to sign in" />
              </a>
            </div>
          )}

          {phase === "done" && (
            <div className="flex flex-col gap-4">
              <p className="text-base leading-relaxed text-white/[0.88]">
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
                className="flex w-full items-center justify-center rounded-[14px] bg-gradient-to-r from-[#6d5ae6] to-[#9a83ff] p-4 text-base font-semibold text-white shadow-[0_12px_28px_rgba(88,60,220,0.38)]"
              >
                <Tri bm="Teruskan" zh="继续" en="Continue" />
              </button>
            </div>
          )}

          {phase === "ready" && (
            <form onSubmit={submit} className="flex flex-col gap-5">
              <label className="flex flex-col gap-2">
                <span className="text-sm font-semibold text-white/[0.88]">
                  <Tri bm="Kata laluan baharu" zh="新密码" en="New password" />
                </span>
                <PasswordInput
                  tone="dark"
                  autoComplete="new-password"
                  placeholder="••••••••••••"
                  value={password}
                  onChange={setPassword}
                  className={inputCls}
                  required
                  minLength={MIN_PASSWORD_LENGTH}
                />
                <span className="text-sm leading-relaxed text-white/[0.62]">
                  <Tri
                    bm={`${MIN_PASSWORD_LENGTH} aksara ke atas, dengan huruf besar, huruf kecil, nombor dan simbol (contoh: Bulan#2026)`}
                    zh={`${MIN_PASSWORD_LENGTH} 个字符以上，要有大写字母、小写字母、数字和符号（例如：Bulan#2026）`}
                    en={`${MIN_PASSWORD_LENGTH}+ characters with an uppercase letter, a lowercase letter, a number and a symbol (e.g. Bulan#2026)`}
                  />
                </span>
              </label>

              <label className="flex flex-col gap-2">
                <span className="text-sm font-semibold text-white/[0.88]">
                  <Tri
                    bm="Taip kata laluan sekali lagi"
                    zh="再输入一次密码"
                    en="Type the password again"
                  />
                </span>
                <PasswordInput
                  tone="dark"
                  autoComplete="new-password"
                  placeholder="••••••••••••"
                  value={confirm}
                  onChange={setConfirm}
                  className={inputCls}
                  required
                  minLength={MIN_PASSWORD_LENGTH}
                />
              </label>

              {error && <p className="text-base text-[#ffb4b4]">{error}</p>}

              <button
                type="submit"
                disabled={busy}
                className="mt-1 flex w-full items-center justify-center gap-2 rounded-[14px] bg-gradient-to-r from-[#6d5ae6] to-[#9a83ff] p-4 text-base font-semibold text-white shadow-[0_12px_28px_rgba(88,60,220,0.38)] transition-[filter,box-shadow,transform] duration-150 hover:shadow-[0_16px_34px_rgba(88,60,220,0.46)] hover:brightness-105 active:translate-y-px disabled:cursor-wait disabled:opacity-80"
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

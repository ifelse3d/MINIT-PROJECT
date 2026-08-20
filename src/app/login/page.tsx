"use client";

import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { Tri, useTriText } from "@/components/language-provider";
import { getSupabaseBrowser } from "@/db/supabase-browser";

// ---------------------------------------------------------------------------
// /login — email + password sign-in and sign-up (Phase 7).
//
// Visual design follows the "Minit Sign In" handoff: a full-bleed Malaysian NGO
// photograph, a dark tinted scrim, and translucent "liquid glass" panels on top
// (card fill 4% white, 6px blur, 1px white/16 border, inset top highlight).
// Because the surface is dark in BOTH themes, this screen deliberately does not
// use the light-glass Card component or dark: variants — it is dark by design.
// The brand mark is the app's own (gradient tile + sparkle), per the handoff.
//
// Open sign-up is safe by design: a brand-new account belongs to NO org, so
// RLS shows it zero rows until it creates its own organisation (or an
// hq_admin adds it to an existing one). PDPA note: we never log emails or
// errors here — failures surface in the UI only.
// ---------------------------------------------------------------------------

type Mode = "signin" | "signup";

/** Glass panel fill + border + inset highlight, shared by card and inputs. */
const GLASS_CARD =
  "border border-white/[0.16] bg-gradient-to-br from-white/[0.04] to-white/[0.01] shadow-[0_22px_52px_rgba(8,6,30,0.22),inset_0_1px_0_rgba(255,255,255,0.18)] backdrop-blur-[6px] backdrop-saturate-150";

export default function LoginPage() {
  const t = useTriText();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    if (!email.trim() || password.length < 6) {
      setError(
        t(
          "Isikan e-mel dan kata laluan (min. 6 aksara)",
          "请填写电邮和密码（至少6个字符）",
          "Enter an email and a password (min. 6 characters)",
        ),
      );
      return;
    }
    setBusy(true);
    const supabase = getSupabaseBrowser();
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) {
          setError(
            t(
              "Log masuk gagal — semak e-mel dan kata laluan",
              "登录失败——请检查电邮和密码",
              "Sign-in failed — check your email and password",
            ),
          );
          return;
        }
        // Full navigation so the server sees the new session cookie.
        window.location.assign("/");
      } else {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
        });
        if (error) {
          setError(
            t(
              "Pendaftaran gagal — cuba e-mel lain atau kata laluan lebih panjang",
              "注册失败——请尝试其他电邮或更长的密码",
              "Sign-up failed — try another email or a longer password",
            ),
          );
          return;
        }
        if (data.session) {
          window.location.assign("/orgs");
        } else {
          // Email confirmation is ON in this Supabase project.
          setNotice(
            t(
              "Semak e-mel anda untuk pautan pengesahan, kemudian log masuk",
              "请查看电邮中的确认链接，然后登录",
              "Check your email for a confirmation link, then sign in",
            ),
          );
          setMode("signin");
        }
      }
    } finally {
      setBusy(false);
    }
  }

  // Placeholder colour is set explicitly: the browser default is unreadable on
  // glass. Error state reddens the border of both credential fields.
  const inputCls = [
    "w-full rounded-[14px] border bg-white/[0.02] px-[18px] py-[15px] text-base text-white",
    "placeholder:text-white/50 outline-none backdrop-blur-[4px] transition-[background,border-color,box-shadow] duration-150",
    "focus:border-white/75 focus:bg-white/[0.26] focus:shadow-[0_0_0_4px_rgba(139,123,255,0.28)]",
    error ? "border-[rgba(255,150,150,0.7)]" : "border-white/[0.16]",
  ].join(" ");

  return (
    <>
      {/* Sibling of the form, never its child: the backdrop is positioned
          (fixed) and positioned elements paint AFTER non-positioned content, so
          nesting it inside the form's container covered the whole form. */}
      <LoginBackdrop />

      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-[460px] flex-col items-center justify-center gap-[34px] px-[18px] py-10 sm:px-6 sm:py-16">
        {/* Brand block — the app's own mark, kept at its existing lockup */}
        <div className="v2-rise v2-rise-1 flex flex-col items-center gap-4">
          <div className="flex items-center gap-[18px]">
            <span className="flex h-[62px] w-[62px] items-center justify-center rounded-[18px] bg-gradient-to-br from-[#9c8dff] to-[#6d5ae6] text-white shadow-[0_14px_34px_rgba(60,36,170,0.5)]">
              <Sparkles className="h-[30px] w-[30px]" strokeWidth={1.7} />
            </span>
            <span className="text-4xl font-bold leading-none tracking-[-0.02em] text-white sm:text-[46px]">
              Minit
            </span>
          </div>
          <p className="text-pretty text-center text-[17px] leading-relaxed text-white/[0.78]">
            <Tri
              bm="Pembantu pematuhan untuk persatuan & NGO"
              zh="社团与非政府组织的合规助手"
              en="Compliance assistant for societies & NGOs"
            />
          </p>
        </div>

        {/* Sign-in card */}
        <div
          className={`v2-rise v2-rise-2 flex w-full flex-col gap-5 rounded-[26px] px-5 pb-[22px] pt-[26px] sm:px-8 sm:pb-7 sm:pt-[34px] ${GLASS_CARD}`}
        >
          <h1 className="text-center text-[25px] font-bold leading-tight tracking-[-0.01em] text-white [text-shadow:0_1px_12px_rgba(10,6,40,0.35)]">
            {mode === "signin" ? (
              <Tri bm="Log Masuk" zh="登录" en="Sign in" />
            ) : (
              <Tri bm="Daftar Akaun" zh="注册账户" en="Create account" />
            )}
          </h1>

          <form onSubmit={submit} className="flex flex-col gap-5">
            <label className="flex flex-col gap-2">
              <span className="text-sm font-semibold text-white/[0.88]">
                <Tri bm="E-mel" zh="电邮" en="Email" />
              </span>
              <input
                type="email"
                autoComplete="email"
                placeholder="you@organisation.org"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputCls}
                required
              />
            </label>
            <label className="flex flex-col gap-2">
              <span className="text-sm font-semibold text-white/[0.88]">
                <Tri bm="Kata laluan" zh="密码" en="Password" />
              </span>
              <input
                type="password"
                autoComplete={
                  mode === "signin" ? "current-password" : "new-password"
                }
                placeholder="••••••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={`${inputCls} tracking-[0.08em]`}
                required
                minLength={6}
              />
            </label>

            {error && <p className="text-base text-[#ffb4b4]">{error}</p>}
            {notice && <p className="text-base text-[#ffe0a8]">{notice}</p>}

            <button
              type="submit"
              disabled={busy}
              className="mt-1 flex w-full items-center justify-center gap-2 rounded-[14px] bg-gradient-to-r from-[#6d5ae6] to-[#9a83ff] p-4 text-base font-semibold text-white shadow-[0_12px_28px_rgba(88,60,220,0.38)] transition-[filter,box-shadow,transform] duration-150 hover:shadow-[0_16px_34px_rgba(88,60,220,0.46)] hover:brightness-105 active:translate-y-px disabled:cursor-wait disabled:opacity-80"
            >
              {/* Spinner sits beside a stable label so the button never resizes */}
              {busy && <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2.4} />}
              {mode === "signin" ? (
                <Tri bm="Log Masuk" zh="登录" en="Sign in" />
              ) : (
                <Tri bm="Daftar" zh="注册" en="Sign up" />
              )}
            </button>
          </form>

          <p className="text-center text-base text-white/[0.72]">
            <button
              type="button"
              onClick={() => {
                setMode(mode === "signin" ? "signup" : "signin");
                setError(null);
                setNotice(null);
              }}
              className="font-semibold text-white underline decoration-white/60 underline-offset-[3px] hover:decoration-white"
            >
              {mode === "signin" ? (
                <Tri
                  bm="Belum ada akaun? Daftar di sini"
                  zh="还没有账户？在此注册"
                  en="No account yet? Sign up here"
                />
              ) : (
                <Tri
                  bm="Sudah ada akaun? Log masuk"
                  zh="已有账户？登录"
                  en="Already have an account? Sign in"
                />
              )}
            </button>
          </p>
        </div>

        <p className="v2-rise v2-rise-2 text-center text-base text-white/60">
          <Tri
            bm="Sedia untuk Jabatan Pendaftaran Pertubuhan (ROS) · Malaysia"
            zh="支持社团注册局（ROS）· 马来西亚"
            en="Registry of Societies (ROS) ready · Malaysia"
          />
        </p>
      </div>
    </>
  );
}

/**
 * Full-bleed backdrop, layered back to front per the handoff:
 *   1. #0f1020 fallback — shows if the photo is missing, never a white flash
 *   2. the photo at public/login-bg.jpg, cover/centred, drifting very slowly
 *   3. dark scrim (115deg) — tuned so white type on 4% glass stays legible
 *   4. purple glow, centred slightly above the middle
 *
 * Fixed at z-0 (not a negative z-index: the shell's .v2-root paints its own
 * background, which would swallow a layer behind it) with the form above at
 * z-10. aria-hidden because it carries no information.
 */
function LoginBackdrop() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden bg-[#0f1020]">
      <div className="v2-login-photo absolute inset-0" />
      <div className="absolute inset-0 bg-[linear-gradient(115deg,rgba(20,16,48,0.86)_0%,rgba(28,22,60,0.62)_42%,rgba(12,32,40,0.55)_100%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(120%_90%_at_50%_40%,rgba(124,92,255,0.16)_0%,rgba(0,0,0,0)_60%)]" />
    </div>
  );
}

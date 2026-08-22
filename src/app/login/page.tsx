"use client";

import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { Tri, useTriText } from "@/components/language-provider";
import { PasswordInput } from "@/components/password-input";
import { getSupabaseBrowser } from "@/db/supabase-browser";
import {
  GLASS_CARD,
  LoginBackdrop,
  MIN_PASSWORD_LENGTH,
  glassInputClass,
  passwordRequirementProblem,
} from "./glass";

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

/** "forgot" only collects an email and asks Supabase to mail a recovery link;
 *  the new password is typed on /reset-password, where that link lands. */
type Mode = "signin" | "signup" | "forgot";

export default function LoginPage() {
  const t = useTriText();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  // Sign-up only. See the validation block in submit() for why this field
  // exists at all — it is the only thing standing between a typo and an
  // account nobody can ever get into.
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    // ---------------------------------------------------------------------
    // 2026-08-22: sign-up used to accept any 6 characters and asked for the
    // password ONCE, and there was no way to reset one. A single typo in that
    // one field created an account its owner could never get into — for a
    // treasurer, the whole organisation's paperwork behind a door with no key.
    // Both halves were fixed together: this confirmation field stops the typo,
    // and /reset-password is the way back for everything else.
    //
    // Sign-IN stays lenient on purpose: it only checks the field is not empty.
    // Tightening the rule must never lock out an account that already exists
    // under the old one — the server is the authority on whether it is right.
    //
    // ⚠ MIN_PASSWORD_LENGTH is the BROWSER's rule. Someone calling the Supabase
    //   API directly does not run this code. Raise the project's own minimum in
    //   Supabase → Authentication → Sign In / Providers → Email to make it real.
    // ---------------------------------------------------------------------
    if (!email.trim()) {
      setError(t("Isikan e-mel", "请填写电邮", "Enter an email"));
      return;
    }
    if (mode === "forgot") {
      setBusy(true);
      try {
        // The reply is deliberately the same whether or not the address has an
        // account: telling a stranger "no such user" turns this box into a way
        // to find out who is registered (PDPA, Hard Rule 5). Supabase behaves
        // the same way, so the error is not inspected either.
        await getSupabaseBrowser().auth.resetPasswordForEmail(email.trim(), {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        setNotice(
          t(
            "Jika akaun itu wujud, pautan sudah dihantar ke e-mel itu",
            "如果那个账户存在，重设连结已经寄过去了",
            "If that account exists, a link has been sent to that email",
          ),
        );
        setMode("signin");
      } finally {
        setBusy(false);
      }
      return;
    }
    if (mode === "signin" && password.length === 0) {
      setError(t("Isikan kata laluan", "请填写密码", "Enter a password"));
      return;
    }
    if (mode === "signup") {
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
    }
    if (mode === "signup" && password !== confirm) {
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

  const inputCls = glassInputClass(Boolean(error));

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
            ) : mode === "signup" ? (
              <Tri bm="Daftar Akaun" zh="注册账户" en="Create account" />
            ) : (
              <Tri bm="Lupa Kata Laluan" zh="忘记密码" en="Forgot password" />
            )}
          </h1>

          {mode === "forgot" && (
            <p className="text-pretty text-center text-base leading-relaxed text-white/[0.72]">
              <Tri
                bm="Masukkan e-mel anda. Kami hantar pautan untuk menetapkan kata laluan baharu."
                zh="输入你的电邮。我们会寄一条连结给你，让你设定新密码。"
                en="Enter your email. We will send a link for setting a new password."
              />
            </p>
          )}

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
            {/* Hidden in "forgot": that mode only needs the address. A password
                box there invites people to type the one they cannot remember. */}
            <label className={`flex-col gap-2 ${mode === "forgot" ? "hidden" : "flex"}`}>
              <span className="text-sm font-semibold text-white/[0.88]">
                <Tri bm="Kata laluan" zh="密码" en="Password" />
              </span>
              <PasswordInput
                tone="dark"
                autoComplete={
                  mode === "signin" ? "current-password" : "new-password"
                }
                placeholder="••••••••••••"
                value={password}
                onChange={setPassword}
                className={inputCls}
                // Not `required` in "forgot": a required control that is
                // display:none blocks submit with a validation message the
                // browser cannot even scroll to.
                required={mode !== "forgot"}
                minLength={mode === "signup" ? MIN_PASSWORD_LENGTH : 1}
              />
              {mode === "signup" && (
                <span className="text-sm leading-relaxed text-white/[0.62]">
                  <Tri
                    bm={`${MIN_PASSWORD_LENGTH} aksara ke atas, dengan huruf besar, huruf kecil, nombor dan simbol (contoh: Bulan#2026)`}
                    zh={`${MIN_PASSWORD_LENGTH} 个字符以上，要有大写字母、小写字母、数字和符号（例如：Bulan#2026）`}
                    en={`${MIN_PASSWORD_LENGTH}+ characters with an uppercase letter, a lowercase letter, a number and a symbol (e.g. Bulan#2026)`}
                  />
                </span>
              )}
            </label>

            {/* Sign-up only. Asking twice is not politeness: an unnoticed typo
                here costs the person a round-trip through their email before
                they can get in at all. */}
            {mode === "signup" && (
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
            )}

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
              ) : mode === "signup" ? (
                <Tri bm="Daftar" zh="注册" en="Sign up" />
              ) : (
                <Tri bm="Hantar pautan" zh="寄出连结" en="Send the link" />
              )}
            </button>
          </form>

          {mode === "signin" && (
            <p className="-mt-1 text-center text-base">
              <button
                type="button"
                onClick={() => {
                  setMode("forgot");
                  setError(null);
                  setNotice(null);
                }}
                className="text-white/[0.72] underline decoration-white/40 underline-offset-[3px] hover:text-white hover:decoration-white"
              >
                <Tri
                  bm="Lupa kata laluan?"
                  zh="忘记密码？"
                  en="Forgot your password?"
                />
              </button>
            </p>
          )}

          <p className="text-center text-base text-white/[0.72]">
            <button
              type="button"
              onClick={() => {
                setMode(mode === "signin" ? "signup" : "signin");
                setError(null);
                setNotice(null);
                // Half-typed confirmation must not survive the switch, or the
                // next sign-up starts with a mismatch nobody typed.
                setConfirm("");
              }}
              className="font-semibold text-white underline decoration-white/60 underline-offset-[3px] hover:decoration-white"
            >
              {mode === "signin" ? (
                <Tri
                  bm="Belum ada akaun? Daftar di sini"
                  zh="还没有账户？在此注册"
                  en="No account yet? Sign up here"
                />
              ) : mode === "signup" ? (
                <Tri
                  bm="Sudah ada akaun? Log masuk"
                  zh="已有账户？登录"
                  en="Already have an account? Sign in"
                />
              ) : (
                <Tri
                  bm="Kembali ke log masuk"
                  zh="回到登录"
                  en="Back to sign in"
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

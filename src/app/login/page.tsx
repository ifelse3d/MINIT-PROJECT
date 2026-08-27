"use client";

import { useEffect, useState } from "react";
import { BrandLogo } from "@/components/brand-logo";
import { Loader2 } from "lucide-react";
import { Tri, useTriText } from "@/components/language-provider";
import { BRAND_NAME } from "@/lib/brand";
import { PasswordInput } from "@/components/password-input";
import { getSupabaseBrowser } from "@/db/supabase-browser";
import { stashInviteCode } from "@/lib/invite-stash";
import { LEGAL_VERSIONS } from "@/legal/documents";
import {
  MIN_PASSWORD_LENGTH,
  authInputClass,
  passwordRequirementProblem,
} from "./glass";

// ---------------------------------------------------------------------------
// /login — email + password sign-in and sign-up (Phase 7).
//
// Stage R (2026-08-25): one centred card on the app's own clean background, in
// the visitor's ONE chosen language. The photo backdrop, dark scrim and glass
// panels are gone — they ghosted on phones and failed contrast, and this is
// the first and hardest screen for our users.
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
  // Sign-up only. Unticked by default and never remembered: a pre-ticked box is
  // not consent under the PDPA, and neither is one the person never saw.
  const [agreed, setAgreed] = useState(false);
  // Sign-up only, OPTIONAL (B-2): an invite code typed here is stashed on the
  // device and fills itself in on /orgs/join after the first sign-in — email
  // confirmation sits between typing it and being able to use it.
  const [inviteCode, setInviteCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // C-3 (拍板 32): sign-up ends HERE, signed out, with ?registered=1 — the
  // person logs in themselves. This flag renders the "registered, please sign
  // in" line in whatever language the reader has chosen.
  const [justRegistered, setJustRegistered] = useState(false);

  useEffect(() => {
    // setTimeout(0), not a synchronous setState: the frozen eslint baseline
    // counts react-hooks/set-state-in-effect as an error (STATE §6).
    const timer = setTimeout(() => {
      try {
        const params = new URLSearchParams(window.location.search);
        if (params.get("registered") === "1") {
          setJustRegistered(true);
          // 28#1 (J, asked twice — 8/27 and 8/28): arriving here from the
          // EMAIL CONFIRMATION link carries tokens in the URL hash, and
          // supabase-js quietly turns them into a live session — walking the
          // person into the app without ever typing their password, which is
          // exactly what C-3 exists to prevent. Whatever session exists on
          // this page is discarded; the person signs in themselves.
          void getSupabaseBrowser().auth.signOut();
        }
      } catch {
        // No URL to read — nothing to show.
      }
    }, 0);
    return () => clearTimeout(timer);
  }, []);

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
    if (mode === "signup" && !agreed) {
      setError(
        t(
          "Sila baca dan setuju dengan Syarat Penggunaan dan Notis Privasi dahulu",
          "请先阅读并同意《使用条款》和《隐私权告知》",
          "Please read and agree to the Terms of Use and the Privacy Notice first",
        ),
      );
      return;
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
          // WHAT THEY AGREED TO, AND WHICH TEXT IT WAS (2026-08-22).
          // The versions are content hashes of legal/*.md (scripts/sync-legal.mjs),
          // so a later edit to a clause cannot quietly claim this person agreed
          // to the new wording. Stored on the auth user, which needs no table
          // and survives everything except deleting the account itself.
          // PDPA Hard Rule 5: this records THAT consent was given and against
          // which text — no document content, no personal data beyond the
          // account that is being created anyway.
          options: {
            // 28#1: the email confirmation link must ALSO end on this page,
            // signed out, "now sign in" — not walk the person into the app.
            // The signOut for any session the link's tokens create happens in
            // the ?registered=1 effect above.
            emailRedirectTo: `${window.location.origin}/login?registered=1`,
            data: {
              terms_accepted_at: new Date().toISOString(),
              terms_version: LEGAL_VERSIONS.terms,
              privacy_notice_version: LEGAL_VERSIONS.privacy,
            },
          },
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
        // B-2: keep the invite code for after the email round-trip — it fills
        // itself in on /orgs/join once they are signed in.
        if (inviteCode.trim() !== "") stashInviteCode(inviteCode);
        if (data.session) {
          // C-3 (拍板 32): registering does NOT walk you into the app. Sign
          // the fresh session out and land back here with ?registered=1 —
          // "registration worked, now sign in" — a full navigation so the
          // server never sees the discarded session cookie.
          await supabase.auth.signOut();
          window.location.assign("/login?registered=1");
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

  const inputCls = authInputClass(Boolean(error));
  const labelCls = "text-sm font-semibold text-[color:var(--v2-text-soft)]";

  return (
    // §6 (violet redesign): a centred SPLIT card on the gradient canvas —
    // brand gradient left, white form right. The form's logic is untouched;
    // only the frame changed.
    <div className="flex min-h-screen w-full flex-col items-center justify-center gap-5 p-4 py-10 sm:p-6">
      <div className="flex w-full max-w-[880px] flex-col overflow-hidden rounded-lg border border-[color:var(--v2-border)] bg-[color:var(--v2-card)] shadow-[var(--v2-shadow-lg)] md:min-h-[480px] md:flex-row">
        {/* Brand panel — 42%, dark→light gradient; every word sits over the
            DARK end (§2.2 rule 4: no small text on the light end). On <md it
            collapses to a slim strip. */}
        <div
          className="flex items-center gap-2.5 p-6 text-white md:w-[42%] md:flex-col md:items-start md:justify-start md:gap-0 md:p-10"
          style={{ background: "var(--v2-grad-brand)" }}
        >
          {/* #14 (J review 27-evening): the wordmark and logo, a size up. */}
          <div className="flex items-center gap-3">
            <BrandLogo size={48} white className="h-12 w-12" />
            <span className="text-3xl font-bold leading-none tracking-tight">
              {BRAND_NAME}
            </span>
          </div>
          <div className="hidden md:mt-10 md:block">
            <p className="text-3xl font-bold leading-tight">
              <Tri bm="Selamat datang" zh="欢迎回来" en="Welcome" />
            </p>
            <p className="mt-3 text-pretty text-base text-white/90">
              <Tri
                bm="Pembantu pematuhan untuk persatuan & NGO"
                zh="社团与非政府组织的合规助手"
                en="Compliance assistant for societies & NGOs"
              />
            </p>
            <div aria-hidden className="mt-8 h-px w-12 bg-white/40" />
          </div>
        </div>

        {/* The form — 58%, pure white, contents vertically centred. */}
        <div className="flex w-full flex-col justify-center gap-5 p-6 sm:p-8 md:w-[58%] md:px-12 md:py-10">
        <h1 className="text-2xl font-bold leading-tight tracking-tight">
          {mode === "signin" ? (
            <Tri bm="Log Masuk" zh="登录" en="Sign in" />
          ) : mode === "signup" ? (
            <Tri bm="Daftar Akaun" zh="注册账户" en="Create account" />
          ) : (
            <Tri bm="Lupa Kata Laluan" zh="忘记密码" en="Forgot password" />
          )}
        </h1>

        {mode === "forgot" && (
          <p className="text-pretty text-base leading-relaxed text-[color:var(--v2-text-soft)]">
            <Tri
              bm="Masukkan e-mel anda. Kami hantar pautan untuk menetapkan kata laluan baharu."
              zh="输入你的电邮。我们会寄一条连结给你，让你设定新密码。"
              en="Enter your email. We will send a link for setting a new password."
            />
          </p>
        )}

        <form onSubmit={submit} className="flex flex-col gap-5">
          <label className="flex flex-col gap-2">
            <span className={labelCls}>
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
            <span className={labelCls}>
              <Tri bm="Kata laluan" zh="密码" en="Password" />
            </span>
            <PasswordInput
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
              <span className="text-sm leading-relaxed text-[color:var(--v2-text-soft)]">
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
              <span className={labelCls}>
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
          )}

          {/* B-2 (2026-08-25): the OPTIONAL invite code. Someone invited to an
              existing society types it here once; it waits out the
              email-confirmation round-trip in localStorage and fills itself in
              on /orgs/join after the first sign-in. Blank = starting a new
              society — the normal path is untouched. */}
          {mode === "signup" && (
            <label className="flex flex-col gap-2">
              <span className={labelCls}>
                <Tri
                  bm="Kod jemputan (jika ada)"
                  zh="邀请码（有就填）"
                  en="Invite code (if you have one)"
                />
              </span>
              <input
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value)}
                className={`${inputCls} font-mono uppercase tracking-widest`}
                placeholder="ABCD-EFGH"
                autoComplete="off"
                maxLength={16}
              />
              <span className="text-sm leading-relaxed text-[color:var(--v2-text-soft)]">
                <Tri
                  bm="Pentadbir pertubuhan anda yang memberikannya. Tiada kod? Biarkan kosong — anda boleh buka pertubuhan sendiri selepas log masuk."
                  zh="邀请码由机构管理员提供。没有的话留空 —— 登录后可以自己开新社团。"
                  en="Your organisation's administrator gives you one. No code? Leave it blank — you can start a new society after signing in."
                />
              </span>
            </label>
          )}

          {/* CONSENT (2026-08-22). Unticked, and the button below is disabled
              until it is ticked — an agreement somebody had to actively give
              is the only kind that means anything. Both links open in a new
              tab so a half-filled form is never lost to reading the notice,
              and both pages are public (src/proxy.ts) so they can be read
              before there is an account. */}
          {mode === "signup" && (
            <label className="flex items-start gap-3 text-sm leading-relaxed">
              <input
                type="checkbox"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
                className="mt-1 h-5 w-5 shrink-0 rounded accent-[color:var(--v2-primary)]"
              />
              <span>
                <Tri
                  bm="Saya telah membaca dan bersetuju dengan"
                  zh="我已阅读并同意"
                  en="I have read and agree to the"
                />{" "}
                <a
                  href="/terms"
                  target="_blank"
                  rel="noreferrer"
                  className="font-semibold underline underline-offset-2"
                >
                  <Tri bm="Syarat Penggunaan" zh="《使用条款》" en="Terms of Use" />
                </a>{" "}
                <Tri bm="dan" zh="和" en="and the" />{" "}
                <a
                  href="/privacy"
                  target="_blank"
                  rel="noreferrer"
                  className="font-semibold underline underline-offset-2"
                >
                  <Tri bm="Notis Privasi" zh="《隐私权告知》" en="Privacy Notice" />
                </a>
                .{" "}
                <Tri
                  bm="Saya faham MinitAI menghasilkan DRAF yang mesti disemak oleh manusia, dan bahawa saya bertanggungjawab mendapatkan kebenaran penderma dan ahli sebelum memasukkan data peribadi mereka."
                  zh="我明白 MinitAI 产生的是草稿，必须由人核对；也明白在输入捐款人和会员的个人资料之前，要先取得他们的同意。"
                  en="I understand MinitAI produces DRAFTS that a human must check, and that I am responsible for obtaining the consent of donors and members before entering their personal data."
                />
              </span>
            </label>
          )}

          {/* C-3: shown after the ?registered=1 round-trip, until the person
              starts doing something else with the form. */}
          {justRegistered && mode === "signin" && !error && !notice && (
            <p className="text-base font-medium text-green-700">
              ✓{" "}
              <Tri
                bm="Pendaftaran berjaya — sila log masuk"
                zh="注册成功，请登录"
                en="Registration successful — please sign in"
              />
            </p>
          )}
          {error && <p className="text-base font-medium text-red-700">{error}</p>}
          {notice && <p className="text-base font-medium text-amber-800">{notice}</p>}

          <button
            type="submit"
            disabled={busy || (mode === "signup" && !agreed)}
            className="mt-1 flex w-full items-center justify-center gap-2 rounded-md bg-[color:var(--v2-primary-fill)] p-3.5 text-base font-semibold text-white transition-[filter] duration-150 hover:brightness-105 active:translate-y-px disabled:cursor-wait disabled:opacity-60"
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
              className="text-[color:var(--v2-text-soft)] underline underline-offset-2 hover:text-[color:var(--v2-text)]"
            >
              <Tri
                bm="Lupa kata laluan?"
                zh="忘记密码？"
                en="Forgot your password?"
              />
            </button>
          </p>
        )}

        <p className="text-center text-base text-[color:var(--v2-text-soft)]">
          <button
            type="button"
            onClick={() => {
              setMode(mode === "signin" ? "signup" : "signin");
              setError(null);
              setNotice(null);
              // Half-typed confirmation must not survive the switch, or the
              // next sign-up starts with a mismatch nobody typed.
              setConfirm("");
              setAgreed(false);
            }}
            className="font-semibold text-[color:var(--v2-primary)] underline underline-offset-2"
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
      </div>

      <p className="text-center text-sm text-[color:var(--v2-text-soft)]">
        <Tri
          bm="Sedia untuk Jabatan Pendaftaran Pertubuhan (ROS) · Malaysia"
          zh="支持社团注册局（ROS）· 马来西亚"
          en="Registry of Societies (ROS) ready · Malaysia"
        />
      </p>
    </div>
  );
}

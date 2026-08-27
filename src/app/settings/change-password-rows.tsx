"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Tri, useTriText } from "@/components/language-provider";
import { getSupabaseBrowser } from "@/db/supabase-browser";
import { PasswordInput } from "@/components/password-input";
import {
  MIN_PASSWORD_LENGTH,
  passwordRequirementProblem,
} from "../login/glass";
import { SettingsBlock, SettingsRow } from "./ui";

// ---------------------------------------------------------------------------
// Settings → change your password (2026-08-22).
//
// J: "RESET PASSWORD 就放在 app setting 里比较好吧，外面就 forget password".
//
// TWO DIFFERENT SCREENS, AND THEY MUST STAY DIFFERENT:
//   /reset-password  — where the link in the "I forgot my password" email lands.
//                      It is OUTSIDE the login gate (src/proxy.ts PUBLIC_PATHS)
//                      because the whole point is that the person cannot get in.
//                      It must not move here.
//   this card        — the person IS signed in and simply wants a new password.
//                      Nothing outside the gate can offer this, because it asks
//                      for the CURRENT password first.
//
// 🔴 WHY THE CURRENT PASSWORD IS ASKED FOR AT ALL.
// supabase.auth.updateUser({ password }) does not require it — the session is
// proof enough for Supabase. But our people are treasurers and secretaries
// working on a shared society computer that stays signed in for weeks; without
// this field, anyone who walks past an open browser owns the account. The check
// is a signInWithPassword() for the SAME account, so a wrong current password
// costs nothing and changes nothing.
//
// The rules for the new password come from passwordRequirementProblem() in
// ../login/glass — the same function /login and /reset-password use. There must
// never be a second copy of the password rules: a rule that disagrees with the
// server is how you get "your password is too short" for a password that is
// long enough.
//
// PDPA (Hard Rule 5): no password, email or vendor message is logged. The
// vendor's error text is never shown raw — it can echo the address back.
// ---------------------------------------------------------------------------

export function ChangePasswordRows({ email }: { email: string }) {
  const t = useTriText();
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const inputCls =
    "w-full rounded-md border border-[color:var(--v2-outline-border)] bg-[color:var(--v2-card)] px-3 py-2 text-base text-[color:var(--v2-text)] outline-none transition-[border-color,box-shadow] duration-150 focus:border-[color:var(--v2-primary)] focus:shadow-[0_0_0_3px_rgba(91,75,214,0.18)]";

  function close() {
    setOpen(false);
    setCurrent("");
    setNext("");
    setConfirm("");
    setError(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const problem = passwordRequirementProblem(next);
    if (problem === "length") {
      setError(
        t(
          `Kata laluan baharu sekurang-kurangnya ${MIN_PASSWORD_LENGTH} aksara`,
          `新密码至少 ${MIN_PASSWORD_LENGTH} 个字符`,
          `The new password must be at least ${MIN_PASSWORD_LENGTH} characters`,
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
    if (next !== confirm) {
      setError(
        t(
          "Kata laluan baharu tidak sama — taip semula",
          "两次输入的新密码不一样——请重新输入",
          "The two new passwords do not match — type it again",
        ),
      );
      return;
    }
    if (next === current) {
      setError(
        t(
          "Kata laluan baharu sama dengan yang lama — pilih yang lain",
          "新密码和旧密码一样——请换一个",
          "The new password is the same as the old one — choose a different one",
        ),
      );
      return;
    }

    setBusy(true);
    try {
      const supabase = getSupabaseBrowser();

      // Step 1 — prove it is really this person. Same account, so a success
      // here just refreshes the session they already had.
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password: current,
      });
      if (signInError) {
        setError(
          t(
            "Kata laluan sekarang tidak betul. Kalau anda terlupa, log keluar dan guna “Terlupa kata laluan?” di skrin log masuk.",
            "现在的密码不对。如果忘记了，请登出，在登录页用「忘记密码？」。",
            "That current password is not right. If you have forgotten it, sign out and use “Forgot password?” on the sign-in screen.",
          ),
        );
        return;
      }

      // Step 2 — set the new one.
      const { error: updateError } = await supabase.auth.updateUser({
        password: next,
      });
      if (updateError) {
        setError(
          t(
            "Tidak berjaya menukar kata laluan — cuba sekali lagi.",
            "密码更改失败——请再试一次。",
            "Could not change the password — please try again.",
          ),
        );
        return;
      }

      setCurrent("");
      setNext("");
      setConfirm("");
      setOpen(false);
      setDone(true);
    } catch {
      setError(
        t(
          "Sambungan internet terputus. Cuba sekali lagi.",
          "网络断了。请再试一次。",
          "The internet connection dropped. Please try again.",
        ),
      );
    } finally {
      setBusy(false);
    }
  }

  // Collapsed: one row with one button, like every other row on the page.
  if (!open) {
    return (
      <SettingsRow
        label={<Tri bm="Kata laluan" zh="密码" en="Password" />}
        help={
          <Tri
            bm="Tukar kata laluan yang anda guna untuk log masuk ke MinitAI. Anda perlu tahu kata laluan sekarang. Kalau anda terlupa, log keluar dan guna “Terlupa kata laluan?” di skrin log masuk."
            zh="更改您登入 MinitAI 用的密码。要先知道现在的密码。如果忘记了，请登出，在登录页用「忘记密码？」。"
            en="Change the password you use to sign in to MinitAI. You need to know the current one. If you have forgotten it, sign out and use “Forgot password?” on the sign-in screen."
          />
        }
      >
        <div className="flex flex-col items-start gap-2">
          {done && (
            <p className="rounded-md border-2 border-green-400 bg-green-50 px-3 py-2 text-sm font-medium text-green-900 dark:bg-green-400/10 dark:text-green-100">
              ✓{" "}
              <Tri
                bm="Kata laluan sudah ditukar."
                zh="密码已经换好了。"
                en="Password changed."
              />
            </p>
          )}
          <Button type="button" variant="outline" onClick={() => setOpen(true)}>
            <Tri bm="Tukar kata laluan…" zh="更改密码…" en="Change password…" />
          </Button>
        </div>
      </SettingsRow>
    );
  }

  // Open: the form takes the whole row. Three password boxes side by side with
  // a label column would be unusable on a phone.
  return (
    <SettingsBlock>
      <form onSubmit={submit} className="flex flex-col gap-4">
        {/* Hidden, but present: password managers need the account this form
            belongs to in order to offer and then update the entry. */}
        <input
          type="email"
          name="email"
          value={email}
          readOnly
          hidden
          autoComplete="username"
        />

        <p className="text-base font-semibold">
          <Tri bm="Tukar kata laluan" zh="更改密码" en="Change password" />
        </p>

        <label className="flex flex-col gap-1">
          <span className="text-base font-semibold">
            <Tri bm="Kata laluan sekarang" zh="现在的密码" en="Current password" />
          </span>
          <PasswordInput
            autoComplete="current-password"
            value={current}
            onChange={setCurrent}
            className={inputCls}
            required
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-base font-semibold">
            <Tri bm="Kata laluan baharu" zh="新密码" en="New password" />
          </span>
          <PasswordInput
            autoComplete="new-password"
            value={next}
            onChange={setNext}
            className={inputCls}
            required
            minLength={MIN_PASSWORD_LENGTH}
          />
          <span className="text-sm leading-relaxed text-muted-foreground">
            <Tri
              bm={`${MIN_PASSWORD_LENGTH} aksara ke atas, dengan huruf besar, huruf kecil, nombor dan simbol (contoh: Bulan#2026)`}
              zh={`${MIN_PASSWORD_LENGTH} 个字符以上，要有大写字母、小写字母、数字和符号（例如：Bulan#2026）`}
              en={`${MIN_PASSWORD_LENGTH}+ characters with an uppercase letter, a lowercase letter, a number and a symbol (e.g. Bulan#2026)`}
            />
          </span>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-base font-semibold">
            <Tri
              bm="Taip kata laluan baharu sekali lagi"
              zh="再输入一次新密码"
              en="Type the new password again"
            />
          </span>
          <PasswordInput
            autoComplete="new-password"
            value={confirm}
            onChange={setConfirm}
            className={inputCls}
            required
            minLength={MIN_PASSWORD_LENGTH}
          />
        </label>

        {error && (
          <p className="rounded-md border-2 border-red-300 bg-red-50 p-3 text-base font-medium text-red-900 dark:bg-red-400/10 dark:text-red-100">
            {error}
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={busy}>
            {busy ? (
              <Tri bm="Sebentar…" zh="请稍候…" en="One moment…" />
            ) : (
              <Tri
                bm="Simpan kata laluan baharu"
                zh="保存新密码"
                en="Save the new password"
              />
            )}
          </Button>
          <Button type="button" variant="outline" onClick={close} disabled={busy}>
            <Tri bm="Batal" zh="取消" en="Cancel" />
          </Button>
        </div>
      </form>
    </SettingsBlock>
  );
}

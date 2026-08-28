"use client";

import { useId, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { useTriText } from "@/components/language-provider";

// ---------------------------------------------------------------------------
// A password box with an eye button, used by EVERY password field in Minit:
// /login (sign in, sign up, confirm), /reset-password (both), and
// /settings → Kata laluan (all three).
//
// 2026-08-22, J after signing in for real: "如果可以做加一个眼睛那样让 user
// confirm 他们 type 了什么就更好".
//
// 🔴 WHY THIS IS NOT A NICETY. Our rule is 8+ characters with an uppercase, a
// lowercase, a digit AND a symbol — a password nobody types right first time on
// a phone keyboard, where the symbol lives two layers deep. Dots-only feedback
// turns that into guesswork, and the person who guesses wrong at SIGN-UP does
// not find out until they are locked out of the account holding the society's
// paperwork. "Type it twice" catches the typo; the eye is what lets someone
// SEE what they got wrong instead of retyping both boxes blind.
//
// The button is a real <button type="button">: inside a <form> a bare <button>
// submits, which here would mean "reveal the password" also meaning "try to log
// in with the half-typed one".
//
// It never leaves the field revealed by accident on the next visit — the state
// is per-mount, and the default is always hidden.
// ---------------------------------------------------------------------------

export function PasswordInput({
  value,
  onChange,
  className = "",
  /** "dark" = the glass sign-in surface; "light" = a normal card. */
  tone = "light",
  ...rest
}: {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  tone?: "dark" | "light";
} & Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "value" | "onChange" | "type" | "className"
>) {
  const t = useTriText();
  const [shown, setShown] = useState(false);
  const id = useId();

  const Icon = shown ? EyeOff : Eye;
  const label = shown
    ? t("Sembunyikan kata laluan", "隐藏密码", "Hide password")
    : t("Tunjukkan kata laluan", "显示密码", "Show password");

  return (
    <span className="relative block">
      <input
        {...rest}
        id={rest.id ?? id}
        // Revealed text must NOT keep the wide letter-spacing the dots use, or
        // a long password stops fitting in the box on a phone.
        type={shown ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        // Room for the button. Without it the eye sits on top of the last
        // characters typed — the very ones the person is checking.
        // The wide letter-spacing belongs to the DOTS: it makes a row of • s
        // countable. Real characters keep normal spacing, or a long password
        // stops fitting in the box on a phone — which is the moment someone is
        // most likely to be reading it.
        className={`${className} pr-14 ${shown ? "" : "tracking-[0.08em]"}`}
      />
      <button
        type="button"
        onClick={() => setShown((v) => !v)}
        aria-label={label}
        title={label}
        aria-pressed={shown}
        className={
          // rounded-r-sm, not a literal: the button caps the right edge of
          // the input, so its corner has to be whatever the input's is.
          "absolute inset-y-0 right-0 flex w-14 items-center justify-center rounded-r-sm transition-colors " +
          (tone === "dark"
            ? "text-white/60 hover:text-white"
            : "text-muted-foreground hover:text-foreground")
        }
      >
        <Icon className="h-5 w-5" strokeWidth={1.9} />
      </button>
    </span>
  );
}

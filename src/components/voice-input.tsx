"use client";

// ---------------------------------------------------------------------------
// VOICE INPUT, PLAN A (F-3, 2026-08-25 — promised to J on 8/22, decision #3:
// "兩個都要，A 先").
//
// A microphone button beside a text box: tap, speak, the words land in the
// box. Browser Web Speech API — FREE, on-device/vendor-side per the browser,
// and it never touches our AI quota. The recognition language follows the UI
// language (ms/zh/en; the mixed view dictates in 中文, the default).
//
// GRACEFUL DEGRADATION IS THE CONTRACT: a browser without SpeechRecognition
// (Firefox, many WebViews) renders NOTHING — no dead button, no error. The
// button is labelled 试验中 (experimental) because recognition quality for
// Malaysian speech is unmeasured — exactly the honesty rule the eval numbers
// follow.
//
// PDPA note: the audio goes to the BROWSER's speech vendor (e.g. Google for
// Chrome), not to Minit's servers, and nothing is logged here.
//
// Plan B — recording a whole meeting and turning it into minutes — is a
// separate product line, deliberately after the competition (docs/DECISIONS.md
// D10).
// ---------------------------------------------------------------------------

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Mic, Square } from "lucide-react";
import { useLangs, useTriText } from "@/components/language-provider";
import { htmlLangFor } from "@/lib/lang";

type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
};

/** The capability never changes within a page's lifetime — nothing to watch. */
function subscribeNever(): () => void {
  return () => {};
}

function getRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as Record<string, unknown>;
  const ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  return typeof ctor === "function"
    ? (ctor as new () => SpeechRecognitionLike)
    : null;
}

/** BCP-47 the recognizers actually accept, per UI language. */
function recognitionLang(uiLang: string): string {
  switch (uiLang) {
    case "zh-CN":
      return "cmn-Hans-CN";
    case "en":
      return "en-MY";
    default:
      return "ms-MY";
  }
}

export function VoiceButton({
  onText,
  className,
}: {
  /** Called with the recognised words (one utterance). */
  onText: (text: string) => void;
  className?: string;
}) {
  const { mode } = useLangs();
  const t = useTriText();
  // Hydration-safe capability check WITHOUT a setState-in-effect: the server
  // snapshot says false (renders nothing), the client snapshot answers the
  // real question, and React reconciles the difference after hydration.
  const supported = useSyncExternalStore(
    subscribeNever,
    () => getRecognitionCtor() !== null,
    () => false,
  );
  const [listening, setListening] = useState(false);
  const [failed, setFailed] = useState(false);
  const recRef = useRef<SpeechRecognitionLike | null>(null);

  // Stop dictation when the row unmounts (Save/Cancel pressed mid-listen).
  useEffect(() => {
    return () => {
      recRef.current?.stop();
    };
  }, []);

  if (!supported) return null;

  function toggle() {
    if (listening) {
      recRef.current?.stop();
      return;
    }
    const Ctor = getRecognitionCtor();
    if (!Ctor) return;
    setFailed(false);
    const rec = new Ctor();
    recRef.current = rec;
    rec.lang = recognitionLang(htmlLangFor(mode));
    rec.interimResults = false;
    rec.continuous = false;
    rec.onresult = (event) => {
      const transcript = Array.from(
        { length: event.results.length },
        (_, i) => event.results[i]?.[0]?.transcript ?? "",
      )
        .join(" ")
        .trim();
      if (transcript !== "") onText(transcript);
    };
    rec.onerror = () => {
      // Mic denied, no speech, network — the box still works by typing, so a
      // quiet flag beats an alert.
      setFailed(true);
    };
    rec.onend = () => setListening(false);
    try {
      rec.start();
      setListening(true);
    } catch {
      setFailed(true);
    }
  }

  return (
    <span className={`inline-flex items-center gap-1 ${className ?? ""}`}>
      <button
        type="button"
        onClick={toggle}
        aria-pressed={listening}
        title={
          t("Cakap, Minit taip", "开口说，Minit 帮您打字", "Speak, Minit types") +
          " · " +
          t("percubaan", "试验中", "experimental")
        }
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border transition-colors ${
          listening
            ? "border-red-400 bg-red-50 text-red-600 dark:bg-red-400/15"
            : "border-[color:var(--v2-outline-border)] text-[color:var(--v2-text-soft)] hover:bg-[color:var(--v2-primary-soft)]"
        }`}
      >
        {listening ? (
          <Square className="h-4 w-4" strokeWidth={2.4} />
        ) : (
          <Mic className="h-5 w-5" strokeWidth={2} />
        )}
      </button>
      {listening && (
        <span className="text-sm font-medium text-red-600">
          {t("Mendengar…", "正在听……", "Listening…")}
        </span>
      )}
      {failed && !listening && (
        <span className="text-sm text-[color:var(--v2-text-soft)]">
          {t("Tidak dengar — taip sahaja", "没听到 —— 用打字也行", "Could not hear — just type")}
        </span>
      )}
    </span>
  );
}

"use client";

import { useLangs } from "@/components/language-provider";

// ---------------------------------------------------------------------------
// The 3-step "how it works" strip for first-time users. On a first run
// (no org / no activity yet) the home page shows it above the fold as the
// onboarding; once there is real activity it moves below the dashboard.
// ---------------------------------------------------------------------------

const STEPS = [
  { icon: "📷", bm: "Ambil gambar", zh: "拍照上传", en: "Take a photo" },
  { icon: "✅", bm: "Semak & sahkan", zh: "检查确认", en: "Check & confirm" },
  { icon: "📄", bm: "Muat turun & hantar", zh: "下载发送", en: "Download & send" },
];

export function HowItWorks() {
  const { prefs } = useLangs();
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {STEPS.map((s, i) => (
        <div key={i} className="v2-glass flex items-center gap-4 rounded-3xl p-4">
          <div className="relative">
            <div className="text-4xl">{s.icon}</div>
            <div className="absolute -left-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-[#5b4bd6] to-[#6f5ef2] text-sm font-bold text-white">
              {i + 1}
            </div>
          </div>
          <div className="leading-snug">
            {prefs.bm && <div className="font-semibold">{s.bm}</div>}
            {prefs.zh && <div className="font-medium">{s.zh}</div>}
            {prefs.en && <div className="text-sm text-muted-foreground">{s.en}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}

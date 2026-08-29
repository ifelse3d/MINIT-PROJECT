"use client";

// The new-organisation GUIDED SEQUENCE (H3, work order 69 §1-6, J: 建好 org →
// 引導頁順序帶「上傳章程 → 建名冊 → Maklumat Am」，每步可「稍後填」但要
// 按了才跳過 — not suggestions scattered across pages for people to discover).
//
// One page, three sequential cards (StepCard territory: several sub-sections
// of ONE job — Hard Rule 13 keeps this pattern for exactly this). DONE is
// derived from the DATABASE (a constitution row, a roster row, a recorded
// phone/financial year), so doing the task on its own page and coming back
// advances the sequence by itself. SKIPPED is a per-device convenience
// (localStorage) — skipping is an explicit button, never the default.

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Tri } from "@/components/language-provider";
import {
  BankInlineForm,
  MaklumatInlineForm,
} from "@/app/filings/eroses/penyata/flow-ui";

export type WelcomeFacts = {
  orgId: number;
  orgName: string;
  canManage: boolean;
  hasConstitution: boolean;
  rosterCount: number;
  maklumatDone: boolean;
  maklumat: {
    phone: string | null;
    financialYearStart: string | null;
    membersRegistered: number | null;
    membersVoting: number | null;
    banks: { id: number; bankName: string; accountNo: string }[];
  } | null;
};

type StepId = "perlembagaan" | "ajk" | "maklumat";

const skipKey = (orgId: number) => `minit.welcome.skip.${orgId}`;

function readSkips(orgId: number): StepId[] {
  try {
    const raw = localStorage.getItem(skipKey(orgId));
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.filter((s): s is StepId =>
          s === "perlembagaan" || s === "ajk" || s === "maklumat",
        )
      : [];
  } catch {
    return [];
  }
}

export function WelcomeFlow(f: WelcomeFacts) {
  const [skips, setSkips] = useState<StepId[]>([]);
  useEffect(() => {
    // Read AFTER mount (SSR knows no localStorage — §6 trap), via the
    // baseline-sanctioned setTimeout(0).
    const timer = setTimeout(() => setSkips(readSkips(f.orgId)), 0);
    return () => clearTimeout(timer);
  }, [f.orgId]);

  function skip(step: StepId) {
    const next = [...new Set([...skips, step])];
    setSkips(next);
    try {
      localStorage.setItem(skipKey(f.orgId), JSON.stringify(next));
    } catch {
      // storage unavailable — the skip still works for this visit
    }
  }

  const steps: {
    id: StepId;
    icon: string;
    done: boolean;
    title: { bm: string; zh: string; en: string };
    body: React.ReactNode;
    cta?: { href: string; bm: string; zh: string; en: string };
  }[] = [
    {
      id: "perlembagaan",
      icon: "📜",
      done: f.hasConstitution,
      title: {
        bm: "Muat naik perlembagaan",
        zh: "上传章程",
        en: "Upload the constitution",
      },
      body: (
        <Tri
          bm="MinitAI membacanya sekali dan selepas itu boleh menjawab soalan fasal, menyemak nama rasmi pertubuhan, dan tahu berapa AJK yang perlembagaan anda mahukan."
          zh="MinitAI 读一次之后：章程问题有得问、机构注册名对得上、理事该有几人它也知道。"
          en="MinitAI reads it once — then clause questions get answers, the registered name is checkable, and it knows how many committee members your constitution wants."
        />
      ),
      cta: {
        href: "/constitution",
        bm: "Muat naik sekarang",
        zh: "现在去上传",
        en: "Upload it now",
      },
    },
    {
      id: "ajk",
      icon: "👥",
      done: f.rosterCount > 0,
      title: {
        bm: "Masukkan senarai AJK",
        zh: "建理事名册",
        en: "Bring in the committee roster",
      },
      body: (
        <Tri
          bm="Senarai ini masuk ke eROSES. Ada butang “＋ Tambah jawatan biasa” untuk mula dengan jawatan standard, borang Excel untuk senarai sedia ada, atau taip seorang demi seorang."
          zh="这份名单会进 eROSES。有「＋ 加常见职位」一键起表、Excel 表格带入现成名单，也可以一个一个打。"
          en="This list goes into eROSES. There is an “Add the common positions” button, an Excel form for an existing list, or type them one by one."
        />
      ),
      cta: {
        href: "/members",
        bm: "Buka senarai AJK",
        zh: "去建名册",
        en: "Open the roster",
      },
    },
    {
      id: "maklumat",
      icon: "☎️",
      done: f.maklumatDone,
      title: {
        bm: "Maklumat Am (telefon · tahun kewangan · bank)",
        zh: "机构基本资料（电话 · 财年 · 银行）",
        en: "Maklumat Am (phone · financial year · bank)",
      },
      body: f.canManage && f.maklumat ? (
        <div className="flex flex-col gap-3">
          <p className="text-base text-muted-foreground">
            <Tri
              bm="eROSES memintanya setiap tahun — isi TERUS di sini."
              zh="eROSES 每年都会要这些 —— 直接在这里填。"
              en="eROSES asks for these every year — fill them RIGHT HERE."
            />
          </p>
          <MaklumatInlineForm
            phone={f.maklumat.phone}
            financialYearStart={f.maklumat.financialYearStart}
            membersRegistered={f.maklumat.membersRegistered}
            membersVoting={f.maklumat.membersVoting}
          />
          <div className="flex flex-col gap-2 rounded-md border border-[color:var(--v2-outline-border)] p-3">
            <p className="text-sm font-medium">
              <Tri bm="Akaun bank pertubuhan" zh="机构银行户口" en="The society's bank accounts" />
            </p>
            {f.maklumat.banks.map((b) => (
              <p key={b.id} className="text-base">
                {b.bankName} · <span className="font-mono">{b.accountNo}</span>
              </p>
            ))}
            <BankInlineForm />
          </div>
        </div>
      ) : (
        <Tri
          bm="eROSES memintanya setiap tahun. Hanya pentadbir pertubuhan boleh mengisinya (Tetapan → Pertubuhan)."
          zh="eROSES 每年都会要这些。要机构管理员才能填（设置 → 机构）。"
          en="eROSES asks for these every year. An organisation admin fills them in (Settings → Organisation)."
        />
      ),
    },
  ];

  const currentIndex = steps.findIndex((s) => !s.done && !skips.includes(s.id));
  const allSettled = currentIndex === -1;

  return (
    <div className="flex flex-col gap-4" data-probe="welcome-flow">
      {steps.map((s, i) => {
        const state = s.done
          ? "done"
          : skips.includes(s.id)
            ? "skipped"
            : i === currentIndex
              ? "current"
              : "later";
        return (
          <div
            key={s.id}
            data-probe={`welcome-${s.id}`}
            data-state={state}
            className={
              "rounded-md border-2 p-4 transition " +
              (state === "current"
                ? "border-[color:var(--v2-primary)] bg-[color:var(--v2-card)]"
                : state === "done"
                  ? "border-green-400/60 bg-green-50/50 dark:bg-green-400/10"
                  : "border-[color:var(--v2-border)] bg-[color:var(--v2-card)] opacity-70")
            }
          >
            <div className="flex flex-wrap items-center gap-2 text-lg font-semibold">
              <span aria-hidden>{s.icon}</span>
              <span>
                {i + 1}. <Tri bm={s.title.bm} zh={s.title.zh} en={s.title.en} />
              </span>
              {state === "done" && (
                <span className="text-base font-medium text-green-700 dark:text-green-300">
                  ✓ <Tri bm="Siap" zh="做好了" en="Done" />
                </span>
              )}
              {state === "skipped" && (
                <span className="text-base font-medium text-muted-foreground">
                  <Tri bm="Dilangkau — bila-bila boleh" zh="先跳过了 —— 随时可回来" en="Skipped — any time" />
                </span>
              )}
            </div>
            {state === "current" && (
              <div className="mt-3 flex flex-col gap-3 text-base">
                {s.body}
                <div className="flex flex-wrap gap-2">
                  {s.cta && (
                    <Button asChild>
                      <Link href={s.cta.href}>
                        <Tri bm={s.cta.bm} zh={s.cta.zh} en={s.cta.en} /> →
                      </Link>
                    </Button>
                  )}
                  {/* §1-6: skipping is a BUTTON, never the default. */}
                  <Button type="button" variant="outline" onClick={() => skip(s.id)}>
                    <Tri bm="Isi kemudian" zh="稍后填" en="Fill in later" />
                  </Button>
                </div>
                {s.cta && (
                  <p className="text-sm text-muted-foreground">
                    <Tri
                      bm="Selepas siap di halaman itu, kembali ke sini — langkah ini akan bertanda ✓ sendiri."
                      zh="在那页做完回到这里，这一步会自动打 ✓。"
                      en="Finish on that page and come back — this step ticks itself."
                    />
                  </p>
                )}
              </div>
            )}
            {state === "skipped" && (
              <div className="mt-2">
                {s.cta ? (
                  <Link href={s.cta.href} className="text-sm underline underline-offset-4">
                    <Tri bm={s.cta.bm} zh={s.cta.zh} en={s.cta.en} /> →
                  </Link>
                ) : (
                  <button
                    type="button"
                    className="text-sm underline underline-offset-4"
                    onClick={() => {
                      const next = skips.filter((x) => x !== s.id);
                      setSkips(next);
                      try {
                        localStorage.setItem(skipKey(f.orgId), JSON.stringify(next));
                      } catch {
                        // storage unavailable — in-memory is enough
                      }
                    }}
                  >
                    <Tri bm="Buka semula langkah ini" zh="重新打开这一步" en="Reopen this step" />
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}

      {allSettled && (
        <div className="v2-glass flex flex-col gap-3 border-2 border-green-400/60 p-5" data-probe="welcome-done">
          <p className="text-xl font-semibold">
            🎉{" "}
            <Tri
              bm="Sedia! Pertubuhan anda lengkap untuk mula bekerja."
              zh="齐了！机构的底子都打好了。"
              en="Ready! Your organisation's groundwork is in."
            />
          </p>
          <div className="flex flex-wrap gap-2">
            <Button asChild>
              <Link href="/">
                <Tri bm="Ke halaman utama" zh="去主页开工" en="Go to the home page" /> →
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/minutes">
                <Tri bm="Rekod mesyuarat pertama" zh="记第一场会议" en="Record the first meeting" /> →
              </Link>
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

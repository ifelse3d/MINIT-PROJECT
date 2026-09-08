"use client";

// 130 §14-2 (119 A-7): the model bench behind a button — see bench-actions.ts
// for the rules. The card's whole job is to say the price BEFORE the reads and
// to make J press a second, explicit button to spend it.

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Tri, useTriText } from "@/components/language-provider";
import { MODEL_PRICES } from "@/lib/unit-economics";
import { compressPhoto } from "@/app/minutes/minutes-storage";
import {
  adminBenchModels,
  adminBenchRead,
  type BenchModelInfo,
  type BenchReadResult,
} from "./bench-actions";

/** The estimate's assumed size of one read — the same figures the terminal
 *  bench uses (bench-real-pages.ts): a 1280px photo plus the prompt in, a
 *  full extraction out. Real cost is what the vendor bills. */
const EST_INPUT_TOKENS = 7_000;
const EST_OUTPUT_TOKENS = 2_500;

function estimateUsd(spec: string): number | null {
  const model = spec.split(":").slice(1).join(":");
  for (const p of Object.values(MODEL_PRICES)) {
    if (p.name === model || p.name.startsWith(`${model} `)) {
      return (EST_INPUT_TOKENS / 1e6) * p.inputPerMTok + (EST_OUTPUT_TOKENS / 1e6) * p.outputPerMTok;
    }
  }
  return null;
}

type Page = { name: string; dataUrl: string };

export function BenchCard() {
  const t = useTriText();
  const [models, setModels] = useState<BenchModelInfo[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [pages, setPages] = useState<Page[]>([]);
  const [orgName, setOrgName] = useState("");
  const [armed, setArmed] = useState(false);
  const [running, setRunning] = useState<string | null>(null);
  const [results, setResults] = useState<(BenchReadResult & { page: string })[]>([]);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void adminBenchModels().then((r) => {
      if (cancelled) return;
      if ("error" in r) {
        setModels([]);
        return;
      }
      setModels(r);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const reads = pages.length * picked.size;
  const estimates = [...picked].map((spec) => estimateUsd(spec));
  const estTotal = estimates.some((e) => e === null)
    ? null
    : estimates.reduce<number>((n, e) => n + (e ?? 0), 0) * pages.length;

  async function stage(list: FileList | null) {
    if (!list) return;
    const next: Page[] = [];
    for (const f of Array.from(list).slice(0, 3)) {
      const dataUrl = await compressPhoto(f);
      if (dataUrl) next.push({ name: f.name, dataUrl });
    }
    setPages(next);
    setArmed(false);
    setResults([]);
  }

  async function run() {
    if (running || reads === 0) return;
    setNote(null);
    setResults([]);
    for (const page of pages) {
      for (const spec of picked) {
        setRunning(`${page.name} · ${spec}`);
        const comma = page.dataUrl.indexOf(",");
        const mimeType = page.dataUrl.slice(5, page.dataUrl.indexOf(";"));
        const r = await adminBenchRead({
          spec,
          imageBase64: page.dataUrl.slice(comma + 1),
          mimeType,
          orgName,
        });
        if ("error" in r && !("ok" in r)) {
          setNote(
            r.error === "not_admin"
              ? t("Akaun ini bukan pentadbir platform.", "这个账号不是平台管理员。", "This account is not a platform admin.")
              : t("Permintaan ditolak.", "请求被拒绝。", "The request was refused."),
          );
          setRunning(null);
          setArmed(false);
          return;
        }
        setResults((prev) => [...prev, { ...(r as BenchReadResult), page: page.name }]);
      }
    }
    setRunning(null);
    setArmed(false);
  }

  const spent = results.reduce<number | null>(
    (n, r) => (n === null || r.costMicros === null ? null : n + r.costMicros),
    0,
  );

  return (
    <div className="rounded-md border border-input bg-white/40 p-4 dark:bg-white/5">
      <p className="text-base font-semibold">
        🧪 <Tri bm="Ujian model — baca satu muka surat dengan beberapa model" zh="模型测试 —— 用几颗模型读同一页" en="Model test — read one page with several models" />
      </p>
      <p className="mt-1 text-sm text-muted-foreground">
        <Tri
          bm="Bacaan yang SAMA seperti /api/intake, sekali setiap (muka surat × model). Wang sebenar — anggaran ditunjukkan dahulu, dan bacaan hanya bermula selepas anda mengesahkan. Untuk perbandingan penuh (setiap model dua kali, jadual untuk dibaca), gunakan bench-models.bat."
          zh="跟 /api/intake 一样的读法，每（页 × 模型）读一次。真钱 —— 先给估价，您确认了才开始读。要完整比较（每颗读两次、留表慢慢看），用 bench-models.bat。"
          en="The SAME read /api/intake does, once per (page × model). Real money — the estimate is shown first, and nothing reads until you confirm. For the full comparison (each model twice, a table to read), use bench-models.bat."
        />
      </p>

      <div className="mt-4 grid gap-3 @3xl:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">
            <Tri bm="Muka surat (gambar, sehingga 3)" zh="页面（照片，最多 3 张）" en="Pages (photos, up to 3)" />
          </span>
          <input type="file" accept="image/*" multiple onChange={(e) => void stage(e.target.files)} className="text-sm" />
          {pages.length > 0 && (
            <span className="text-xs text-muted-foreground">{pages.map((p) => p.name).join(" · ")}</span>
          )}
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">
            <Tri bm="Nama pertubuhan (untuk prompt)" zh="机构名（给 prompt 用）" en="Organisation name (for the prompt)" />
          </span>
          <input value={orgName} onChange={(e) => setOrgName(e.target.value)} className="h-10 rounded-sm border bg-background px-3" maxLength={120} />
        </label>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {models === null && <span className="text-sm text-muted-foreground">…</span>}
        {models?.map((m) => (
          <label key={m.spec} className={`inline-flex min-h-11 items-center gap-2 rounded-md border-2 px-3 text-sm ${m.keyPresent ? "" : "opacity-50"}`}>
            <input
              type="checkbox"
              disabled={!m.keyPresent || running !== null}
              checked={picked.has(m.spec)}
              onChange={(e) => {
                const next = new Set(picked);
                if (e.target.checked) next.add(m.spec);
                else next.delete(m.spec);
                setPicked(next);
                setArmed(false);
              }}
            />
            <span>{m.spec}</span>
            {!m.keyPresent && (
              <span className="text-xs">
                <Tri bm="(tiada kunci)" zh="（没有 key）" en="(no key)" />
              </span>
            )}
            {estimateUsd(m.spec) !== null && (
              <span className="text-xs text-muted-foreground">≈US${estimateUsd(m.spec)!.toFixed(3)}/read</span>
            )}
          </label>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <span className="text-sm" data-probe="bench-estimate">
          <Tri
            bm={`${reads} bacaan · anggaran ${estTotal === null ? "tidak diketahui" : `US$${estTotal.toFixed(3)}`}`}
            zh={`${reads} 次读取 · 估计 ${estTotal === null ? "不明" : `US$${estTotal.toFixed(3)}`}`}
            en={`${reads} read(s) · estimated ${estTotal === null ? "unknown" : `US$${estTotal.toFixed(3)}`}`}
          />
        </span>
        {!armed ? (
          <Button type="button" variant="outline" disabled={reads === 0 || running !== null} onClick={() => setArmed(true)}>
            <Tri bm="Saya faham kosnya — teruskan" zh="我知道要花这笔钱 —— 下一步" en="I understand the cost — next" />
          </Button>
        ) : (
          <Button type="button" disabled={running !== null} onClick={() => void run()} data-probe="bench-confirm">
            <Tri
              bm={`Sahkan: belanja ≈${estTotal === null ? "?" : `US$${estTotal.toFixed(3)}`} sekarang`}
              zh={`确认：现在花 ≈${estTotal === null ? "?" : `US$${estTotal.toFixed(3)}`}`}
              en={`Confirm: spend ≈${estTotal === null ? "?" : `US$${estTotal.toFixed(3)}`} now`}
            />
          </Button>
        )}
        {running && <span className="text-sm text-muted-foreground">⏳ {running}</span>}
      </div>
      {note && <p className="mt-2 text-sm text-red-700">{note}</p>}

      {results.length > 0 && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="py-1 pr-3">
                  <Tri bm="Muka surat" zh="页" en="Page" />
                </th>
                <th className="py-1 pr-3">Model</th>
                <th className="py-1 pr-3">
                  <Tri bm="Masa" zh="时间" en="Time" />
                </th>
                <th className="py-1 pr-3">US$</th>
                <th className="py-1 pr-3">
                  <Tri bm="Kepala" zh="抬头" en="Header" />
                </th>
                <th className="py-1 pr-3">
                  <Tri bm="Hadir/maaf" zh="出席/请假" en="Present/apol." />
                </th>
                <th className="py-1 pr-3">
                  <Tri bm="Kiraan" zh="人数句" en="Headcount" />
                </th>
                <th className="py-1 pr-3">
                  <Tri bm="Perkara" zh="事项" en="Items" />
                </th>
                <th className="py-1 pr-3">
                  <Tri bm="Angka" zh="数字" en="Figures" />
                </th>
                <th className="py-1 pr-3">AJK</th>
                <th className="py-1 pr-3">
                  <Tri bm="Perlu semak" zh="要核对" en="To check" />
                </th>
              </tr>
            </thead>
            <tbody>
              {results.map((r, i) => (
                <tr key={i} className="border-t">
                  <td className="py-1 pr-3">{r.page}</td>
                  <td className="py-1 pr-3">{r.spec}</td>
                  <td className="py-1 pr-3 tabular-nums">{(r.elapsedMs / 1000).toFixed(1)}s{r.elapsedMs > 20_000 ? " ⚠" : ""}</td>
                  <td className="py-1 pr-3 tabular-nums">{r.costMicros === null ? "?" : (r.costMicros / 1e6).toFixed(4)}</td>
                  {r.ok ? (
                    <>
                      <td className="py-1 pr-3">{r.summary.fieldsRead}/6</td>
                      <td className="py-1 pr-3">{r.summary.attendees}/{r.summary.apologies}</td>
                      <td className="py-1 pr-3">{r.summary.headcountCounted ? "✓" : "—"}</td>
                      <td className="py-1 pr-3">{r.summary.resolutions}</td>
                      <td className="py-1 pr-3">{r.summary.figures}</td>
                      <td className="py-1 pr-3">{r.summary.officeBearers}</td>
                      <td className="py-1 pr-3">{r.summary.checkFields}</td>
                    </>
                  ) : (
                    <td className="py-1 pr-3 text-red-700" colSpan={7}>
                      ✗ {r.error}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-muted-foreground">
            <Tri
              bm={`Dibelanjakan: ${spent === null ? "sebahagian tidak berharga" : `US$${(spent / 1e6).toFixed(4)}`}. ⚠ = lebih 20 saat (dinding laluan langsung). Jadual ini tidak disimpan.`}
              zh={`已花：${spent === null ? "部分无价格" : `US$${(spent / 1e6).toFixed(4)}`}。⚠ = 超过 20 秒（线上路由的墙）。这张表不会保存。`}
              en={`Spent: ${spent === null ? "partly unpriced" : `US$${(spent / 1e6).toFixed(4)}`}. ⚠ = over 20s (the live route's wall). This table is not stored.`}
            />
          </p>
        </div>
      )}
    </div>
  );
}

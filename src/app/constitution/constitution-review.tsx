"use client";

import Link from "next/link";

import { useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Tri, useTriText } from "@/components/language-provider";
import { PdpaNote } from "@/components/pdpa-note";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  buildRefusalBm,
  filterClauses,
  findNoticePeriodDays,
  mergeClauses,
  QA_DISCLAIMER_BM,
  QA_DISCLAIMER_EN,
  QA_DISCLAIMER_ZH,
  type ClauseMatch,
} from "@/lib/constitution";
import type { ConfirmedClause } from "@/lib/constitution";
import type { ConstitutionExtraction } from "@/lib/extraction";
import { usePersistentState } from "@/lib/use-persistent-state";
import { useScopedKey } from "@/lib/storage-scope";
import { consumeIntake } from "@/lib/intake-handoff";
import { saveConstitutionClauses } from "./actions";
import { NewOrgBanner } from "./new-org-banner";
import { OrgIdentityPanel } from "./org-identity-panel";
import { joinUserError, USER_ERRORS } from "@/lib/user-errors";
import {
  sampleClauses,
  sampleConstitutionTitle,
  sampleQuestions,
} from "@/lib/sample-constitution";

// ---------------------------------------------------------------------------
// CONSTITUTION screen. The keyword filter, citations and the refusal rule are
// the real, unit-tested functions. The eROSES test: asking a question in your own
// words is allowed input — it is not form-filling. The screen NEVER shows an
// answer without a cited clause.
//
// 2026-07-28 AUDIT FIX — the app's biggest promise gap.
// The home page has always offered "photograph your constitution", and this page
// had NO file input at all: the user landed here and could never upload one, with
// no error and no explanation. Worse, the Q&A answered from `sampleClauses` — a
// FICTIONAL constitution — while the card printed "Every answer cites the real
// clause", and /api/ask told users "the Constitution page answers it, citing the
// real clause" (and charged an AI action to say so).
//
// The camera is now here. Extracted clauses REPLACE the sample ones and persist
// on the device; the screen states plainly which of the two it is answering from.
// ---------------------------------------------------------------------------

/** localStorage key for the clauses read off this device's own constitution. */
/** Pre-S0-4 global key — adopted into the scoped key once, then removed. */
const CONSTITUTION_LEGACY_KEY = "minit.constitution.v1";

type StoredConstitution = {
  title: string;
  clauses: ConfirmedClause[];
  /** The file the clauses were read from, shown so the user can tell. */
  sourceLabel: string;
};

/** Shape guard for the stored blob (see usePersistentState). */
function isStoredConstitution(parsed: unknown): boolean {
  if (typeof parsed !== "object" || parsed === null) return false;
  const r = parsed as Record<string, unknown>;
  if (typeof r.title !== "string" || typeof r.sourceLabel !== "string") return false;
  if (!Array.isArray(r.clauses)) return false;
  return r.clauses.every((c) => {
    if (typeof c !== "object" || c === null) return false;
    const x = c as Record<string, unknown>;
    return (
      typeof x.clause_no === "string" &&
      typeof x.heading === "string" &&
      typeof x.text === "string" &&
      typeof x.page_ref === "string"
    );
  });
}

/**
 * Extraction → confirmed clauses.
 *
 * Hard Rule 1: a clause whose TEXT the model could not read is DROPPED, not
 * guessed at. A constitution clause has legal meaning and must be verbatim, so a
 * half-read one is worse than an absent one — the refusal path already handles
 * "I cannot find that in your constitution" honestly.
 */
function clausesFromExtraction(e: ConstitutionExtraction): ConfirmedClause[] {
  return e.clauses
    .filter(
      (c) =>
        c.clause_no.confidence !== "missing" &&
        c.clause_no.value !== "" &&
        c.text.confidence !== "missing" &&
        c.text.value !== "",
    )
    .map((c) => ({
      clause_no: c.clause_no.value,
      heading: c.heading.confidence === "missing" ? "" : c.heading.value,
      text: c.text.value,
      page_ref: c.page_ref.confidence === "missing" ? "" : c.page_ref.value,
    }));
}

type AskResult =
  | { kind: "matches"; question: string; matches: ClauseMatch[] }
  | { kind: "refusal"; question: string; text: string };

export function ConstitutionReview({
  initialQuestion = "",
  orgClauses = [],
  justCreatedOrg = false,
  orgName = null,
  orgId = null,
}: {
  /** Pre-filled by "Tanya Minit" (?q=…) — asked automatically on arrival. */
  initialQuestion?: string;
  /**
   * The organisation's stored clauses, read on the server (2026-08-05).
   *
   * This is what makes the constitution survive a change of device. It seeds a
   * browser that has nothing; it never overwrites a browser that does, because
   * while someone is photographing page 3 the device copy is the newer one.
   */
  orgClauses?: ConfirmedClause[];
  /**
   * True when /orgs/new sent the person straight here after creating their
   * organisation (?setup=1). Adds a banner and nothing else — see
   * new-org-banner.tsx.
   */
  justCreatedOrg?: boolean;
  /** The name Minit currently uses for the active org, for the identity panel. */
  orgName?: string | null;
  /** null when there is no active org — then nothing can be renamed. */
  orgId?: number | null;
}) {
  const [question, setQuestion] = useState(initialQuestion);
  const [result, setResult] = useState<AskResult | null>(null);
  const t = useTriText();

  const [stored, setStored, storeMeta] = usePersistentState<StoredConstitution | null>(
    // S0-4: scoped per user+org — a shared laptop must not show one
    // account's constitution to the next.
    useScopedKey("constitution:v1"),
    null,
    (p) => p === null || isStoredConstitution(p),
    CONSTITUTION_LEGACY_KEY,
  );
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  /** Set when a read succeeded locally but the durable copy did not land. */
  const [saveWarning, setSaveWarning] = useState(false);

  /**
   * Hand the full merged set to the organisation's records.
   *
   * Deliberately fire-and-forget from the caller's point of view: the clauses
   * are already on screen and in localStorage, so a failed save costs
   * durability, not the user's work. It is surfaced rather than swallowed —
   * silently not saving is what made the old localStorage-only behaviour so
   * easy to miss.
   */
  async function persist(clauses: ConfirmedClause[]) {
    try {
      const res = await saveConstitutionClauses({ clauses });
      setSaveWarning(!res.ok);
    } catch {
      setSaveWarning(true);
    }
  }

  /**
   * 2026-07-28 — this page no longer OPENS on the fictional constitution.
   *
   * It used to: `stored === null` meant "use sampleClauses", so a first visit
   * answered questions about notice periods and cheque signatories out of an
   * invented document. Badges and banners were added to warn people, but the
   * page was still doing the dangerous thing by default. Now an empty page is
   * empty, the Q&A is unavailable until a real constitution has been read, and
   * the example is something the person can ask for.
   */
  const [showSample, setShowSample] = useState(false);
  const hasOwn = stored !== null;
  const isSample = !hasOwn && showSample;
  const nothingYet = !hasOwn && !showSample;
  /** The clauses every answer on this page is drawn from. */
  const clauses = hasOwn
    ? stored.clauses
    : isSample
      ? sampleClauses
      : [];
  const title = hasOwn
    ? stored.title
    : isSample
      ? sampleConstitutionTitle
      : "";

  const noticeHit = useMemo(() => findNoticePeriodDays(clauses), [clauses]);

  // Auto-ask the handed-over question once on mount (one-shot, no chat).
  useEffect(() => {
    if (initialQuestion.trim()) ask(initialQuestion);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Did the home page's "one door" just read a constitution page for us?
  // Merge it in the same way an upload on this page would.
  // (2026-07-28: home AskBox → /api/intake → here.)
  useEffect(() => {
    const handed = consumeIntake("constitution");
    if (!handed) return;
    const extraction = handed.extraction as ConstitutionExtraction;
    const read = clausesFromExtraction(extraction);
    if (read.length === 0) return;
    const nextTitle =
      extraction.document_title.confidence !== "missing" &&
      extraction.document_title.value !== ""
        ? extraction.document_title.value
        : t("Perlembagaan pertubuhan", "机构章程", "Society constitution");
    setStored((prev) => ({
      title: prev?.title ?? nextTitle,
      clauses: mergeClauses(prev?.clauses ?? [], read),
      sourceLabel: handed.fileName,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Seed a device that has never seen this constitution (2026-08-05).
   *
   * Only ever fills a GAP: if this browser already has a copy we leave it
   * alone, because mid-upload the device copy is the newer of the two. Runs
   * once, and only after hydration has actually reported "there is nothing
   * here" — seeding before that would race the localStorage read and briefly
   * show clauses the person then watches get replaced.
   */
  const seededRef = useRef(false);
  useEffect(() => {
    if (seededRef.current) return;
    if (!storeMeta.loaded) return;
    if (stored !== null || orgClauses.length === 0) return;
    seededRef.current = true;
    setStored({
      title: t("Perlembagaan pertubuhan", "机构章程", "Society constitution"),
      clauses: orgClauses,
      // Not a filename: these came from the organisation's records, possibly
      // photographed on somebody else's phone. Saying so is more use than
      // showing a file this device has never had.
      sourceLabel: t(
        "rekod pertubuhan",
        "机构记录",
        "your organisation's records",
      ),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeMeta.loaded, stored, orgClauses]);

  /**
   * Keep the organisation's durable copy in step with this device's.
   *
   * Watching `stored` rather than saving at each call site is deliberate: on
   * mount the upload/intake handlers only have the PRE-hydration value in
   * scope, so anything they saved would be the wrong set. This effect always
   * sees what was actually committed.
   *
   * `lastSavedRef` starts at whatever the server already had, so arriving on a
   * seeded device does not immediately post the same clauses back. A device
   * that has a local copy the server has never seen DOES push it up, which is
   * how existing localStorage-only constitutions get back-filled.
   */
  const lastSavedRef = useRef<string | null>(
    orgClauses.length > 0 ? JSON.stringify(orgClauses) : null,
  );
  useEffect(() => {
    if (!storeMeta.loaded) return;
    if (stored === null || stored.clauses.length === 0) return;
    const payload = JSON.stringify(stored.clauses);
    if (lastSavedRef.current === payload) return;
    lastSavedRef.current = payload;
    void persist(stored.clauses);
  }, [stored, storeMeta.loaded]);

  function ask(q: string, over: ConfirmedClause[] = clauses) {
    const trimmed = q.trim();
    if (!trimmed) return;
    // No constitution read yet: there is nothing to quote, and Minit must not
    // answer a rules question from nothing. (Also covers a handed-over ?q=.)
    if (over.length === 0) return;
    setQuestion(trimmed);
    const matches = filterClauses(trimmed, over);
    setResult(
      matches.length > 0
        ? { kind: "matches", question: trimmed, matches }
        : { kind: "refusal", question: trimmed, text: buildRefusalBm(trimmed) }
    );
  }

  /** THE INGESTION PATH: photo/scan of the constitution → clauses. */
  async function onFilePicked(file: File | null) {
    if (!file) return;
    setAiError(null);
    setAiBusy(true);
    try {
      const form = new FormData();
      form.append("photo", file);
      const res = await fetch("/api/extract-constitution", {
        method: "POST",
        body: form,
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(body?.error ?? joinUserError(USER_ERRORS.aiUnavailable));
      }
      const extraction = body.extraction as ConstitutionExtraction;
      const read = clausesFromExtraction(extraction);
      if (read.length === 0) {
        setAiError(joinUserError(USER_ERRORS.aiCouldNotRead));
        return;
      }
      const nextTitle =
        extraction.document_title.confidence !== "missing" &&
        extraction.document_title.value !== ""
          ? extraction.document_title.value
          : t("Perlembagaan pertubuhan", "机构章程", "Society constitution");

      // Pages are added, not replaced: a constitution is many photographs, and
      // uploading page 2 must not throw away page 1. Later pages win on a
      // repeated clause number, so re-photographing a bad page fixes it.
      // (mergeClauses is the unit-tested version of that rule.)
      setStored((prev) => ({
        title: prev?.title ?? nextTitle,
        clauses: mergeClauses(prev?.clauses ?? [], read),
        sourceLabel: file.name,
      }));
      setResult(null);
    } catch (e) {
      setAiError(e instanceof Error ? e.message : String(e));
    } finally {
      setAiBusy(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 pb-10 text-base">
      {/* Only for the person who has just created an organisation, and only
          until they have a constitution of their own — congratulating someone
          on an org they made last month, over clauses Minit has already read,
          is noise. */}
      {justCreatedOrg && !hasOwn && <NewOrgBanner />}

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-purple-100/80 text-3xl ring-1 ring-white/60 backdrop-blur dark:bg-purple-400/15 dark:ring-white/10">
            📜
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">
            <span className="v2-gradient-text">
              <Tri bm="Perlembagaan" zh="章程问答" en="Constitution" />
            </span>
          </h1>
          {/* Nothing read yet = no badge. There is nothing to label, and a
              "Sample constitution" badge on an empty page only confuses. */}
          {hasOwn ? (
            <Badge className="bg-green-600 text-white hover:bg-green-600">
              <Tri
                bm="Perlembagaan anda"
                zh="您自己的章程"
                en="Your own constitution"
              />
            </Badge>
          ) : isSample ? (
            <Badge variant="secondary">
              <Tri bm="Contoh" zh="示范" en="Example" />
            </Badge>
          ) : null}
          {/* 2026-08-23: this screen answers a QUESTION about the constitution.
              Reading it end to end is a different job and now has a different
              page — and it has to be reachable from here, because here is where
              somebody who wants to read it will look first. */}
          {hasOwn && (
            <Link
              href="/constitution/clauses"
              className="ml-auto text-base underline underline-offset-4"
            >
              <Tri
                bm="Baca semua fasal"
                zh="读整本条文"
                en="Read all the clauses"
              />{" "}
              &rarr;
            </Link>
          )}
        </div>
        {hasOwn ? (
          <p className="text-base text-muted-foreground">
            📄 {stored.sourceLabel} · {clauses.length}{" "}
            <Tri bm="fasal dibaca" zh="条条文已读入" en="clauses read" />
          </p>
        ) : isSample ? (
          <div className="flex flex-wrap items-center gap-3 rounded-xl border-2 border-amber-300 bg-amber-50 p-3 dark:bg-amber-400/10">
            <p className="min-w-56 flex-1 text-base font-medium text-amber-900 dark:text-amber-100">
              <Tri
                bm="Ini perlembagaan CONTOH (rekaan) — jawapan di bawah BUKAN daripada perlembagaan pertubuhan anda."
                zh="这是一份示范（虚构）章程 —— 下面的答案不是来自您机构的章程。"
                en="This is an EXAMPLE (invented) constitution — the answers below are NOT from your organisation's."
              />
            </p>
            <Button variant="outline" onClick={() => setShowSample(false)}>
              <Tri bm="Tutup contoh" zh="关掉示范" en="Close the example" />
            </Button>
          </div>
        ) : (
          <p className="text-base text-muted-foreground">
            <Tri
              bm="Minit belum membaca perlembagaan anda. Ambil gambar setiap halaman di bawah — selepas itu setiap jawapan akan memetik fasal anda sendiri."
              zh="Minit 还没读过您的章程。请在下面把每一页拍下来 —— 之后每个答案都会引用您自己的条文。"
              en="Minit has not read your constitution yet. Photograph each page below — after that, every answer quotes your own clauses."
            />
          </p>
        )}
        {storeMeta.corrupt && (
          <p className="rounded-xl border-2 border-red-300 bg-red-50 p-3 text-base font-medium text-red-900 dark:bg-red-400/10 dark:text-red-100">
            <Tri
              bm="Perlembagaan yang tersimpan pada peranti ini tidak dapat dibaca, jadi Minit tiada fasal sekarang. Ambil gambar halaman-halaman itu semula."
              zh="这台设备上暂存的章程读不出来，所以 Minit 现在手上没有条文。请重新把章程的每一页拍一次。"
              en="The constitution saved on this device could not be read, so Minit has no clauses right now. Please take photos of the pages again."
            />
          </p>
        )}
      </div>

      {/* What Minit read about the society itself: the registered name, and
          what this constitution says about changing itself.

          🔴 `hasOwn ? clauses : []` and not `clauses`: when the sample is on
          screen, `clauses` is the FICTIONAL constitution. Reading a registered
          name out of that and offering to rename the real organisation to it is
          the single worst thing this panel could do. */}
      <OrgIdentityPanel
        clauses={hasOwn ? clauses : []}
        orgName={orgName}
        orgId={orgId}
      />

      {/* 0 — Photograph your constitution (the real AI) */}
      <Card className="border-2 border-purple-200 bg-purple-50/40">
        <CardHeader>
          <CardTitle className="text-xl">
            📷{" "}
            <Tri
              bm="Ambil gambar perlembagaan anda"
              zh="拍下您的章程"
              en="Take a photo of your constitution"
            />
          </CardTitle>
          <CardDescription>
            <Tri
              bm="Satu gambar untuk setiap halaman. Ambil gambar halaman pertama, tunggu Minit membacanya, kemudian ambil halaman berikutnya — halaman baharu ditambah, tidak menggantikan yang lama. Minit menyalin setiap fasal perkataan demi perkataan; ia tidak meringkaskan dan tidak mengarang."
              zh="一页拍一张。先拍第一页，等 Minit 读完，再拍下一页 —— 新的页会加上去，不会盖掉之前的。Minit 会逐字抄下每一条条文，不会自己总结，也不会自己编。"
              en="One photo per page. Take the first page, wait for Minit to read it, then take the next — new pages are added, not replaced. Minit copies each clause word for word; it does not summarise and it does not invent."
            />
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <label
              className={`inline-flex cursor-pointer items-center gap-2 rounded-full px-5 py-3 text-base font-semibold text-white ${
                aiBusy
                  ? "cursor-wait bg-muted-foreground"
                  : "v2-pill bg-gradient-to-r from-[#5b4bd6] to-[#6f5ef2] shadow-[0_10px_26px_-10px_rgba(124,108,245,0.8)]"
              }`}
            >
              {aiBusy ? (
                <>
                  ⏳{" "}
                  <Tri
                    bm="Minit sedang membaca halaman ini…"
                    zh="Minit 正在读这一页…"
                    en="Minit is reading this page…"
                  />
                </>
              ) : (
                <>
                  📷{" "}
                  <Tri
                    bm="Pilih / ambil gambar halaman"
                    zh="选择或拍下一页"
                    en="Choose / take a photo of a page"
                  />
                </>
              )}
              <input
                type="file"
                accept="image/*,application/pdf"
                capture="environment"
                className="hidden"
                disabled={aiBusy}
                onChange={(e) => {
                  onFilePicked(e.target.files?.[0] ?? null);
                  e.target.value = "";
                }}
              />
            </label>
            {hasOwn && !aiBusy && (
              <Button
                variant="outline"
                onClick={() => {
                  const ok = window.confirm(
                    t(
                      "Buang perlembagaan yang sudah dibaca dan mula semula? Anda perlu ambil gambar semua halaman semula.",
                      "要删掉已经读入的章程、重新开始吗？之后每一页都要重新拍一次。",
                      "Discard the constitution Minit has read and start again? You would have to photograph every page again.",
                    ),
                  );
                  if (ok) storeMeta.reset();
                }}
              >
                <Tri
                  bm="Buang & mula semula"
                  zh="删掉，重新开始"
                  en="Discard & start again"
                />
              </Button>
            )}
          </div>
          {/* 0-5: the paid-tier privacy notice beside the upload door. */}
          <PdpaNote />
          {aiError && (
            <div className="rounded-xl border-2 border-red-300 bg-red-50 p-3 text-base font-medium whitespace-pre-line text-red-900">
              {aiError}
            </div>
          )}
          {storeMeta.quotaFull && (
            <p className="rounded-xl border-2 border-red-300 bg-red-50 p-3 text-base font-medium text-red-900">
              <Tri
                bm="Peranti ini penuh, jadi fasal-fasal ini tidak dapat disimpan untuk kunjungan seterusnya."
                zh="这台设备的储存空间满了，这些条文没能存下来，下次打开就看不到了。"
                en="This device is full, so these clauses could not be kept for next time."
              />
            </p>
          )}
          {/* The clauses ARE on this device; only the shared copy is missing.
              Said plainly, because the old behaviour was to save nowhere and
              tell nobody. */}
          {saveWarning && (
            <p className="rounded-xl border-2 border-amber-300 bg-amber-50 p-3 text-base font-medium text-amber-900">
              <Tri
                bm="Fasal-fasal ini tersimpan pada peranti ini, tetapi belum disimpan ke dalam rekod pertubuhan — jadi peranti lain belum dapat melihatnya. Cuba muat semula halaman ini."
                zh="这些条文存在这台设备上了，但还没存进机构记录，所以别的设备暂时看不到。可以重新载入这一页再试一次。"
                en="These clauses are saved on this device, but not yet into your organisation's records — so another device cannot see them yet. Try reloading this page."
              />
            </p>
          )}
          {/* Opt-in example, quiet and last — see the same pattern in /minutes. */}
          {nothingYet && !aiBusy && (
            <button
              type="button"
              onClick={() => setShowSample(true)}
              className="self-start text-base text-muted-foreground underline underline-offset-4"
            >
              <Tri
                bm="Belum ada perlembagaan di tangan? Lihat contoh"
                zh="手上还没有章程？看一个示范"
                en="Constitution not to hand? See an example"
              />
            </button>
          )}
        </CardContent>
      </Card>

      {/* 1 — Ask */}
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">1 · <Tri bm="Tanya perlembagaan" zh="问章程" en="Ask your constitution" /></CardTitle>
          <CardDescription>
            {/* This used to claim "the real clause" while answering from the
                fictional sample. Say which source is in use. */}
            {nothingYet ? (
              <Tri
                bm="Belum boleh — Minit hanya menjawab daripada fasal yang ia sudah baca. Ambil gambar perlembagaan anda di atas dahulu."
                zh="还不能问 —— Minit 只会用它已经读到的条文回答。请先在上面拍下您的章程。"
                en="Not yet — Minit only answers from clauses it has read. Photograph your constitution above first."
              />
            ) : isSample ? (
              <Tri
                bm="Minit sentiasa memetik fasal yang menjadi asas jawapan — tetapi buat masa ini fasal itu daripada perlembagaan CONTOH, bukan milik anda."
                zh="Minit 每次都会引出答案所依据的条文 —— 但目前引的是示范章程的条文，不是您机构的。"
                en="Minit always quotes the clause an answer rests on — but right now that clause comes from the EXAMPLE constitution, not yours."
              />
            ) : (
              <Tri
                bm="Setiap jawapan memetik fasal daripada perlembagaan anda sendiri, perkataan demi perkataan. Kalau tiada fasal yang menjawabnya, Minit akan berkata ia tidak tahu."
                zh="每个答案都会逐字引用您自己章程里的条文。如果没有条文能回答，Minit 会直接说它不知道。"
                en="Every answer quotes a clause from your own constitution, word for word. If no clause answers it, Minit says it does not know."
              />
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {/* No clauses = no question box. A search field that can only ever
              answer "I don't know" is worse than not offering it. */}
          {nothingYet ? (
            <p className="rounded-xl border-2 border-slate-300 bg-slate-50 p-4 text-base font-medium text-slate-800 dark:bg-white/10 dark:text-slate-100">
              <Tri
                bm="Selepas Minit membaca perlembagaan anda, tanya di sini — setiap jawapan memetik fasal anda sendiri, perkataan demi perkataan."
                zh="等 Minit 读过您的章程之后，就可以在这里提问 —— 每个答案都会逐字引用您自己的条文。"
                en="Once Minit has read your constitution, ask here — every answer quotes your own clause, word for word."
              />
            </p>
          ) : (
          <>
          <form
            className="flex flex-col gap-2 sm:flex-row"
            onSubmit={(e) => {
              e.preventDefault();
              ask(question);
            }}
          >
            <input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              // 2026-07-28 audit: the three languages used to ask DIFFERENT
              // questions (zh asked "who can sign cheques?"), and with all three
              // switched on — the default — the hint contradicted itself.
              placeholder={t(
                "cth: Berapa hari notis untuk AGM?",
                "例如：开年度大会要提前几天通知？",
                "e.g. How many days notice for the AGM?"
              )}
              className="h-12 flex-1 rounded-lg border bg-background px-4 text-base shadow-sm outline-none focus:ring-2 focus:ring-purple-300"
            />
            <Button type="submit" size="lg" className="text-base">
              <Tri bm="Tanya" zh="问" en="Ask" />
            </Button>
          </form>

          <div className="flex flex-wrap gap-2">
            {sampleQuestions.map((q) => (
              <button
                key={q.en}
                type="button"
                onClick={() => ask(q.bm)}
                className="rounded-full border-2 border-purple-200 bg-purple-50 px-4 py-2 text-left leading-tight transition-colors hover:border-purple-400 hover:bg-purple-100"
              >
                <span className="block font-medium">{q.bm}</span>
                <span className="block text-sm text-muted-foreground">
                  {q.zh} · {q.en}
                </span>
              </button>
            ))}
          </div>

          {result?.kind === "matches" && (
            <div className="flex flex-col gap-3">
              <div className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                <Tri
                  bm="Ini yang tertulis"
                  zh="章程是这样写的"
                  en="here is what is written"
                />
                :
              </div>
              {result.matches.map(({ clause }) => (
                <div key={clause.clause_no} className="rounded-xl border-2 border-green-300 bg-green-50 p-4">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className="border-green-400 bg-green-100 text-green-900">
                      {clause.clause_no}
                    </Badge>
                    {clause.heading && <span className="font-semibold">{clause.heading}</span>}
                    {clause.page_ref && (
                      <span className="text-sm text-muted-foreground">({clause.page_ref})</span>
                    )}
                  </div>
                  <p className="leading-relaxed">{clause.text}</p>
                </div>
              ))}
              <p className="text-base text-muted-foreground">
                {t(QA_DISCLAIMER_BM, QA_DISCLAIMER_ZH, QA_DISCLAIMER_EN)}
              </p>
            </div>
          )}

          {result?.kind === "refusal" && (
            <div className="rounded-xl border-2 border-amber-300 bg-amber-50 p-4 leading-relaxed whitespace-pre-wrap text-amber-900">
              {result.text}
            </div>
          )}
          </>
          )}
        </CardContent>
      </Card>

      {/* 2 — What the constitution already unlocked */}
      {noticeHit && (
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">
              2 · <Tri bm="Minit dah baca untuk anda" zh="Minit 已经帮您读好了" en="Minit already read it for you" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-3 rounded-xl border-2 border-green-300 bg-green-50 p-4">
              <div className="flex items-center gap-3">
                <div className="text-3xl">🏛️</div>
                <div className="font-semibold">
                  <Tri
                    bm="Tempoh notis mesyuarat agung (AGM)"
                    zh="常年大会（AGM）通知期限"
                    en="AGM notice period"
                  />
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-md border border-green-200 bg-white/60 p-3 dark:bg-white/5">
                  <div className="text-sm text-muted-foreground">
                    <Tri
                      bm="Berapa hari notis diperlukan"
                      zh="需要提前几天通知"
                      en="Days of notice required"
                    />
                  </div>
                  <div className="text-lg font-semibold tabular-nums">
                    {noticeHit.days} <Tri bm="hari" zh="天" en="days" />
                  </div>
                </div>
                <div className="rounded-md border border-green-200 bg-white/60 p-3 dark:bg-white/5">
                  <div className="text-sm text-muted-foreground">
                    <Tri bm="Diambil daripada fasal" zh="取自章程条款" en="Taken from clause" />
                  </div>
                  <div className="text-lg font-semibold">
                    {noticeHit.clause.clause_no}{" "}
                    <span className="text-sm font-normal text-muted-foreground">
                      ({noticeHit.clause.page_ref})
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 3 — Browse all clauses. Hidden while there is no book: an empty card
          titled "the whole book" reads like something is broken. */}
      {clauses.length > 0 && (
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">3 · <Tri bm="Buku perlembagaan" zh="整本章程" en="The whole book" /></CardTitle>
          <CardDescription>
            {title} — {clauses.length}{" "}
            <Tri bm="fasal disahkan" zh="条已核对的条款" en="confirmed clauses" />.{" "}
            <Tri bm="Tekan untuk baca" zh="点开阅读" en="tap to read" />.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {clauses.map((c) => (
            <details key={c.clause_no} className="group rounded-lg border">
              <summary className="flex cursor-pointer list-none items-center gap-3 rounded-lg p-4 hover:bg-accent">
                <Badge variant="outline" className="shrink-0 border-purple-300 bg-purple-50 text-purple-900">
                  {c.clause_no}
                </Badge>
                <span className="flex-1 font-medium">{c.heading || "—"}</span>
                <span className="text-sm text-muted-foreground">{c.page_ref}</span>
                <span className="text-muted-foreground transition-transform group-open:rotate-90">
                  ›
                </span>
              </summary>
              {/* Was text-muted-foreground: the entire body of the constitution
                  rendered at ~4:1 contrast. (2026-07-28 audit.) */}
              <p className="border-t p-4 text-base leading-relaxed">{c.text}</p>
            </details>
          ))}
        </CardContent>
      </Card>
      )}
    </div>
  );
}

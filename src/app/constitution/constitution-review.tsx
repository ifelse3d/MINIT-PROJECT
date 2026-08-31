"use client";

import Link from "next/link";

import { useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Tri, useLocalizedError, useTriText } from "@/components/language-provider";
import { Button } from "@/components/ui/button";
import { ConfirmedAction } from "@/components/confirm-delete";
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
  sortClauses,
  QA_DISCLAIMER_BM,
  QA_DISCLAIMER_EN,
  QA_DISCLAIMER_ZH,
  type ClauseMatch,
} from "@/lib/constitution";
import type { ConfirmedClause } from "@/lib/constitution";
import type { ConstitutionExtraction } from "@/lib/extraction";
import { mergeConstitutionOrganisations } from "@/lib/extraction-merge";
import { usePersistentState } from "@/lib/use-persistent-state";
import { useScopedKey } from "@/lib/storage-scope";
import { consumeIntake } from "@/lib/intake-handoff";
import { reattachOrphanClauses, saveConstitutionClauses } from "./actions";
import { NewOrgBanner } from "./new-org-banner";
import { OrgIdentityPanel } from "./org-identity-panel";
import { joinUserError, USER_ERRORS } from "@/lib/user-errors";
import {
  countConstitutionPages,
  fingerprintFiles,
  readConstitutionFiles,
  type ConstitutionReadResume,
} from "@/lib/constitution-read-client";
import { ConstitutionReadEstimate } from "@/components/constitution-read-estimate";
import { clausesFromConstitutionExtraction } from "@/lib/constitution-display";
import { ClauseList } from "./clause-list";
import { canStageTogether, isPhotoType } from "@/lib/multi-page-staging";
import { compressPhoto } from "@/app/minutes/minutes-storage";
import { X } from "lucide-react";
import {
  sampleClauses,
  sampleConstitutionTitle,
  sampleQuestions,
} from "@/lib/sample-constitution";
import { AttachIcon, ChooseFileLabel, UploadLimitNote } from "@/components/attach-icon";

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
  /**
   * §2 (104): the three facts the READ handed back about the society itself
   * (name / address / registration number), for the identity panel.
   *
   * DEVICE-SIDE ONLY, and deliberately so. `constitutions.clauses_json` holds
   * the clause ARRAY and nothing else; giving this block a durable home needs
   * a migration, and only J applies those (D8). So: on the device that did the
   * reading the panel shows the AI's answer; on a second device the panel
   * falls back to the clause regex (fixed tonight) over the same clauses. Both
   * are honest, and neither invents.
   */
  organisation?: ConstitutionExtraction["organisation"];
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
  // Server errors travel as bm\nzh\nen — show the reader's line only
  // (J's new-user test, 2026-08-28: "why here suddenly have 3 language").
  const localizeError = useLocalizedError();

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
   * D0-1 (work order 56, 拍板 3) — picked files are STAGED, not read. This
   * page used to fire the AI (and the charge) the moment a file was chosen:
   * no confirmation, no way to add page 2 first, no way to change your mind.
   * Now it works exactly like the home page's AskBox (A-5): stage → see
   * thumbnails → "add the next page" → press Send. Photos stage several at
   * once (pages of ONE constitution); a PDF is already a whole document, so
   * one of those at a time (our design, not a platform limit).
   */
  const [staged, setStaged] = useState<{ file: File; preview: string | null }[]>([]);
  /**
   * ④ (work order 85): the REAL page count of what is staged — a PDF's pages
   * via pdf-lib, photos one each — for the price-and-time line and an honest
   * send-button label. null = nothing staged or uncountable (then no estimate
   * is shown rather than a wrong one).
   */
  const [stagedPages, setStagedPages] = useState<number | null>(null);
  useEffect(() => {
    let cancelled = false;
    void countConstitutionPages(staged.map((s) => s.file)).then((n) => {
      if (!cancelled) setStagedPages(n);
    });
    return () => {
      cancelled = true;
    };
  }, [staged]);
  /** Which page is being read right now, e.g. "page2.jpg · 第 2／3 段". */
  const [reading, setReading] = useState<string | null>(null);
  /**
   * I1 (work order 81): where a partly-read document can pick up again. A
   * failed segment leaves everything read so far (and the no-extra-charge
   * continuation pass) here; pressing send on the SAME staged files carries
   * on from the failed segment instead of paying for a fresh read. Removing
   * or adding a staged file changes the fingerprint and starts clean.
   */
  const resumeRef = useRef<ConstitutionReadResume | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);

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
   * §0-6 (work order 100): the person confirmed the agent's "these belong
   * under Fasal X" proposal. The rename + its trace happen SERVER-side
   * (reattachOrphanClauses — fail-closed without migration 41); on success
   * this device adopts the server's renamed set so the local copy agrees.
   */
  async function reattachOrphans(
    orphanNos: string[],
    parentNo: string,
  ): Promise<{ ok: boolean; error?: string }> {
    try {
      const r = await reattachOrphanClauses({ orphanNos, parentNo });
      if (!r.ok) return { ok: false, error: r.error };
      setStored((prev) => (prev ? { ...prev, clauses: r.clauses } : prev));
      return { ok: true };
    } catch {
      return { ok: false };
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
    const read = clausesFromConstitutionExtraction(extraction);
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
      // §2 (104): same page-by-page rule as the clauses — a later page that
      // read nothing never erases what page 1 read.
      organisation: mergeConstitutionOrganisations(
        prev?.organisation,
        extraction.organisation,
      ),
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

  /** Picked files land in the staging strip; NOTHING is read or charged yet. */
  async function stageFiles(list: FileList | null) {
    if (!list || list.length === 0 || aiBusy) return;
    setAiError(null);
    const picked = Array.from(list);
    const wouldBe = [...staged.map((s) => s.file), ...picked];
    if (!canStageTogether(wouldBe.map((f) => f.type))) {
      setAiError(
        t(
          "Hantar beberapa fail sekali gus hanya untuk GAMBAR. PDF: satu fail pada satu masa.",
          "一次传多个，只限「照片」。PDF 请一次传一份。",
          "Sending several at once is for PHOTOS only. PDF: one file at a time.",
        ),
      );
      return;
    }
    const withPreviews = await Promise.all(
      picked.map(async (file) => ({
        file,
        preview: isPhotoType(file.type) ? await compressPhoto(file) : null,
      })),
    );
    setStaged((prev) => [...prev, ...withPreviews]);
  }

  /**
   * THE INGESTION PATH, now behind an explicit Send (D0-1) and read through
   * the shared segmented reader (I1, work order 81): everything staged is ONE
   * constitution. A long PDF is split in the browser and read segment by
   * segment — each segment its own request, so no read ever meets the
   * platform's 60s wall — and the whole document costs ONE extract action
   * (plus the A6 min(pages, 5) fence charge) however many segments it takes.
   *
   * A segment that fails stays continuable: everything read so far (and the
   * no-extra-charge continuation pass) waits in `resumeRef`, and pressing
   * send again on the same staged files carries on from the failed segment.
   * Nothing done so far is lost, and nothing is charged twice.
   */
  async function sendStaged() {
    if (aiBusy || staged.length === 0) return;
    setAiError(null);
    setAiBusy(true);
    try {
      const files = staged.map((s) => s.file);
      const fingerprint = fingerprintFiles(files);
      const resume =
        resumeRef.current?.fingerprint === fingerprint ? resumeRef.current : null;
      const r = await readConstitutionFiles(files, {
        resume,
        onProgress: (p) =>
          setReading(
            p.totalSegments === 1
              ? p.fileName
              : `${p.fileName} · ${t(
                  `bahagian ${p.segment}/${p.totalSegments}`,
                  `第 ${p.segment}／${p.totalSegments} 段`,
                  `part ${p.segment} of ${p.totalSegments}`,
                )}`,
          ),
      });
      if (!r.ok) {
        resumeRef.current = r.resume;
        // Say WHICH part failed and that pressing send again continues from
        // it; the files stay staged for exactly that.
        const continueLine = r.resume
          ? t(
              `Bahagian ${r.failedSegment}/${r.totalSegments} gagal. Yang sudah dibaca disimpan — tekan hantar sekali lagi untuk sambung dari bahagian itu (muka surat yang sudah dibaca tidak dicaj semula).`,
              `第 ${r.failedSegment}／${r.totalSegments} 段没读成功。已读的部分都留着 —— 再按一次送出，会从那一段接着读；已经读好的页不会重扣。`,
              `Part ${r.failedSegment} of ${r.totalSegments} failed. What was read is kept — press send again to continue from that part (pages already read are never charged again).`,
            )
          : null;
        setAiError(continueLine ? `${r.message}\n\n${continueLine}` : r.message);
        return;
      }
      resumeRef.current = null;
      const read = clausesFromConstitutionExtraction(r.extraction);
      if (read.length === 0) {
        setAiError(joinUserError(USER_ERRORS.aiCouldNotRead));
        return;
      }
      const nextTitle =
        r.extraction.document_title.confidence !== "missing" &&
        r.extraction.document_title.value !== ""
          ? r.extraction.document_title.value
          : t("Perlembagaan pertubuhan", "机构章程", "Society constitution");

      // Pages are added, not replaced: a constitution is many photographs, and
      // uploading page 2 must not throw away page 1. Later pages win on a
      // repeated clause number, so re-photographing a bad page fixes it.
      // (mergeClauses is the unit-tested version of that rule.)
      setStored((prev) => ({
        title: prev?.title ?? nextTitle,
        clauses: mergeClauses(prev?.clauses ?? [], read),
        sourceLabel:
          files.length === 1 ? files[0].name : `${files.length} × 📄`,
        organisation: mergeConstitutionOrganisations(
          prev?.organisation,
          r.extraction.organisation,
        ),
      }));
      setStaged([]);
      setResult(null);
    } finally {
      setAiBusy(false);
      setReading(null);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 pb-10 text-base">
      {/* Only for the person who has just created an organisation, and only
          until they have a constitution of their own — congratulating someone
          on an org they made last month, over clauses MinitAI has already read,
          is noise. */}
      {justCreatedOrg && !hasOwn && <NewOrgBanner />}

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex h-14 w-14 items-center justify-center rounded-md bg-purple-100/80 text-3xl ring-1 ring-white/60 backdrop-blur dark:bg-purple-400/15 dark:ring-white/10">
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
          // 28#7 (J, 2026-08-28): the example lives in its own amber CARD
          // below — up here just one quiet line, not a page-wide takeover.
          <p className="text-base text-muted-foreground">
            <Tri
              bm="Contoh sedang dibuka di bawah — perlembagaan anda sendiri masih boleh dimuat naik di sini."
              zh="下面开着一份示范 —— 您自己的章程还是可以在这里上传。"
              en="An example is open below — your own constitution can still be uploaded here."
            />
          </p>
        ) : (
          <p className="text-base text-muted-foreground">
            <Tri
              bm="MinitAI belum membaca perlembagaan anda. Pilih fail PDF atau ambil gambar setiap halaman di bawah — selepas itu setiap jawapan akan memetik fasal anda sendiri."
              zh="MinitAI 还没读过您的章程。在下面选一份 PDF，或把每一页拍下来 —— 之后每个答案都会引用您自己的条文。"
              en="MinitAI has not read your constitution yet. Choose a PDF or photograph each page below — after that, every answer quotes your own clauses."
            />
          </p>
        )}
        {storeMeta.corrupt && (
          <p className="rounded-md border-2 border-red-300 bg-red-50 p-3 text-base font-medium text-red-900 dark:bg-red-400/10 dark:text-red-100">
            <Tri
              bm="Perlembagaan yang tersimpan pada peranti ini tidak dapat dibaca, jadi MinitAI tiada fasal sekarang. Ambil gambar halaman-halaman itu semula."
              zh="这台设备上暂存的章程读不出来，所以 MinitAI 现在手上没有条文。请重新把章程的每一页拍一次。"
              en="The constitution saved on this device could not be read, so MinitAI has no clauses right now. Please take photos of the pages again."
            />
          </p>
        )}
      </div>

      {/* What MinitAI read about the society itself: the registered name, and
          what this constitution says about changing itself.

          🔴 `hasOwn ? clauses : []` and not `clauses`: when the sample is on
          screen, `clauses` is the FICTIONAL constitution. Reading a registered
          name out of that and offering to rename the real organisation to it is
          the single worst thing this panel could do. */}
      <OrgIdentityPanel
        clauses={hasOwn ? clauses : []}
        organisation={hasOwn ? stored.organisation : undefined}
        orgName={orgName}
        orgId={orgId}
      />

      {/* 0 — Photograph your constitution (the real AI) */}
      <Card className="border-2 border-purple-200 bg-purple-50/40">
        <CardHeader>
          <CardTitle className="text-xl">
            <AttachIcon className="inline h-5 w-5 align-[-3px]" />{" "}
            {/* 28#5 (J, 2026-08-28): PDFs were always accepted here, but the
                copy only said "photo" — say both. */}
            <Tri
              bm="Perlembagaan anda: PDF atau gambar"
              zh="您的章程：PDF 或拍照"
              en="Your constitution: PDF or photos"
            />
          </CardTitle>
          <CardDescription>
            {/* D0-1: pages stage together now — the "wait before sending the
                next" instruction described the old one-at-a-time behaviour. */}
            <Tri
              bm="Satu fail PDF, atau ambil gambar beberapa halaman sekali gus — semak dahulu, kemudian tekan hantar. Halaman baharu ditambah, tidak menggantikan yang lama. MinitAI menyalin setiap fasal perkataan demi perkataan; ia tidak meringkaskan dan tidak mengarang."
              zh="可以整份 PDF，也可以一次拍好几页 —— 先看一眼，再按送出。新的页会加上去，不会盖掉之前的。MinitAI 会逐字抄下每一条条文，不会自己总结，也不会自己编。"
              en="One PDF, or photograph several pages at once — check them first, then press send. New pages are added, not replaced. MinitAI copies each clause word for word; it does not summarise and it does not invent."
            />
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-3">
            {/* D0-1: choosing a file STAGES it — nothing is read or charged
                until Send. `capture` is gone for the same reason AskBox
                dropped it (#8, 27-evening): without it a phone's picker
                offers BOTH the camera and the gallery, which is what
                multi-select needs. */}
            <button
              type="button"
              disabled={aiBusy}
              onClick={() => fileInput.current?.click()}
              className={`inline-flex items-center gap-2 rounded-sm px-5 py-3 text-base font-semibold text-white ${
                aiBusy
                  ? "cursor-wait bg-muted-foreground"
                  : "v2-pill cursor-pointer bg-[color:var(--v2-primary-fill)] shadow-[var(--v2-shadow-soft)]"
              }`}
            >
              <AttachIcon /> <ChooseFileLabel />
            </button>
            <input
              ref={fileInput}
              type="file"
              multiple
              accept="image/*,application/pdf"
              className="hidden"
              disabled={aiBusy}
              onChange={(e) => {
                void stageFiles(e.target.files);
                e.target.value = "";
              }}
            />
            {/* D0-3 (拍板 4): the remaining size limit, at the door. */}
            {!aiBusy && <UploadLimitNote />}
            {hasOwn && !aiBusy && (
              /* §1-10: the app's own dialog, never window.confirm. */
              <ConfirmedAction
                body={
                  <Tri
                    bm="Buang perlembagaan yang sudah dibaca dan mula semula? Anda perlu ambil gambar semua halaman semula."
                    zh="要删掉已经读入的章程、重新开始吗？之后每一页都要重新拍一次。"
                    en="Discard the constitution MinitAI has read and start again? You would have to photograph every page again."
                  />
                }
                confirmLabel={<Tri bm="Buang" zh="删掉" en="Discard" />}
                onConfirm={() => storeMeta.reset()}
                trigger={(open) => (
                  <Button variant="outline" onClick={open}>
                    <Tri
                      bm="Buang & mula semula"
                      zh="删掉，重新开始"
                      en="Discard & start again"
                    />
                  </Button>
                )}
              />
            )}
          </div>

          {/* D0-1: the staged pages, visible and removable BEFORE anything is
              sent or charged — same strip as the home page's AskBox (A-5). */}
          {staged.length > 0 && (
            <div className="flex flex-col gap-3 rounded-md border-2 border-[#a855f7]/40 bg-white/70 p-3 dark:bg-white/10">
              <div className="flex flex-wrap gap-3">
                {staged.map((s, i) => (
                  <div
                    key={`${s.file.name}-${i}`}
                    className="relative flex w-28 flex-col items-center gap-1 rounded-sm border-2 border-[color:var(--v2-border)] bg-white/80 p-2 dark:bg-white/10"
                  >
                    {s.preview ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={s.preview}
                        alt={s.file.name}
                        className="h-20 w-full rounded-xs object-cover"
                      />
                    ) : (
                      <span className="flex h-20 w-full items-center justify-center text-4xl">
                        📄
                      </span>
                    )}
                    <span className="w-full truncate text-center text-xs" title={s.file.name}>
                      {s.file.name}
                    </span>
                    <button
                      type="button"
                      disabled={aiBusy}
                      onClick={() => setStaged((prev) => prev.filter((_, j) => j !== i))}
                      className="absolute -top-2 -right-2 inline-flex h-7 w-7 items-center justify-center rounded-full border-2 border-[color:var(--v2-border)] bg-white text-muted-foreground hover:bg-red-50 hover:text-red-700 dark:bg-neutral-800 dark:hover:bg-red-400/10"
                      aria-label={t(
                        `Buang ${s.file.name}`,
                        `移除 ${s.file.name}`,
                        `Remove ${s.file.name}`,
                      )}
                    >
                      <X className="h-4 w-4" strokeWidth={2.2} />
                    </button>
                  </div>
                ))}
                {/* Adding the next page must not mean hunting for the picker
                    again (photos only: a PDF is already a whole document). */}
                {staged.every((s) => isPhotoType(s.file.type)) && (
                  <button
                    type="button"
                    disabled={aiBusy}
                    onClick={() => fileInput.current?.click()}
                    className="flex w-28 flex-col items-center justify-center gap-1 rounded-sm border-2 border-dashed border-[color:var(--v2-border)] p-2 text-muted-foreground hover:border-[#a855f7]/60 hover:text-foreground"
                  >
                    <span className="text-3xl leading-none">＋</span>
                    <span className="text-center text-xs">
                      <Tri bm="Tambah muka surat" zh="加下一页" en="Add next page" />
                    </span>
                  </button>
                )}
              </div>
              {/* ④ (work order 85): the price before the read — pages, the
                  one action, the free-fence deduction, the parts, the rough
                  time. Informative only; the button below is the consent. */}
              {stagedPages !== null && (
                <ConstitutionReadEstimate
                  pages={stagedPages}
                  segments={staged.length > 1 ? staged.length : undefined}
                />
              )}
              <div className="flex flex-wrap items-center gap-3">
                <Button size="lg" disabled={aiBusy} onClick={() => void sendStaged()}>
                  {aiBusy ? (
                    <Tri bm="Sebentar…" zh="请稍等…" en="One moment…" />
                  ) : (
                    /* The label counts REAL pages when they are known — a
                       one-file 8-page PDF used to read "读这 1 页". */
                    <Tri
                      bm={`Mula baca — ${stagedPages ?? staged.length} muka surat`}
                      zh={`开始读 —— 共 ${stagedPages ?? staged.length} 页`}
                      en={`Start reading — ${stagedPages ?? staged.length} page${(stagedPages ?? staged.length) === 1 ? "" : "s"}`}
                    />
                  )}
                </Button>
                <span className="min-w-40 flex-1 text-sm text-muted-foreground">
                  {staged.length > 1 ? (
                    <Tri
                      bm={`${staged.length} gambar akan dibaca sebagai SATU perlembagaan (muka surat demi muka surat). Belum dihantar — tekan butang bila siap.`}
                      zh={`这 ${staged.length} 张会当成同一本章程、一页一页读。还没送出 —— 准备好按按钮。`}
                      en={`These ${staged.length} photos will be read as ONE constitution, page by page. Not sent yet — press the button when ready.`}
                    />
                  ) : (
                    <Tri
                      bm="Belum dihantar — tambah muka surat lain dahulu jika ada, kemudian tekan butang."
                      zh="还没送出 —— 有下一页可以先加上，再按按钮。"
                      en="Not sent yet — add more pages first if you have them, then press the button."
                    />
                  )}
                </span>
              </div>
            </div>
          )}

          {aiBusy && reading && (
            <p className="rounded-md border-2 border-[#a855f7]/40 bg-white/70 p-4 text-base font-medium dark:bg-white/10">
              ⏳{" "}
              <Tri
                bm={`MinitAI sedang membaca "${reading}" — halaman baharu ditambah, tidak menggantikan yang lama. Tunggu sekejap.`}
                zh={`MinitAI 正在读「${reading}」—— 新的页会加上去，不会盖掉之前的。请稍等。`}
                en={`MinitAI is reading "${reading}" — new pages are added, not replaced. One moment.`}
              />
            </p>
          )}

          {aiError && (
            <div className="rounded-md border-2 border-red-300 bg-red-50 p-3 text-base font-medium whitespace-pre-line text-red-900">
              {localizeError(aiError)}
            </div>
          )}
          {storeMeta.quotaFull && (
            <p className="rounded-md border-2 border-red-300 bg-red-50 p-3 text-base font-medium text-red-900">
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
            <p className="rounded-md border-2 border-amber-300 bg-amber-50 p-3 text-base font-medium text-amber-900">
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

      {/* 28#7 (J, 2026-08-28): in example mode, everything the example touches
          sits INSIDE one amber card with its own header and close button — the
          example is "another thing on the page", never the page itself. When
          no example is open, display:contents makes this wrapper invisible to
          the layout. */}
      <div
        className={
          isSample
            ? "flex flex-col gap-4 rounded-md border-2 border-amber-300 bg-amber-50/40 p-4 dark:bg-amber-400/5"
            : "contents"
        }
      >
        {isSample && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="min-w-56 flex-1 text-base font-semibold text-amber-900 dark:text-amber-100">
              📎{" "}
              <Tri
                bm="CONTOH (rekaan) — jawapan di dalam kad ini BUKAN daripada perlembagaan pertubuhan anda."
                zh="示范（虚构）—— 这张卡里的答案不是来自您机构的章程。"
                en="EXAMPLE (invented) — the answers inside this card are NOT from your organisation's constitution."
              />
            </p>
            <Button variant="outline" onClick={() => setShowSample(false)}>
              <Tri bm="Tutup contoh" zh="关掉示范" en="Close the example" />
            </Button>
          </div>
        )}

      {/* 1 — Ask */}
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">1 · <Tri bm="Tanya perlembagaan" zh="问章程" en="Ask your constitution" /></CardTitle>
          <CardDescription>
            {/* This used to claim "the real clause" while answering from the
                fictional sample. Say which source is in use. */}
            {nothingYet ? (
              <Tri
                bm="Belum boleh — MinitAI hanya menjawab daripada fasal yang ia sudah baca. Ambil gambar perlembagaan anda di atas dahulu."
                zh="还不能问 —— MinitAI 只会用它已经读到的条文回答。请先在上面拍下您的章程。"
                en="Not yet — MinitAI only answers from clauses it has read. Photograph your constitution above first."
              />
            ) : isSample ? (
              <Tri
                bm="MinitAI sentiasa memetik fasal yang menjadi asas jawapan — tetapi buat masa ini fasal itu daripada perlembagaan CONTOH, bukan milik anda."
                zh="MinitAI 每次都会引出答案所依据的条文 —— 但目前引的是示范章程的条文，不是您机构的。"
                en="MinitAI always quotes the clause an answer rests on — but right now that clause comes from the EXAMPLE constitution, not yours."
              />
            ) : (
              <Tri
                bm="Setiap jawapan memetik fasal daripada perlembagaan anda sendiri, perkataan demi perkataan. Kalau tiada fasal yang menjawabnya, MinitAI akan berkata ia tidak tahu."
                zh="每个答案都会逐字引用您自己章程里的条文。如果没有条文能回答，MinitAI 会直接说它不知道。"
                en="Every answer quotes a clause from your own constitution, word for word. If no clause answers it, MinitAI says it does not know."
              />
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {/* No clauses = no question box. A search field that can only ever
              answer "I don't know" is worse than not offering it. */}
          {nothingYet ? (
            <p className="rounded-md border-2 border-slate-300 bg-slate-50 p-4 text-base font-medium text-slate-800 dark:bg-white/10 dark:text-slate-100">
              <Tri
                bm="Selepas MinitAI membaca perlembagaan anda, tanya di sini — setiap jawapan memetik fasal anda sendiri, perkataan demi perkataan."
                zh="等 MinitAI 读过您的章程之后，就可以在这里提问 —— 每个答案都会逐字引用您自己的条文。"
                en="Once MinitAI has read your constitution, ask here — every answer quotes your own clause, word for word."
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
              className="h-12 flex-1 rounded-sm border bg-background px-4 text-base shadow-sm outline-none focus:ring-2 focus:ring-purple-300"
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
                className="rounded-xs border-2 border-purple-200 bg-purple-50 px-4 py-2 text-left leading-tight transition-colors hover:border-purple-400 hover:bg-purple-100"
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
                <div key={clause.clause_no} className="rounded-md border-2 border-green-300 bg-green-50 p-4">
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
            <div className="rounded-md border-2 border-amber-300 bg-amber-50 p-4 leading-relaxed whitespace-pre-wrap text-amber-900">
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
              2 · <Tri bm="MinitAI dah baca untuk anda" zh="MinitAI 已经帮您读好了" en="MinitAI already read it for you" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-3 rounded-md border-2 border-green-300 bg-green-50 p-4">
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
              <div className="grid gap-3 @xl:grid-cols-2">
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
          {/* 97 §3(d): ONE shared clause list (search + hierarchy + orphan
              sinking + the "missing"-word scrub) — the same component
              /constitution/clauses renders, in its collapsible skin.
              §0-6 (order 100): on the REAL book it also proposes homes for
              orphan sub-clauses (person confirms, rename traced). The
              sample never gets the write path. */}
          <ClauseList
            book={sortClauses(clauses)}
            variant="collapsible"
            storedOrder={hasOwn ? clauses : undefined}
            onReattach={hasOwn ? reattachOrphans : undefined}
          />
        </CardContent>
      </Card>
      )}
      </div>
    </div>
  );
}

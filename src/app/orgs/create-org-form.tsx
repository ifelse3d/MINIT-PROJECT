"use client";

import { useActionState, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Tri, useLocalizedError, useTriText } from "@/components/language-provider";
import { joinUserError, USER_ERRORS } from "@/lib/user-errors";
import { RELAY_MAX_BYTES } from "@/lib/upload-relay";
import {
  fingerprintFiles,
  readConstitutionFiles,
  type ConstitutionReadResume,
} from "@/lib/constitution-read-client";
import { writeIntake } from "@/lib/intake-handoff";
import { createOrg, type OrgActionState } from "./actions";

const INITIAL: OrgActionState = { error: null, ok: false };

/** Where a newly created organisation goes next.
 *
 *  §1-6 (work order 69, J): a GUIDED SEQUENCE — /orgs/welcome walks
 *  constitution → roster → Maklumat Am in order, each step skippable only by
 *  pressing "Fill in later" (not suggestions scattered across pages). This
 *  replaces the old ?welcome=1 home card.
 *
 *  When the person DID attach a constitution here, they still land on
 *  /constitution — their upload has just been read and is waiting there to be
 *  reviewed; sending them home away from their own upload would be worse.
 *  (?setup=1 only adds the banner in constitution/new-org-banner.tsx; the
 *  banner links onward to /orgs/welcome.) */
const AFTER_CREATE_HOME = "/orgs/welcome";
const AFTER_CREATE_WITH_FILE = "/constitution?setup=1";

/** Matches ALLOWED_MIME in /api/extract-constitution. A constitution is
 *  usually a photocopy, so a PDF is as likely as a photo. */
const CONSTITUTION_ACCEPT = "image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf";

/** A-4: PDFs over the request-body cap now ride the Storage relay, whose own
 *  ceiling is RELAY_MAX_BYTES (12MB, the AI vendor's wall) — so the instant
 *  refusal here only fires above THAT. Photos are shrunk before sending, so
 *  they get no pre-check at all. */
const MAX_BYTES = RELAY_MAX_BYTES;

export function CreateOrgForm({
  parentChoices,
}: {
  /** Orgs the user administers (hq_admin) — allowed parents for a branch. */
  parentChoices: { id: number; name: string }[];
}) {
  const [state, formAction, pending] = useActionState(createOrg, INITIAL);
  const router = useRouter();
  const t = useTriText();
  // J's new-user test (2026-08-28): server errors travel as bm\nzh\nen and
  // were printed as a three-language wall ("why here suddenly have 3
  // language"). Pick the reader's line.
  const localizeError = useLocalizedError();

  // ---------------------------------------------------------------------
  // THE CONSTITUTION, ATTACHED HERE AND READ THE MOMENT THE ORG EXISTS.
  //
  // 2026-08-22, J: "這個不是在 PERLEMBAGAAN 也有那個 NGO 的注冊名字嗎？那不是
  // 更好讓他們直接 UPLOAD，然後給他們看，有什麽要改的才改。"
  //
  // 🔴 WHY THE FILE IS HELD AND NOT UPLOADED IMMEDIATELY. Every AI action is
  // charged to an ORGANISATION (requireAiQuota → org.id). Before the org
  // exists there is no quota to charge and no RLS scope to store the pages
  // under, so a read on this screen has nothing to belong to. The file is
  // therefore kept in this component, and sent the instant createOrg returns —
  // which the person experiences as one step, because it is one tap.
  //
  // The result is handed to /constitution through the same one-shot parcel the
  // home page's "one door" uses (src/lib/intake-handoff.ts), so the review
  // screen treats it exactly like any other upload — and the identity panel
  // there shows the registered name it read, for the person to accept or fix.
  // ---------------------------------------------------------------------
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  // B-5: which kind of organisation — decides whether the PPM field shows.
  const [orgType, setOrgType] = useState<"registered" | "committee">("registered");
  // C-1 (work order 27, 拍板⑤): which plan. Trial is the default and the only
  // one that changes anything today — standard/hq RECORD the choice
  // (orgs.plan) and we activate by hand once prices exist. No fake checkout,
  // no fake prices (D12), quota stays at the trial 15 until then.
  const [plan, setPlan] = useState<"trial" | "standard" | "hq">("trial");
  // C-2 (8/20 #19 后段): a NEW society and a society that has EXISTED for
  // years start in different places — the answer only reorders the landing
  // card, nothing else. Default "existing": Minit is built for registered
  // societies, and most of those existed long before tonight.
  const [societyAge, setSocietyAge] = useState<"existing" | "new">("existing");
  const [reading, setReading] = useState(false);
  /** "第 2／6 段" while a long PDF is read in segments (I1); null otherwise. */
  const [readingPart, setReadingPart] = useState<string | null>(null);
  const [readFailed, setReadFailed] = useState<string | null>(null);
  /**
   * I1 (work order 81): a failed segment leaves everything read so far here,
   * so "Try again" CONTINUES from the failed segment on the same paid action
   * instead of paying for the whole document again.
   */
  const resumeRef = useRef<ConstitutionReadResume | null>(null);
  /** The post-create work must run once, not on every re-render it causes. */
  const handledRef = useRef(false);

  function chooseFile(picked: File | null) {
    setFileError(null);
    // Photos are shrunk in the browser before sending (48), so only a PDF
    // can be refused up front — and only above the relay's own ceiling.
    if (picked && picked.type === "application/pdf" && picked.size > MAX_BYTES) {
      setFileError(joinUserError(USER_ERRORS.pdfTooBigForAi));
      return;
    }
    setFile(picked);
  }

  /**
   * The constitution read — ONE function, called by the post-create effect
   * AND by the in-place "try again" button (work order 68 §1-8: a failed
   * read used to offer no retry short of re-creating the organisation).
   * The org exists by the time this runs, so retrying re-reads the SAME held
   * file against the SAME org; the route refunds when the vendor never
   * delivered, so a retry is not a double charge.
   */
  const runRead = useCallback(
    async (f: File) => {
      setReadFailed(null);
      setReading(true);
      setReadingPart(null);
      try {
        // I1 (work order 81): the shared segmented reader. A long PDF is
        // split in the browser and read segment by segment — no single
        // request ever meets the 60s wall the old one-shot read died on —
        // and the whole document costs ONE extract action. Shrinking photos
        // and relaying a big segment via Storage happen inside the helper.
        const fingerprint = fingerprintFiles([f]);
        const resume =
          resumeRef.current?.fingerprint === fingerprint ? resumeRef.current : null;
        const r = await readConstitutionFiles([f], {
          resume,
          onProgress: (p) =>
            setReadingPart(
              p.totalSegments === 1
                ? null
                : t(
                    `bahagian ${p.segment}/${p.totalSegments}`,
                    `第 ${p.segment}／${p.totalSegments} 段`,
                    `part ${p.segment} of ${p.totalSegments}`,
                  ),
            ),
        });
        if (!r.ok) {
          resumeRef.current = r.resume;
          // The organisation IS created — only the reading failed. Say so and
          // let the person decide, instead of navigating away from the reason.
          // A fresh request's charges are refunded by the route; a partly-read
          // document waits in resumeRef, so "Try again" continues from the
          // failed segment without paying again.
          const continueLine = r.resume
            ? t(
                `Bahagian ${r.failedSegment}/${r.totalSegments} gagal — "Cuba sekali lagi" menyambung dari situ, tidak dicaj sekali lagi.`,
                `第 ${r.failedSegment}／${r.totalSegments} 段没读成功 ——「再试一次」会从那一段接着读，不会再扣一次。`,
                `Part ${r.failedSegment} of ${r.totalSegments} failed — "Try again" continues from there, not charged again.`,
              )
            : null;
          setReadFailed(continueLine ? `${r.message}\n\n${continueLine}` : r.message);
          return;
        }
        resumeRef.current = null;
        writeIntake({
          kind: "constitution",
          fileName: f.name,
          extraction: r.extraction,
        });
        router.replace(AFTER_CREATE_WITH_FILE);
      } catch {
        setReadFailed(
          t(
            "Sambungan internet terputus semasa menghantar fail.",
            "传档案的时候网络断了。",
            "The internet connection dropped while sending the file.",
          ),
        );
      } finally {
        setReading(false);
        setReadingPart(null);
      }
    },
    [router, t],
  );

  useEffect(() => {
    if (!state.ok || handledRef.current) return;
    handledRef.current = true;

    // `replace`, not `push`: Back from the landing page must go to /orgs,
    // not to a spent form that would re-show its success panel and invite a
    // second organisation nobody asked for.
    // C-2: an EXISTING society's landing card starts with the records it
    // already has (constitution → committee roster → first notes).
    if (!file) {
      // §1-6: new or existing, the guided sequence is the same three
      // foundations — the wizard derives done-ness from the database, so an
      // existing society that brings records in simply sees ✓ appear.
      router.replace(AFTER_CREATE_HOME);
      return;
    }

    // setTimeout(0): the frozen eslint baseline forbids synchronous setState
    // in an effect (STATE §6) — runRead flips `reading` on its first line.
    // No cleanup on purpose: handledRef makes this a one-shot, and a cleanup
    // could cancel the queued read if a dep identity shifted in the same tick.
    setTimeout(() => void runRead(file), 0);
  }, [state.ok, file, router, t, societyAge, runRead]);

  // Stage R clean-ledger tokens (same recipe as authInputClass in login/glass).
  // The old glass style (white/50 on a white card) made these fields invisible
  // in light mode — J's first report after the redesign, 2026-08-25.
  const inputCls =
    "w-full rounded-md border border-[color:var(--v2-outline-border)] bg-[color:var(--v2-card)] px-3 py-2 text-base text-[color:var(--v2-text)] outline-none transition-[border-color,box-shadow] duration-150 focus:border-[color:var(--v2-primary)] focus:shadow-[0_0_0_3px_rgba(91,75,214,0.18)]";

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1">
        <span className="text-base font-semibold">
          <Tri bm="Nama pertubuhan" zh="组织名称" en="Organisation name" />
        </span>
        {/* C-4 (拍板 33): typed letters turn into CAPITALS as they land — the
            ROS register writes society names in capitals, and a mixed-case
            name here would disagree with every official document. Uppercasing
            never changes the string length, so the caret keeps its place. */}
        <input
          name="name"
          className={inputCls}
          required
          maxLength={200}
          autoCapitalize="characters"
          onChange={(e) => {
            const el = e.currentTarget;
            const pos = el.selectionStart;
            el.value = el.value.toUpperCase();
            if (pos !== null) el.setSelectionRange(pos, pos);
          }}
        />
        <span className="text-sm text-muted-foreground">
          <Tri
            bm="Nama berdaftar rasmi sentiasa dalam HURUF BESAR."
            zh="官方注册名称一律大写。"
            en="Official registered names are always in CAPITALS."
          />
        </span>
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-base font-semibold">
          <Tri
            bm="Nama anda (untuk rekod jawatankuasa)"
            zh="您的姓名（用于委员会记录）"
            en="Your name (for the committee records)"
          />
        </span>
        <input name="yourName" className={inputCls} maxLength={120} />
        {/* This name really is used: it becomes members_roles.name, and
            doc-identity.ts prints it on every confirmed document's audit line
            ("Drafted by MinitAI, confirmed by …"). Say so BEFORE they type —
            J's ask, 2026-08-25. Blank falls back to the login email. */}
        <span className="text-sm text-muted-foreground">
          <Tri
            bm="Nama ini dicetak pada minit dan dokumen yang anda sahkan nanti («disahkan oleh …»). Kalau kosong, email log masuk anda yang digunakan."
            zh="之后您确认会议记录和文件时，落款会印这个名字（「confirmed by …」）。留空就会印您的登入 email。"
            en="This name is printed on the minutes and documents you confirm later (“confirmed by …”). If left blank, your login email is used instead."
          />
        </span>
      </label>

      {/* B-5 (建議①②): what KIND of organisation this is. Two big choices,
          not a bare enum: a committee-type org gets the same features minus
          the eROSES/annual-return nagging that does not apply to it. */}
      <fieldset className="flex flex-col gap-2">
        <legend className="text-base font-semibold">
          <Tri bm="Jenis pertubuhan" zh="机构类型" en="Type of organisation" />
        </legend>
        <label
          className={`flex cursor-pointer flex-col rounded-md border-2 px-4 py-3 ${
            orgType === "registered"
              ? "border-[color:var(--v2-primary)] bg-[color:var(--v2-primary-soft)]"
              : "border-[color:var(--v2-outline-border)]"
          }`}
        >
          <span className="flex items-center gap-2 text-base font-semibold">
            <input
              type="radio"
              name="orgType"
              value="registered"
              checked={orgType === "registered"}
              onChange={() => setOrgType("registered")}
              className="h-5 w-5 accent-[color:var(--v2-primary)]"
            />
            <Tri
              bm="Persatuan berdaftar (ROS/PPM)"
              zh="注册社团（ROS/PPM）"
              en="Registered society (ROS/PPM)"
            />
          </span>
          <span className="pl-7 text-sm text-muted-foreground">
            <Tri
              bm="Didaftarkan dengan Jabatan Pendaftaran Pertubuhan — MinitAI mengingatkan Penyata Tahunan eROSES."
              zh="在社团注册局注册的社团 —— MinitAI 会提醒 eROSES 年度呈报。"
              en="Registered with the Registrar of Societies — MinitAI reminds you about the eROSES Annual Return."
            />
          </span>
        </label>
        <label
          className={`flex cursor-pointer flex-col rounded-md border-2 px-4 py-3 ${
            orgType === "committee"
              ? "border-[color:var(--v2-primary)] bg-[color:var(--v2-primary-soft)]"
              : "border-[color:var(--v2-outline-border)]"
          }`}
        >
          <span className="flex items-center gap-2 text-base font-semibold">
            <input
              type="radio"
              name="orgType"
              value="committee"
              checked={orgType === "committee"}
              onChange={() => setOrgType("committee")}
              className="h-5 w-5 accent-[color:var(--v2-primary)]"
            />
            <Tri
              bm="Jawatankuasa dalaman / sementara"
              zh="内部／临时委员会"
              en="Internal / ad-hoc committee"
            />
          </span>
          <span className="pl-7 text-sm text-muted-foreground">
            <Tri
              bm="Jawatankuasa acara, tabung khas dan seumpamanya — semua ciri yang sama, tanpa peringatan eROSES."
              zh="活动筹委会、专款小组之类 —— 功能都一样，只是没有 eROSES 提醒。"
              en="Event committees, special funds and the like — same features, without the eROSES reminders."
            />
          </span>
        </label>
      </fieldset>

      {orgType === "registered" && (
        <label className="flex flex-col gap-1">
          <span className="text-base font-semibold">
            <Tri
              bm="No. pendaftaran PPM/ROS"
              zh="PPM/ROS 注册号"
              en="PPM/ROS registration no."
            />
          </span>
          <input name="ppmNo" className={inputCls} maxLength={64} placeholder="PPM-000-00-00000000" />
          {/* C-1 (anti-impersonation v1): when filled it is printed on
              official document letterheads, so a reader can check it. */}
          <span className="text-sm text-muted-foreground">
            <Tri
              bm="Jika diisi, nombor ini dicetak pada kepala surat dokumen rasmi anda — orang boleh menyemaknya."
              zh="填了的话，这个号码会印在正式文件的页首 —— 别人可以核对。"
              en="If filled in, this number is printed on your official document letterheads — anyone can check it."
            />
          </span>
        </label>
      )}

      {/* C-2 (work order 27): brand-new, or already running for years? Only
          the landing card's order changes — no feature is gated on this. */}
      <fieldset className="flex flex-col gap-2">
        <legend className="text-base font-semibold">
          <Tri
            bm="Pertubuhan ini…"
            zh="这个社团是……"
            en="This organisation is…"
          />
        </legend>
        <div className="grid gap-2 @xl:grid-cols-2">
          {(
            [
              {
                value: "existing" as const,
                bm: "Sudah lama wujud",
                zh: "已成立多年的",
                en: "Established, running for a while",
                subBm: "Ada perlembagaan, AJK dan rekod sedia ada untuk dimasukkan",
                subZh: "已有章程、理事和旧记录可以放进来",
                subEn: "Has a constitution, committee and past records to bring in",
              },
              {
                value: "new" as const,
                bm: "Baru ditubuhkan",
                zh: "新成立的",
                en: "Newly formed",
                subBm: "Bermula dari kosong — MinitAI mengiringi dari hari pertama",
                subZh: "从零开始 —— MinitAI 从第一天陪着记",
                subEn: "Starting fresh — MinitAI records from day one",
              },
            ]
          ).map((opt) => (
            <label
              key={opt.value}
              className={`flex cursor-pointer flex-col rounded-md border-2 px-4 py-3 ${
                societyAge === opt.value
                  ? "border-[color:var(--v2-primary)] bg-[color:var(--v2-primary-soft)]"
                  : "border-[color:var(--v2-outline-border)]"
              }`}
            >
              <span className="flex items-center gap-2 text-base font-semibold">
                <input
                  type="radio"
                  name="societyAge"
                  value={opt.value}
                  checked={societyAge === opt.value}
                  onChange={() => setSocietyAge(opt.value)}
                  className="h-5 w-5 accent-[color:var(--v2-primary)]"
                />
                <Tri bm={opt.bm} zh={opt.zh} en={opt.en} />
              </span>
              <span className="pl-7 text-sm text-muted-foreground">
                <Tri bm={opt.subBm} zh={opt.subZh} en={opt.subEn} />
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {/* C-1 (拍板⑤): pick a plan. Trial is the default; standard/hq RECORD
          the wish and a human activates it — no prices, no checkout (D12),
          and the AI allowance stays at the trial level until activation. */}
      <fieldset className="flex flex-col gap-2">
        <legend className="text-base font-semibold">
          <Tri bm="Pelan" zh="配套" en="Plan" />
        </legend>
        <div className="grid gap-2 @xl:grid-cols-3">
          {(
            [
              {
                value: "trial" as const,
                bm: "Percubaan",
                zh: "试用",
                en: "Trial",
                subBm: "Percuma buat masa ini · 15 tindakan AI sebulan · 1 pertubuhan",
                subZh: "目前免费 · 每月 15 次 AI · 1 个机构",
                subEn: "Free for now · 15 AI actions/month · 1 organisation",
              },
              {
                value: "standard" as const,
                bm: "Biasa",
                zh: "标准",
                en: "Standard",
                subBm: "Kuota lebih besar untuk pertubuhan yang aktif",
                subZh: "给活跃社团的更大用量",
                subEn: "A bigger allowance for an active society",
              },
              {
                value: "hq" as const,
                bm: "Ibu Pejabat",
                zh: "总部",
                en: "HQ",
                subBm: "Ibu pejabat dengan rangkaian cawangan",
                subZh: "总部＋分会网络",
                subEn: "A headquarters with branches",
              },
            ]
          ).map((opt) => (
            <label
              key={opt.value}
              className={`flex cursor-pointer flex-col rounded-md border-2 px-4 py-3 ${
                plan === opt.value
                  ? "border-[color:var(--v2-primary)] bg-[color:var(--v2-primary-soft)]"
                  : "border-[color:var(--v2-outline-border)]"
              }`}
            >
              <span className="flex items-center gap-2 text-base font-semibold">
                <input
                  type="radio"
                  name="plan"
                  value={opt.value}
                  checked={plan === opt.value}
                  onChange={() => setPlan(opt.value)}
                  className="h-5 w-5 accent-[color:var(--v2-primary)]"
                />
                <Tri bm={opt.bm} zh={opt.zh} en={opt.en} />
              </span>
              <span className="pl-7 text-sm text-muted-foreground">
                <Tri bm={opt.subBm} zh={opt.subZh} en={opt.subEn} />
              </span>
            </label>
          ))}
        </div>
        {plan !== "trial" && (
          <p className="rounded-md border-2 border-amber-300 bg-amber-50 p-3 text-sm font-medium text-amber-900 dark:bg-amber-400/10 dark:text-amber-100">
            <Tri
              bm="Harga diumumkan selepas kos sebenar diukur. Pilihan anda direkodkan dan kami mengaktifkannya secara manual — sehingga itu, kuota AI kekal pada tahap percubaan (15 sebulan). Tiada bayaran diambil."
              zh="价格会在量出真实成本后公布。您的选择会先记下来，由我们人工帮您开通 —— 开通之前，AI 用量照试用（每月 15 次）。现在不会收任何钱。"
              en="Prices are announced once real costs are measured. Your choice is recorded and we activate it by hand — until then the AI allowance stays at the trial level (15/month). Nothing is charged."
            />
            {process.env.NEXT_PUBLIC_CONTACT_EMAIL ? (
              <>
                {" "}
                <a
                  href={`mailto:${process.env.NEXT_PUBLIC_CONTACT_EMAIL}`}
                  className="underline underline-offset-4"
                >
                  {process.env.NEXT_PUBLIC_CONTACT_EMAIL}
                </a>
              </>
            ) : null}
          </p>
        )}
      </fieldset>

      {parentChoices.length > 0 && (
        <label className="flex flex-col gap-1">
          <span className="text-base font-semibold">
            <Tri
              bm="Pertubuhan induk (kosongkan untuk pertubuhan baharu)"
              zh="上级组织（留空表示新的独立组织）"
              en="Parent organisation (leave empty for a new independent org)"
            />
          </span>
          <select name="parentOrgId" className={inputCls} defaultValue="">
            <option value="">
              — <Tri bm="Tiada (induk baharu)" zh="无（新总部）" en="None (new HQ)" /> —
            </option>
            {parentChoices.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </label>
      )}

      {/* The constitution. Deliberately the LAST field and clearly optional:
          somebody creating an org on a phone at 11pm does not have the book in
          front of them, and a setup step you cannot get past is how people
          abandon an app on the first screen. */}
      {!state.ok && (
        <div className="flex flex-col gap-2 rounded-md border-2 border-purple-200 bg-purple-50/50 p-4 dark:border-purple-400/30 dark:bg-purple-400/10">
          <span className="text-base font-semibold">
            📜{" "}
            <Tri
              bm="Perlembagaan (Undang-Undang Tubuh) — pilihan"
              zh="章程（Undang-Undang Tubuh）—— 可以不放"
              en="Constitution (Undang-Undang Tubuh) — optional"
            />
          </span>
          <p className="text-base text-muted-foreground">
            <Tri
              bm="Kalau ada, muat naik di sini. MinitAI membacanya dan menunjukkan nama berdaftar serta apa yang perlembagaan anda kata tentang mesyuarat — anda cuma perlu betulkan yang salah."
              zh="有的话就放进来。MinitAI 会读出注册名称，也会告诉您章程里怎么写开会那些规矩 —— 您只需要改错的地方。"
              en="Upload it here if you have it. MinitAI reads the registered name and what your constitution says about meetings — you only correct what is wrong."
            />
          </p>
          <input
            type="file"
            // No `name`: this file must NOT be serialised into the server
            // action. It is sent separately, after the organisation exists.
            accept={CONSTITUTION_ACCEPT}
            onChange={(e) => chooseFile(e.target.files?.[0] ?? null)}
            className="text-base file:mr-3 file:rounded-sm file:border-0 file:bg-[color:var(--v2-primary-fill)] file:px-4 file:py-2 file:text-base file:font-semibold file:text-white"
          />
          {file && (
            <p className="text-base font-medium">
              📄 {file.name}{" "}
              <button
                type="button"
                onClick={() => setFile(null)}
                className="underline underline-offset-4"
              >
                <Tri bm="Buang" zh="移除" en="Remove" />
              </button>
            </p>
          )}
          {fileError && (
            <p className="text-base font-medium text-red-800 dark:text-red-300">
              {fileError}
            </p>
          )}
          <p className="text-sm text-muted-foreground">
            {/* 0-2: AI-path marker stays, the "about 1%" promise is gone. */}
            <Tri
              bm="Sekali sahaja seumur hidup pertubuhan. Ini menggunakan kuota AI bulanan."
              zh="一个社团一辈子做一次。这一步会用本月的 AI 用量。"
              en="Once in the life of the society. This uses the monthly AI allowance."
            />
          </p>
        </div>
      )}

      {state.error && (
        <p className="rounded-md border-2 border-red-300 bg-red-50 p-3 text-base font-medium text-red-900">
          {localizeError(state.error)}
        </p>
      )}

      {/* 2026-07-28 AUDIT — THE app's worst dead end.
          On success this used to print a green line and stop. The user sat on
          /orgs with a confirmation and had to discover the sidebar or the ☰ menu
          unaided to find out what to do next. For someone who has never used a
          computer, that is where the journey ended.

          2026-08-22: the next step is now a PAGE, not two buttons — the person
          is taken to the constitution upload, where the same two onboarding
          buttons wait as the skip path (constitution/new-org-banner.tsx). What
          is left here is what shows for the moment the navigation takes, plus a
          plain link for the case where it does not happen at all. That link is
          not decoration: without it a failed router.replace() puts the dead end
          straight back. */}
      {state.ok ? (
        <div className="flex flex-col gap-3">
          {/* Work order 68 §1-8: SUCCESS says success, FAILURE says failure —
              never a red error inside a green "done" box. The org-created
              fact keeps its green line; the reading gets its own card. */}
          <div className="rounded-md border-2 border-green-400 bg-green-50 p-4">
            <p className="text-lg font-semibold text-green-900">
              ✓{" "}
              <Tri
                bm="Siap. Pertubuhan anda sudah didaftarkan dalam MinitAI."
                zh="好了。您的机构已经登记在 MinitAI 里。"
                en="Done. Your organisation is now set up in MinitAI."
              />
            </p>
            {!reading && !readFailed && (
              <p className="mt-2 text-base text-green-900">
                <Tri
                  bm="Membuka langkah seterusnya…"
                  zh="正在打开下一步……"
                  en="Opening the next step…"
                />{" "}
                <Link
                  href={file ? AFTER_CREATE_WITH_FILE : AFTER_CREATE_HOME}
                  className="underline underline-offset-4"
                >
                  <Tri
                    bm="Kalau halaman tidak terbuka sendiri, tekan di sini"
                    zh="如果这一页没有自己打开，请点这里"
                    en="If the page does not open by itself, tap here"
                  />{" "}
                  →
                </Link>
              </p>
            )}
          </div>
          {reading && (
            <p className="rounded-md border-2 border-input bg-white/70 p-3 text-base dark:bg-white/5">
              ⏳{" "}
              <Tri
                bm="MinitAI sedang membaca perlembagaan anda… ini boleh mengambil masa seminit untuk dokumen yang panjang."
                zh="MinitAI 正在读您的章程……文件长的话可能要等一分钟。"
                en="MinitAI is reading your constitution… a long document can take a minute."
              />
              {/* I1: a long PDF reads in parts — say which one, so the wait
                  visibly moves. */}
              {readingPart && <span className="font-medium"> · {readingPart}</span>}
            </p>
          )}
          {!reading && readFailed && (
            <div className="flex flex-col gap-2 rounded-md border-2 border-red-300 bg-red-50 p-4 dark:bg-red-400/10">
              <p className="text-base font-semibold text-red-900 dark:text-red-100">
                <Tri
                  bm="Perlembagaan tidak dapat dibaca."
                  zh="章程这次没读成功。"
                  en="The constitution could not be read this time."
                />
              </p>
              <p className="text-base font-medium whitespace-pre-line text-red-900/90 dark:text-red-100/90">
                {localizeError(readFailed)}
              </p>
              <p className="text-base text-red-900/80 dark:text-red-100/80">
                <Tri
                  bm="Pertubuhan anda tetap sudah dicipta, dan kuota tidak ditolak untuk bacaan yang gagal. Cuba sekali lagi di sini — tidak perlu cipta semula."
                  zh="您的机构还是建好了，读不成功也没有扣额度。可以直接在这里再试一次 —— 不用重新创建。"
                  en="Your organisation was still created, and a failed read is not charged. Try again right here — no need to create it again."
                />
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="lg"
                  onClick={() => {
                    if (file) void runRead(file);
                  }}
                >
                  🔄 <Tri bm="Cuba baca sekali lagi" zh="再试一次" en="Try again" />
                </Button>
                <Button asChild size="lg" variant="outline">
                  <Link href={AFTER_CREATE_WITH_FILE}>
                    <Tri
                      bm="Teruskan tanpa bacaan"
                      zh="先不读，继续下一步"
                      en="Continue without the reading"
                    />{" "}
                    →
                  </Link>
                </Button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? (
            <Tri bm="Sebentar…" zh="请稍候…" en="One moment…" />
          ) : (
            <Tri bm="Cipta Pertubuhan" zh="创建组织" en="Create organisation" />
          )}
        </Button>
      )}
    </form>
  );
}

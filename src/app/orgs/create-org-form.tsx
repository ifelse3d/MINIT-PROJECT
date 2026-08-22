"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Tri, useTriText } from "@/components/language-provider";
import { writeIntake } from "@/lib/intake-handoff";
import { createOrg, type OrgActionState } from "./actions";

const INITIAL: OrgActionState = { error: null, ok: false };

/** Where a newly created organisation goes next (2026-08-22).
 *
 *  J: "CREATE ORGANIZATION 那边不是说可以 upload 他们的 PERLEMBAGAAN 然后 AI 拿吗?"
 *  The upload has always been on /constitution and nothing on this path ever
 *  mentioned it, so nobody found it. ?setup=1 only adds the banner in
 *  constitution/new-org-banner.tsx — the page itself behaves as it always has. */
const AFTER_CREATE_HREF = "/constitution?setup=1";

/** Matches ALLOWED_MIME in /api/extract-constitution. A constitution is
 *  usually a photocopy, so a PDF is as likely as a photo. */
const CONSTITUTION_ACCEPT = "image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf";

/** Matches MAX_BYTES in the same route. Checked here too, so an 20MB scan is
 *  refused instantly instead of after a long upload on a phone connection. */
const MAX_BYTES = 8 * 1024 * 1024;

export function CreateOrgForm({
  parentChoices,
}: {
  /** Orgs the user administers (hq_admin) — allowed parents for a branch. */
  parentChoices: { id: number; name: string }[];
}) {
  const [state, formAction, pending] = useActionState(createOrg, INITIAL);
  const router = useRouter();
  const t = useTriText();

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
  const [reading, setReading] = useState(false);
  const [readFailed, setReadFailed] = useState<string | null>(null);
  /** The post-create work must run once, not on every re-render it causes. */
  const handledRef = useRef(false);

  function chooseFile(picked: File | null) {
    setFileError(null);
    if (picked && picked.size > MAX_BYTES) {
      setFileError(
        t(
          "Fail itu terlalu besar (had 8MB). Ambil gambar muka surat, atau guna PDF yang lebih kecil.",
          "这个档案太大了（上限 8MB）。可以一页一页拍照，或者用小一点的 PDF。",
          "That file is too big (8MB limit). Photograph the pages, or use a smaller PDF.",
        ),
      );
      return;
    }
    setFile(picked);
  }

  useEffect(() => {
    if (!state.ok || handledRef.current) return;
    handledRef.current = true;

    // `replace`, not `push`: Back from the constitution page must go to /orgs,
    // not to a spent form that would re-show its success panel and invite a
    // second organisation nobody asked for.
    if (!file) {
      router.replace(AFTER_CREATE_HREF);
      return;
    }

    void (async () => {
      setReading(true);
      try {
        const body = new FormData();
        body.append("photo", file);
        const res = await fetch("/api/extract-constitution", {
          method: "POST",
          body,
        });
        const json = (await res.json()) as {
          extraction?: unknown;
          error?: string;
        };
        if (!res.ok || !json.extraction) {
          // The organisation IS created — only the reading failed. Say so and
          // let the person decide, instead of navigating away from the reason.
          // The quota is refunded by the route when the vendor never answered.
          setReadFailed(
            json.error ??
              t(
                "Minit tidak dapat membaca fail itu.",
                "Minit 读不了这个档案。",
                "Minit could not read that file.",
              ),
          );
          return;
        }
        writeIntake({
          kind: "constitution",
          fileName: file.name,
          extraction: json.extraction,
        });
        router.replace(AFTER_CREATE_HREF);
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
      }
    })();
  }, [state.ok, file, router, t]);

  const inputCls =
    "w-full rounded-xl border border-white/60 bg-white/50 px-3 py-2 text-base outline-none backdrop-blur focus:ring-2 focus:ring-[#7c6cf5]/40 dark:border-white/10 dark:bg-white/5";

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1">
        <span className="text-base font-semibold">
          <Tri bm="Nama pertubuhan" zh="组织名称" en="Organisation name" />
        </span>
        <input name="name" className={inputCls} required maxLength={200} />
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
      </label>

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
        <div className="flex flex-col gap-2 rounded-xl border-2 border-purple-200 bg-purple-50/50 p-4 dark:border-purple-400/30 dark:bg-purple-400/10">
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
              bm="Kalau ada, muat naik di sini. Minit membacanya dan menunjukkan nama berdaftar serta apa yang perlembagaan anda kata tentang mesyuarat — anda cuma perlu betulkan yang salah."
              zh="有的话就放进来。Minit 会读出注册名称，也会告诉您章程里怎么写开会那些规矩 —— 您只需要改错的地方。"
              en="Upload it here if you have it. Minit reads the registered name and what your constitution says about meetings — you only correct what is wrong."
            />
          </p>
          <input
            type="file"
            // No `name`: this file must NOT be serialised into the server
            // action. It is sent separately, after the organisation exists.
            accept={CONSTITUTION_ACCEPT}
            onChange={(e) => chooseFile(e.target.files?.[0] ?? null)}
            className="text-base file:mr-3 file:rounded-full file:border-0 file:bg-[#7c6cf5] file:px-4 file:py-2 file:text-base file:font-semibold file:text-white"
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
            <Tri
              bm="Sekali sahaja seumur hidup pertubuhan. Ia mengambil 1 daripada 100 bantuan AI bulan ini."
              zh="一个社团一辈子做一次。会用掉这个月 100 次 AI 里的 1 次。"
              en="Once in the life of the society. It uses 1 of this month's 100 AI actions."
            />
          </p>
        </div>
      )}

      {state.error && (
        <p className="rounded-xl border-2 border-red-300 bg-red-50 p-3 text-base font-medium text-red-900">
          {state.error}
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
        <div className="flex flex-col gap-3 rounded-xl border-2 border-green-400 bg-green-50 p-4">
          <p className="text-lg font-semibold text-green-900">
            ✓{" "}
            <Tri
              bm="Siap. Pertubuhan anda sudah didaftarkan dalam Minit."
              zh="好了。您的机构已经登记在 Minit 里。"
              en="Done. Your organisation is now set up in Minit."
            />
          </p>
          {reading ? (
            <p className="text-base text-green-900">
              <Tri
                bm="Minit sedang membaca perlembagaan anda… ini boleh mengambil masa seminit untuk dokumen yang panjang."
                zh="Minit 正在读您的章程……文件长的话可能要等一分钟。"
                en="Minit is reading your constitution… a long document can take a minute."
              />
            </p>
          ) : readFailed ? (
            // The organisation exists; only the reading failed. Do not throw
            // the person out of the flow — tell them, and let them go on.
            <div className="flex flex-col gap-2">
              <p className="text-base font-medium text-red-800">{readFailed}</p>
              <p className="text-base text-green-900">
                <Tri
                  bm="Pertubuhan anda tetap sudah dicipta. Anda boleh cuba muat naik perlembagaan sekali lagi di halaman seterusnya."
                  zh="您的机构还是建好了。可以在下一页再上传一次章程。"
                  en="Your organisation was still created. You can try uploading the constitution again on the next page."
                />
              </p>
              <Button asChild size="lg">
                <Link href={AFTER_CREATE_HREF}>
                  <Tri bm="Teruskan" zh="继续" en="Continue" /> →
                </Link>
              </Button>
            </div>
          ) : (
            <>
              <p className="text-base text-green-900">
                <Tri
                  bm="Membuka langkah seterusnya…"
                  zh="正在打开下一步……"
                  en="Opening the next step…"
                />
              </p>
              <p className="text-base">
                <Link
                  href={AFTER_CREATE_HREF}
                  className="text-green-900 underline underline-offset-4"
                >
                  <Tri
                    bm="Kalau halaman tidak terbuka sendiri, tekan di sini"
                    zh="如果这一页没有自己打开，请点这里"
                    en="If the page does not open by itself, tap here"
                  />{" "}
                  →
                </Link>
              </p>
            </>
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

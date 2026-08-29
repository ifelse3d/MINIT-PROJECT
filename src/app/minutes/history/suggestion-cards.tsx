"use client";

// The AI suggestion cards on a confirmed minutes document (work order 64 §4).
//
// Every card is "AI 提議、人確認" made literal: the derivation (rules over the
// confirmed extraction, src/lib/minutes-suggestions.ts) proposed it, and
// NOTHING is written until the person presses confirm — which then calls the
// EXISTING write path (§1-4): addCommitteeMember for people (same-name
// question, note field, fail-open ladder all inherited), saveEvent for the
// calendar (client_id upsert inherited). No new doors into the database.
//
// A verdict — applied or ignored — is recorded through markSuggestion, so the
// same document never nags the same suggestion twice (§1-6). When migration 36
// is not applied yet the verdict is remembered in this device's localStorage
// instead, and a plain sentence on screen says so.

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tri, useLocalizedError } from "@/components/language-provider";
import { addCommitteeMember } from "@/app/members/actions";
import { saveEvent } from "@/app/calendar/actions";
import { makeEvent } from "@/lib/local-events";
import { formatDateLong } from "@/lib/date-input";
import { permissionError } from "@/lib/roles";
import { scopedKey } from "@/lib/storage-scope-core";
import type {
  EventSuggestion,
  MemberSuggestion,
  MinutesSuggestion,
} from "@/lib/minutes-suggestions";
import { markSuggestion } from "./suggestion-actions";

const ERR_EVENT_DB =
  "Belum tersimpan — cuba lagi\n没有存上 —— 请再试一次\nNot saved — please try again";
const ERR_LOGIN = "Sila log masuk semula\n请重新登入\nPlease log in again";
const ERR_NO_ORG =
  "Pilih pertubuhan dahulu\n请先选择一个机构\nChoose an organisation first";

const errorCls =
  "rounded-md border-2 border-red-300 bg-red-50 p-3 text-base font-medium whitespace-pre-line text-red-900 dark:bg-red-400/10 dark:text-red-100";

type CardStatus = {
  busy: boolean;
  done: "applied" | "ignored" | null;
  error: string | null;
  /** The members action asked "same name — another person?" — answered by
   *  re-submitting with confirmSameName=1, exactly like the /members form. */
  askSameName: { name: string; official: string } | null;
};

const IDLE: CardStatus = { busy: false, done: null, error: null, askSameName: null };

function hiddenStoreKey(docId: number): string {
  return scopedKey(`suggestion-hidden:${docId}`);
}

function readHidden(docId: number): string[] {
  try {
    const raw = localStorage.getItem(hiddenStoreKey(docId));
    const arr = raw ? (JSON.parse(raw) as string[]) : [];
    return Array.isArray(arr) ? arr.filter((k) => typeof k === "string") : [];
  } catch {
    return [];
  }
}

function rememberHidden(docId: number, key: string): void {
  try {
    const next = [...new Set([...readHidden(docId), key])].slice(0, 100);
    localStorage.setItem(hiddenStoreKey(docId), JSON.stringify(next));
  } catch {
    // Storage unavailable — the card stays hidden for this visit only.
  }
}

/** The source line every card must carry (§1-5: 沒有來源不准出現). */
function SourceLine({ source }: { source: MinutesSuggestion["source"] }) {
  return (
    <p className="rounded-sm border-l-4 border-[color:var(--v2-primary)]/40 bg-black/5 p-2 pl-3 text-sm text-muted-foreground dark:bg-white/5">
      <Tri bm="Kerana minit menulis:" zh="因为会议记录写了：" en="Because the minutes say:" />{" "}
      <span className="font-medium text-[color:var(--v2-text)]">
        “{source.snippet}”
      </span>{" "}
      <span className="whitespace-nowrap">({source.location})</span>
    </p>
  );
}

export function SuggestionCards({
  docId,
  suggestions,
  ignoredCount,
  marksStored,
}: {
  docId: number;
  suggestions: MinutesSuggestion[];
  ignoredCount: number;
  marksStored: boolean;
}) {
  const localizeError = useLocalizedError();
  const [status, setStatus] = useState<Record<string, CardStatus>>({});
  // Cards confirmed in THIS visit. addCommitteeMember revalidates the route,
  // so a confirmed member card falls out of `suggestions` on the server
  // re-render (the roster now dedupes it) — without this snapshot the ✓ and
  // its "go and see" link would vanish with it.
  const [confirmedHere, setConfirmedHere] = useState<
    { key: string; type: MinutesSuggestion["type"]; label: string }[]
  >([]);
  // Per-device dismissals (the migration-36-not-yet fallback). Read after
  // mount — the server cannot know this device's list, and reading storage
  // during render would make SSR and CSR disagree.
  const [hiddenLocal, setHiddenLocal] = useState<string[]>([]);
  useEffect(() => {
    const timer = setTimeout(() => setHiddenLocal(readHidden(docId)), 0);
    return () => clearTimeout(timer);
  }, [docId]);

  const of = (key: string): CardStatus => status[key] ?? IDLE;
  const patch = (key: string, p: Partial<CardStatus>) =>
    setStatus((prev) => ({ ...prev, [key]: { ...(prev[key] ?? IDLE), ...p } }));

  async function recordVerdict(key: string, action: "applied" | "ignored") {
    const res = await markSuggestion({ docId, suggestionKey: key, action });
    if (res.ok && !res.stored) rememberHidden(docId, key);
    return res;
  }

  async function confirmMember(card: MemberSuggestion, confirmSameName: boolean) {
    patch(card.key, { busy: true, error: null });
    try {
      const fd = new FormData();
      fd.set("position", card.position);
      fd.set("personName", card.personName);
      fd.set("termStart", card.termStartIso ?? "");
      if (confirmSameName) fd.set("confirmSameName", "1");
      const res = await addCommitteeMember({ error: null, ok: false }, fd);
      if (res.askSameName) {
        patch(card.key, { busy: false, askSameName: res.askSameName });
        return;
      }
      if (!res.ok) {
        patch(card.key, { busy: false, error: res.error, askSameName: null });
        return;
      }
      setConfirmedHere((prev) => [
        ...prev,
        { key: card.key, type: card.type, label: `${card.personName} — ${card.position}` },
      ]);
      await recordVerdict(card.key, "applied");
      patch(card.key, { busy: false, done: "applied", askSameName: null });
    } catch {
      patch(card.key, { busy: false, error: ERR_EVENT_DB });
    }
  }

  async function confirmEvent(card: EventSuggestion) {
    patch(card.key, { busy: true, error: null });
    try {
      const outcome = await saveEvent(
        makeEvent({ title: card.title, dateIso: card.dateIso, timeText: card.timeText }),
      );
      if (!outcome.ok) {
        patch(card.key, {
          busy: false,
          error:
            outcome.reason === "no_session"
              ? ERR_LOGIN
              : outcome.reason === "no_org"
                ? ERR_NO_ORG
                : outcome.reason === "permission"
                  ? permissionError("calendar_write")
                  : ERR_EVENT_DB,
        });
        return;
      }
      setConfirmedHere((prev) => [
        ...prev,
        { key: card.key, type: card.type, label: card.title },
      ]);
      await recordVerdict(card.key, "applied");
      patch(card.key, { busy: false, done: "applied" });
    } catch {
      patch(card.key, { busy: false, error: ERR_EVENT_DB });
    }
  }

  async function ignore(card: MinutesSuggestion) {
    patch(card.key, { busy: true, error: null });
    try {
      const res = await recordVerdict(card.key, "ignored");
      if (!res.ok) {
        patch(card.key, { busy: false, error: res.error });
        return;
      }
      patch(card.key, { busy: false, done: "ignored", askSameName: null });
    } catch {
      patch(card.key, { busy: false, error: ERR_EVENT_DB });
    }
  }

  const visible = suggestions.filter((s) => !hiddenLocal.includes(s.key));
  const dismissedNow = visible.filter((s) => of(s.key).done === "ignored").length;
  // Confirmed-this-visit cards that the server re-render already deduped away
  // — their ✓ acknowledgment still renders below.
  const confirmedGone = confirmedHere.filter(
    (c) => !visible.some((s) => s.key === c.key),
  );
  if (visible.length === 0 && ignoredCount === 0 && confirmedGone.length === 0)
    return null;

  return (
    // data-probe: the document text below the cards repeats the same
    // resolution wording, so probes must scope their reads to this box.
    <Card data-probe="suggestion-cards">
      <CardHeader>
        <CardTitle className="text-xl">
          💡{" "}
          <Tri
            bm="Cadangan daripada minit ini"
            zh="从这份会议记录读到的建议"
            en="Suggested from these minutes"
          />
        </CardTitle>
        <CardDescription>
          <Tri
            bm="MinitAI hanya membaca apa yang telah DISAHKAN di atas — tiada apa-apa ditulis ke dalam sistem selagi anda tidak menekan sahkan."
            zh="MinitAI 只读上面已确认的内容来提议 —— 您按了「确认」才会写进系统，不按就什么都不会发生。"
            en="MinitAI only reads what was CONFIRMED above — nothing is written into the system until you press confirm."
          />
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {visible.map((s) => {
          const st = of(s.key);
          if (st.done === "ignored") return null;
          return (
            <div
              key={s.key}
              className="flex flex-col gap-2 rounded-md border border-input bg-white/40 p-3 dark:bg-white/5"
            >
              {s.type === "add_member" ? (
                <>
                  <p className="text-base font-semibold">
                    👥{" "}
                    <Tri
                      bm="Tambah ke senarai AJK:"
                      zh="加进理事名单："
                      en="Add to the committee list:"
                    />{" "}
                    {s.personName} — {s.position}
                  </p>
                  {s.termStartIso && (
                    <p className="text-sm text-muted-foreground">
                      <Tri
                        bm={`Tarikh perlantikan akan diisi sebagai ${formatDateLong(s.termStartIso, "bm")} (tarikh mesyuarat ini).`}
                        zh={`任命日期会填 ${formatDateLong(s.termStartIso, "zh")}（就是这场会议的日期）。`}
                        en={`The appointment date will be filled in as ${formatDateLong(s.termStartIso, "en")} (this meeting's date).`}
                      />
                    </p>
                  )}
                  {s.replaces.length > 0 && (
                    <p className="text-sm text-amber-800 dark:text-amber-200">
                      🔁{" "}
                      <Tri
                        bm={`Jawatan ini sekarang dipegang oleh ${s.replaces.join("、")}. Jika ini pertukaran, selepas mengesahkan sila padam yang lama di halaman AJK — sistem tidak akan memadam sesiapa secara automatik.`}
                        zh={`这个职位现在名单上是 ${s.replaces.join("、")}。如果是换届，确认后请自己去名册删掉卸任的那位 —— 系统不会自动删任何人。`}
                        en={`This position is currently held by ${s.replaces.join(", ")}. If this is a handover, remove the outgoing person on the committee page after confirming — nothing is removed automatically.`}
                      />
                    </p>
                  )}
                </>
              ) : (
                <p className="text-base font-semibold">
                  📅{" "}
                  <Tri bm="Tambah ke kalendar:" zh="加进日历：" en="Add to the calendar:" />{" "}
                  {s.title} —{" "}
                  <Tri
                    bm={formatDateLong(s.dateIso, "bm")}
                    zh={formatDateLong(s.dateIso, "zh")}
                    en={formatDateLong(s.dateIso, "en")}
                  />
                  {s.timeText !== "" ? ` · ${s.timeText}` : ""}
                </p>
              )}

              <SourceLine source={s.source} />

              {st.done === "applied" ? (
                <p className="text-base font-medium text-green-700 dark:text-green-300">
                  ✓{" "}
                  {s.type === "add_member" ? (
                    <>
                      <Tri bm="Sudah ditambah." zh="加好了。" en="Added." />{" "}
                      <Link href="/members" className="underline underline-offset-4">
                        <Tri bm="Lihat senarai AJK" zh="去名册看看" en="See the committee list" />{" "}
                        →
                      </Link>
                    </>
                  ) : (
                    <>
                      <Tri bm="Sudah dalam kalendar." zh="加进日历了。" en="On the calendar." />{" "}
                      <Link href="/calendar" className="underline underline-offset-4">
                        <Tri bm="Lihat kalendar" zh="去日历看看" en="See the calendar" /> →
                      </Link>
                    </>
                  )}
                </p>
              ) : (
                <>
                  {/* B-6 inherited: same name, different IC name — ask, then
                      re-submit the same card with the person's answer. */}
                  {st.askSameName && (
                    <div className="flex flex-col gap-2 rounded-md border-2 border-amber-300 bg-amber-50 p-3 dark:bg-amber-400/10">
                      <p className="text-base font-medium text-amber-900 dark:text-amber-100">
                        🤔{" "}
                        <Tri
                          bm={`Sudah ada "${st.askSameName.name}" dalam senarai${st.askSameName.official ? ` (nama IC: ${st.askSameName.official})` : ""}. Orang LAIN yang sama nama?`}
                          zh={`名单里已经有「${st.askSameName.name}」${st.askSameName.official ? `（身份证名字：${st.askSameName.official}）` : ""}。这是另一位同名的人吗？`}
                          en={`"${st.askSameName.name}" is already on the list${st.askSameName.official ? ` (IC name: ${st.askSameName.official})` : ""}. Is this a DIFFERENT person with the same name?`}
                        />
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          size="sm"
                          disabled={st.busy}
                          onClick={() => {
                            if (s.type === "add_member") void confirmMember(s, true);
                          }}
                        >
                          ✓{" "}
                          <Tri
                            bm="Ya, orang lain — tambah juga"
                            zh="是另一位 —— 照加"
                            en="Yes, another person — add them"
                          />
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={st.busy}
                          onClick={() => patch(s.key, { askSameName: null })}
                        >
                          <Tri bm="Batal" zh="取消" en="Cancel" />
                        </Button>
                      </div>
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      disabled={st.busy}
                      onClick={() =>
                        s.type === "add_member"
                          ? void confirmMember(s, false)
                          : void confirmEvent(s)
                      }
                    >
                      {st.busy ? (
                        <Tri bm="…" zh="…" en="…" />
                      ) : (
                        <>
                          ✓ <Tri bm="Sahkan, tambah" zh="确认加入" en="Confirm and add" />
                        </>
                      )}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={st.busy}
                      onClick={() => void ignore(s)}
                    >
                      <Tri bm="Abaikan" zh="忽略" en="Ignore" />
                    </Button>
                  </div>

                  {st.error && <p className={errorCls}>{localizeError(st.error)}</p>}
                </>
              )}
            </div>
          );
        })}

        {confirmedGone.map((c) => (
          <p
            key={c.key}
            className="text-base font-medium text-green-700 dark:text-green-300"
          >
            ✓ {c.label} —{" "}
            {c.type === "add_member" ? (
              <>
                <Tri bm="sudah ditambah." zh="加好了。" en="added." />{" "}
                <Link href="/members" className="underline underline-offset-4">
                  <Tri bm="Lihat senarai AJK" zh="去名册看看" en="See the committee list" />{" "}
                  →
                </Link>
              </>
            ) : (
              <>
                <Tri bm="sudah dalam kalendar." zh="加进日历了。" en="on the calendar." />{" "}
                <Link href="/calendar" className="underline underline-offset-4">
                  <Tri bm="Lihat kalendar" zh="去日历看看" en="See the calendar" /> →
                </Link>
              </>
            )}
          </p>
        ))}

        {(ignoredCount > 0 || dismissedNow > 0) && (
          <p className="text-sm text-muted-foreground">
            <Tri
              bm={`${ignoredCount + dismissedNow} cadangan diabaikan — direkodkan, tidak akan ditanya lagi untuk minit ini.`}
              zh={`已忽略 ${ignoredCount + dismissedNow} 条建议 —— 有记录在案，这份会议记录不会再问同一条。`}
              en={`${ignoredCount + dismissedNow} suggestion(s) ignored — recorded, and never asked again for these minutes.`}
            />
          </p>
        )}

        {!marksStored && (
          <p className="text-sm text-muted-foreground">
            <Tri
              bm="Pangkalan data belum ada jadual rekod ini (migration 36) — buat masa ini 'abaikan' diingat pada peranti ini sahaja."
              zh="数据库还没开通记录表（migration 36）——目前「忽略」只记在这台设备上。"
              en="The database does not have the record table yet (migration 36) — for now, 'ignore' is remembered on this device only."
            />
          </p>
        )}
      </CardContent>
    </Card>
  );
}

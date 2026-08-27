"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Tri, useTriText } from "@/components/language-provider";
import { VoiceButton } from "@/components/voice-input";
import { MEETING_TYPES, meetingTypeUiLabelTri } from "@/lib/meeting-types";
import { toIsoDate } from "@/lib/date-input";
import { EMPTY_MEETING_FACTS, type KnownMeetingFacts } from "@/lib/meeting-facts";

// ---------------------------------------------------------------------------
// THREE BOXES BEFORE THE PHOTO GOES ANYWHERE.
//
// J, on the very first item of his UX list: 「放照片下去他还是直接走，想 type 跟他
// 说这是什么会议没办法；有时照片里写的是活动时间不是会议时间」.
//
// The second half is the one that cannot be fixed with a better prompt. A
// whiteboard photographed after a meeting often carries TWO dates — the day the
// meeting happened, and the day of the event it agreed to hold. They look
// identical on the board. The information that tells them apart is not in the
// picture; it is in the head of the person who was there. So we ask them, and
// what they say wins over what the model reads (lib/meeting-facts.ts).
//
// EVERY BOX IS OPTIONAL, and that is not politeness. Somebody photographing a
// stack of old minutes does not know each meeting's type off the top of their
// head, and a required field would make them guess — which is worse than
// letting the model guess, because a human guess arrives marked `confirmed`.
// Blank means "you read it", never "there is none".
//
// The panel also says what the tap will cost, because "choosing a file silently
// charged you" is on the UX defect list and this is the last moment before it
// happens.
// ---------------------------------------------------------------------------

const field =
  "min-h-11 w-full rounded-md border border-input bg-background px-3 text-base shadow-sm focus:outline-none focus:ring-2 focus:ring-ring";

export function BeforeReading({
  onCancel,
  onRead,
  fileName,
  busy,
}: {
  onCancel: () => void;
  onRead: (facts: KnownMeetingFacts) => void;
  fileName: string;
  busy: boolean;
}) {
  const t = useTriText();
  const [facts, setFacts] = useState<KnownMeetingFacts>(EMPTY_MEETING_FACTS);
  const [dateText, setDateText] = useState("");

  return (
    <div className="flex flex-col gap-4 rounded-2xl border-2 border-[color:var(--v2-border)] bg-white/70 p-4 dark:bg-white/5">
      <div>
        <p className="text-lg font-semibold">
          <Tri
            bm="Sebelum Minit membaca — ada apa-apa yang anda sudah tahu?"
            zh="在 Minit 读之前 —— 有没有您本来就知道的？"
            en="Before Minit reads it — is there anything you already know?"
          />
        </p>
        <p className="mt-1 text-base text-muted-foreground">📄 {fileName}</p>
      </div>

      <p className="text-base text-muted-foreground">
        <Tri
          bm="Semua ini boleh dibiarkan kosong — Minit akan cuba membacanya sendiri. Isi yang anda pasti sahaja: apa yang anda tulis di sini menang, jadi Minit tidak perlu meneka."
          zh="全部都可以留空 —— Minit 会自己去读。只填您确定的：您在这里写的会盖过 Minit 读到的，它就不用猜。"
          en="You can leave all of this blank — Minit will try to read it. Fill in only what you are sure of: what you put here wins, so Minit does not have to guess."
        />
      </p>

      <div className="grid gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-muted-foreground">
            <Tri bm="Jenis mesyuarat" zh="这是什么会议" en="What kind of meeting" />
          </span>
          <select
            value={facts.meetingType}
            onChange={(e) => setFacts((f) => ({ ...f, meetingType: e.target.value }))}
            className={field}
          >
            <option value="">
              {t("Biar Minit baca", "让 Minit 自己读", "Let Minit read it")}
            </option>
            {MEETING_TYPES.map((mt) => {
              const l = meetingTypeUiLabelTri(mt);
              return (
                <option key={mt} value={mt}>
                  {t(l.bm, l.zh, l.en)}
                </option>
              );
            })}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-muted-foreground">
            <Tri bm="Tarikh MESYUARAT" zh="开会那一天" en="The MEETING date" />
          </span>
          <input
            type="date"
            value={dateText}
            onChange={(e) => {
              setDateText(e.target.value);
              // toIsoDate, not the raw value: an old Android WebView renders
              // type="date" as a plain text box, and somebody typing 2/2/2026
              // into it must not silently produce an illegal date.
              setFacts((f) => ({ ...f, meetingDateIso: toIsoDate(e.target.value) ?? "" }));
            }}
            className={field}
          />
          {/* The whole reason this box exists. */}
          <span className="text-sm text-muted-foreground">
            <Tri
              bm="Bukan tarikh acara yang dibincangkan."
              zh="不是会议里讨论的那个活动的日期。"
              en="Not the date of an event the meeting talked about."
            />
          </span>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-muted-foreground">
            <Tri bm="Tempat" zh="在哪里开" en="Where it was held" />
          </span>
          <input
            type="text"
            value={facts.venue}
            onChange={(e) => setFacts((f) => ({ ...f, venue: e.target.value }))}
            placeholder={t("cth. Dewan kuil", "例如：庙里的礼堂", "e.g. the temple hall")}
            className={field}
          />
        </label>
      </div>

      {/* F-2 (2026-08-25): the chat-style supplement box. What goes in here is
          sent WITH the photo, as labelled data, so the model reads with the
          person's own knowledge — abbreviations, spellings, which date is
          which. This is the fix for "想 type 跟他说没办法". */}
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium text-muted-foreground">
          <Tri
            bm="Ada singkatan, nama atau tarikh yang Minit patut tahu?"
            zh="有缩写、人名、日期要补充给 Minit 吗？"
            en="Any abbreviations, names or dates Minit should know?"
          />
        </span>
        <span className="flex items-start gap-2">
          <textarea
            value={facts.notes}
            onChange={(e) => setFacts((f) => ({ ...f, notes: e.target.value }))}
            rows={2}
            maxLength={2000}
            placeholder={t(
              'cth. "LKY = Lim Kok Yuan · mesyuarat di dewan lama"',
              "例如：「LKY = 林国源 · 初八是农历 · 开会在旧礼堂」",
              'e.g. "LKY = Lim Kok Yuan · the meeting was in the old hall"',
            )}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-base shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          {/* F-3: dictate the supplement instead of typing it. */}
          <VoiceButton
            onText={(spoken) =>
              setFacts((f) => ({
                ...f,
                notes: f.notes.trim() === "" ? spoken : `${f.notes} ${spoken}`,
              }))
            }
          />
        </span>
      </label>

      <div className="flex flex-wrap items-center gap-3">
        <Button size="lg" className="text-base" disabled={busy} onClick={() => onRead(facts)}>
          {busy ? (
            <Tri bm="AI sedang membaca…" zh="AI 读取中…" en="AI is reading…" />
          ) : (
            <Tri bm="Baca sekarang" zh="现在开始读" en="Read it now" />
          )}
        </Button>
        <Button variant="outline" size="lg" disabled={busy} onClick={onCancel}>
          <Tri bm="Pilih fail lain" zh="换一个档案" en="Choose a different file" />
        </Button>
        {/* Said HERE, at the last moment before it happens, because "choosing a
            file silently charged you" is on the UX defect list. */}
        <span className="text-sm text-muted-foreground">
          {/* 0-2: path marker only — no "about X%" promise. */}
          <Tri
            bm="Ini menggunakan kuota AI bulanan."
            zh="这会用本月的 AI 用量。"
            en="This uses the monthly AI allowance."
          />
        </span>
      </div>
    </div>
  );
}

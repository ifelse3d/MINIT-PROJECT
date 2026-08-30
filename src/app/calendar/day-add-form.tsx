"use client";

// ---------------------------------------------------------------------------
// ADD SOMETHING TO THIS DAY — inside the day panel.
//
// WHY (user request, 2026-07-28: "点了日期进去看到的也是不好。然后点了进去也没办法
// add event 或者写 note")
//
// Tapping a date opened a read-only summary. The one thing a person obviously
// wants to do having tapped 15 August — write down that something is happening on
// 15 August — was not possible; they had to leave, go to /calendar/add, and type
// the date again by hand.
//
// The DATE IS ALREADY KNOWN here, so this form only asks for what Minit cannot
// know: what it is, optionally a time, optionally a note to self. Title is the
// only required field, and it is the only field visible until you start.
// ---------------------------------------------------------------------------

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tri, useTriText } from "@/components/language-provider";
import { makeEvent, type SimpleEvent } from "@/lib/local-events";

export function DayAddForm({
  dayIso,
  onAdd,
}: {
  dayIso: string;
  onAdd: (event: SimpleEvent) => void;
}) {
  const t = useTriText();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [timeText, setTimeText] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [justAdded, setJustAdded] = useState<string | null>(null);

  const inputClass =
    "h-12 w-full rounded-md border-2 border-input bg-white px-3 text-base dark:bg-white/5";

  function submit() {
    const trimmed = title.trim();
    if (!trimmed) {
      setError(
        t(
          "Tulis apa yang berlaku pada hari ini dahulu.",
          "请先写下这一天有什么事。",
          "Write what is happening on this day first.",
        ),
      );
      return;
    }
    onAdd(makeEvent({ title: trimmed, dateIso: dayIso, timeText, note }));
    setJustAdded(trimmed);
    setTitle("");
    setTimeText("");
    setNote("");
    setError(null);
    setOpen(false);
  }

  if (!open) {
    return (
      <div className="flex flex-col gap-2">
        {justAdded && (
          <p className="rounded-md border-2 border-green-400 bg-green-50 p-3 text-base font-medium text-green-900 dark:bg-green-400/10 dark:text-green-100">
            ✓{" "}
            <Tri
              bm={`"${justAdded}" ditambah pada hari ini.`}
              zh={`已经把「${justAdded}」加到这一天了。`}
              en={`"${justAdded}" added to this day.`}
            />
          </p>
        )}
        <Button size="lg" onClick={() => setOpen(true)} className="self-start">
          <Plus className="h-5 w-5" strokeWidth={2.4} />
          <Tri
            bm="Tambah acara atau nota pada hari ini"
            zh="给这一天加活动或笔记"
            en="Add an event or a note to this day"
          />
        </Button>
      </div>
    );
  }

  return (
    <form
      className="flex flex-col gap-3 rounded-md border-2 border-[#a855f7]/40 bg-white/70 p-4 dark:bg-white/5"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <p className="text-base font-semibold">
        <Tri bm="Tambah pada" zh="加到" en="Add to" />{" "}
        <span className="tabular-nums">{dayIso}</span>
      </p>

      <label className="flex flex-col gap-1.5">
        <span className="text-base font-semibold">
          <Tri
            bm="Apa yang berlaku?"
            zh="这一天有什么事？"
            en="What is happening?"
          />
        </span>
        <input
          autoFocus
          value={title}
          maxLength={140}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t(
            "cth: Sembahyang bulanan",
            "例如：每月拜神",
            "e.g. Monthly prayers",
          )}
          className={inputClass}
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-base font-semibold">
          <Tri
            bm="Pukul berapa? (pilihan)"
            zh="几点？（选填）"
            en="What time? (optional)"
          />
        </span>
        <input
          value={timeText}
          maxLength={40}
          onChange={(e) => setTimeText(e.target.value)}
          placeholder={t("cth: 7:30 malam", "例如：晚上 7:30", "e.g. 7:30pm")}
          className={inputClass}
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-base font-semibold">
          <Tri
            bm="Nota untuk diri sendiri (pilihan)"
            zh="给自己的笔记（选填）"
            en="A note to yourself (optional)"
          />
        </span>
        <textarea
          value={note}
          rows={2}
          maxLength={500}
          onChange={(e) => setNote(e.target.value)}
          placeholder={t(
            "cth: kena tempah kerusi dulu",
            "例如：要先订椅子",
            "e.g. need to book the chairs first",
          )}
          className="w-full resize-y rounded-md border-2 border-input bg-white p-3 text-base dark:bg-white/5"
        />
      </label>

      {error && (
        <p className="text-base font-semibold text-red-700">{error}</p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="lg">
          <Tri bm="Simpan" zh="保存" en="Save" />
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            setOpen(false);
            setError(null);
          }}
        >
          <Tri bm="Batal" zh="取消" en="Cancel" />
        </Button>
      </div>

      <p className="text-base text-muted-foreground">
        <Tri
          bm="Acara ini disimpan pada peranti ini sahaja buat masa ini."
          zh="这个活动目前只存在这台设备上。"
          en="For now this is saved on this device only."
        />
      </p>
    </form>
  );
}

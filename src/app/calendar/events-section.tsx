"use client";

import { joinUserError, USER_ERRORS } from "@/lib/user-errors";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tri, useTriText } from "@/components/language-provider";
import type { EventExtraction } from "@/lib/extraction";
import type { SimpleEvent } from "@/lib/local-events";

// ---------------------------------------------------------------------------
// EVENT ENTRY — AI paste-box first (the fast way), manual quick-add second.
// Extracted from the old Deadlines tab; the events LIST now lives in the
// Upcoming sidebar, so this component only ADDS events (via onAdd — the
// /calendar shell owns the localStorage state). Events: the admin pastes free
// text (year plan, meeting decisions) and the AI PROPOSES events — the human
// ticks each one (not a chatbot, CLAUDE.md rule 10).
// ---------------------------------------------------------------------------

type Conf = "confirmed" | "check" | "missing";
type ProposedRow = {
  title: string;
  dateIso: string;
  timeText: string;
  titleConf: Conf;
  dateConf: Conf;
  snippet: string;
  added: boolean;
};

function toRow(e: EventExtraction): ProposedRow {
  return {
    title: e.title.value,
    dateIso: e.date.value,
    timeText: e.time.value,
    titleConf: e.title.confidence,
    dateConf: e.date.confidence,
    snippet: e.date.source_ref?.snippet ?? e.title.source_ref?.snippet ?? "",
    added: false,
  };
}

export function EventsSection({ onAdd }: { onAdd: (ev: SimpleEvent) => void }) {
  const t = useTriText();

  // AI paste-box state
  const [pasteText, setPasteText] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [proposed, setProposed] = useState<ProposedRow[] | null>(null);
  const [file, setFile] = useState<File | null>(null);

  // manual quick-add state
  const [title, setTitle] = useState("");
  const [dateIso, setDateIso] = useState("");
  const [timeText, setTimeText] = useState("");

  async function askAi() {
    if (!pasteText.trim() && !file) return;
    setAiError(null);
    setAiBusy(true);
    setProposed(null);
    try {
      const form = new FormData();
      if (pasteText.trim()) form.append("text", pasteText);
      if (file) form.append("file", file);
      const res = await fetch("/api/extract-events", { method: "POST", body: form });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? joinUserError(USER_ERRORS.aiUnavailable));
      setProposed((body.events as EventExtraction[]).map(toRow));
    } catch (e) {
      setAiError(e instanceof Error ? e.message : String(e));
    } finally {
      setAiBusy(false);
    }
  }

  function editProposed(idx: number, patch: Partial<ProposedRow>) {
    setProposed((prev) =>
      prev ? prev.map((x, i) => (i === idx ? { ...x, ...patch } : x)) : prev
    );
  }

  function addProposed(idx: number) {
    if (!proposed) return;
    const p = proposed[idx];
    if (!p.dateIso) return;
    onAdd({
      id: `${Date.now()}-${idx}`,
      title: p.title.trim() || t("Acara", "活动", "Event"),
      dateIso: p.dateIso,
      timeText: p.timeText.trim(),
    });
    editProposed(idx, { added: true });
  }

  function addEvent(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !dateIso) return;
    onAdd({ id: `${Date.now()}`, title: title.trim(), dateIso, timeText: timeText.trim() });
    setTitle("");
    setDateIso("");
    setTimeText("");
  }

  const confidenceBadge = (level: Conf) =>
    level === "confirmed" ? (
      <Badge variant="outline" className="border-green-400 bg-green-100 text-green-900">
        <Tri bm="pasti" zh="确定" en="sure" />
      </Badge>
    ) : level === "check" ? (
      <Badge variant="outline" className="border-amber-400 bg-amber-100 text-amber-900">
        <Tri bm="semak" zh="要查" en="check" />
      </Badge>
    ) : (
      <Badge variant="outline" className="border-red-400 bg-red-100 text-red-900">
        <Tri bm="tiada" zh="没写" en="missing" />
      </Badge>
    );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">
          🎉 <Tri bm="Acara persatuan" zh="社团活动" en="Society events" />
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {/* AI paste-box */}
        <div className="rounded-md border-2 border-violet-200 bg-violet-50/50 p-4">
          <div className="mb-2 font-semibold">
            🤖 <Tri bm="Tampal rancangan anda" zh="贴上你们的计划" en="Paste your plans" />
          </div>
          <textarea
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            rows={4}
            placeholder={t(
              "cth: AGM 30 Ogos 10 pagi dewan utama. Makan malam tahunan 12 Sept 7:30 malam...",
              "例如：常年大会 8月30日上午10点。周年晚宴 9月12日晚上7点半……",
              "e.g. AGM 30 Aug 10am main hall. Annual dinner 12 Sept 7:30pm..."
            )}
            className="w-full rounded-sm border bg-background p-3 text-base outline-none focus:ring-2 focus:ring-violet-300"
          />
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-sm border-2 border-violet-300 bg-white px-4 py-2 font-medium hover:bg-violet-100 dark:bg-white/5">
              📎{" "}
              {file ? (
                file.name
              ) : (
                <Tri bm="atau lampirkan gambar / Excel" zh="或附上照片 / Excel" en="or attach photo / Excel" />
              )}
              <input
                type="file"
                accept="image/*,.xlsx,.xlsm,.csv,.txt"
                className="hidden"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </label>
            {file && (
              <button
                type="button"
                onClick={() => setFile(null)}
                className="text-muted-foreground hover:text-red-700"
                aria-label="remove file"
              >
                ✕
              </button>
            )}
            <Button onClick={askAi} disabled={aiBusy || (!pasteText.trim() && !file)} size="lg">
              {aiBusy ? (
                <Tri bm="⏳ AI sedang menyusun…" zh="⏳ AI 整理中…" en="⏳ AI is sorting…" />
              ) : (
                <Tri bm="Susun acara dengan AI" zh="让 AI 整理活动" en="Sort events with AI" />
              )}
            </Button>
          </div>
          {aiError && (
            <div className="mt-3 rounded-md border border-red-300 bg-red-50 p-3 text-red-900">
              {aiError}
            </div>
          )}
          {proposed && proposed.length === 0 && (
            <p className="mt-3 text-muted-foreground">
              <Tri
                bm="Tiada acara bertarikh dijumpai dalam teks itu."
                zh="文字里找不到有日期的活动。"
                en="No dated events found in that text."
              />
            </p>
          )}
          {proposed && proposed.length > 0 && (
            <div className="mt-3 flex flex-col gap-2">
              {proposed.map((p, i) => (
                <div
                  key={i}
                  className={`flex flex-wrap items-end gap-2 rounded-sm border bg-background p-3 ${
                    // Was opacity-60, which dropped already-added rows to about 2.4:1 —
                    // "done" became "unreadable" rather than "de-emphasised".
                    p.added ? "border-green-300 bg-green-50" : ""
                  }`}
                >
                  <div className="flex min-w-44 flex-1 flex-col gap-1">
                    <span className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Tri bm="Acara" zh="活动" en="Event" /> {confidenceBadge(p.titleConf)}
                    </span>
                    <input
                      value={p.title}
                      disabled={p.added}
                      onChange={(e) => editProposed(i, { title: e.target.value })}
                      className="h-10 rounded-md border bg-background px-2"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Tri bm="Tarikh" zh="日期" en="Date" /> {confidenceBadge(p.dateConf)}
                    </span>
                    <input
                      type="date"
                      value={p.dateIso}
                      disabled={p.added}
                      onChange={(e) => editProposed(i, { dateIso: e.target.value })}
                      className="h-10 rounded-md border bg-background px-2"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-sm text-muted-foreground">
                      <Tri bm="Masa" zh="时间" en="Time" />
                    </span>
                    <input
                      value={p.timeText}
                      disabled={p.added}
                      onChange={(e) => editProposed(i, { timeText: e.target.value })}
                      className="h-10 w-28 rounded-md border bg-background px-2"
                    />
                  </div>
                  <Button
                    variant={p.added ? "ghost" : "default"}
                    disabled={p.added || !p.dateIso}
                    onClick={() => addProposed(i)}
                  >
                    {p.added ? (
                      <Tri bm="✓ Ditambah" zh="✓ 已添加" en="✓ Added" />
                    ) : (
                      <Tri bm="+ Sahkan" zh="+ 确认" en="+ Confirm" />
                    )}
                  </Button>
                  {p.snippet && (
                    <div className="w-full font-mono text-sm text-muted-foreground">
                      <Tri bm="AI baca" zh="AI 读到" en="AI read" />: “{p.snippet}”
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Manual quick-add */}
        <form
          onSubmit={addEvent}
          className="flex flex-wrap items-end gap-2 rounded-md border bg-muted/20 p-4"
        >
          <div className="flex min-w-48 flex-1 flex-col gap-1">
            <label className="text-sm font-medium">
              <Tri bm="Acara" zh="活动" en="Event" />
            </label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t("cth: Makan malam tahunan", "例如：周年晚宴", "e.g. Annual dinner")}
              className="h-11 rounded-sm border bg-background px-3"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium">
              <Tri bm="Tarikh" zh="日期" en="Date" />
            </label>
            <input
              type="date"
              value={dateIso}
              onChange={(e) => setDateIso(e.target.value)}
              className="h-11 rounded-sm border bg-background px-3"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium">
              <Tri bm="Masa" zh="时间" en="Time" />
            </label>
            <input
              value={timeText}
              onChange={(e) => setTimeText(e.target.value)}
              placeholder="7:30 malam"
              className="h-11 w-36 rounded-sm border bg-background px-3"
            />
          </div>
          <Button type="submit" size="lg" disabled={!title.trim() || !dateIso}>
            + <Tri bm="Tambah" zh="添加" en="Add" />
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

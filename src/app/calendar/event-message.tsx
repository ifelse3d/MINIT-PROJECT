"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/modal";
import { Tri, useTriText } from "@/components/language-provider";
import {
  eventInviteText,
  eventReminderText,
  type SimpleEvent,
} from "@/lib/local-events";

// ---------------------------------------------------------------------------
// "📣 WhatsApp wording" for one event (launch feedback #7): an invitation and
// a reminder, pre-written by code (free), edited by the person, then copied
// or opened straight in WhatsApp. The wa.me link carries no number — the
// person picks the group/contact in WhatsApp itself, so no phone numbers
// pass through us.
// ---------------------------------------------------------------------------

export function EventMessageButton({
  ev,
  orgName,
}: {
  ev: SimpleEvent;
  orgName: string | null;
}) {
  const t = useTriText();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"invite" | "reminder">("invite");
  const [text, setText] = useState("");
  const [copied, setCopied] = useState(false);

  function openAs(nextMode: "invite" | "reminder") {
    setMode(nextMode);
    setText(
      nextMode === "invite"
        ? eventInviteText(ev, orgName)
        : eventReminderText(ev, orgName),
    );
    setCopied(false);
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      window.prompt(t("Salin teks ini", "复制这段文字", "copy this text"), text);
    }
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          openAs("invite");
          setOpen(true);
        }}
      >
        📣 <Tri bm="Teks WhatsApp" zh="WhatsApp 文案" en="WhatsApp wording" />
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} labelledBy={`evmsg-${ev.id}`}>
        <div className="flex flex-col gap-3">
          <h2 id={`evmsg-${ev.id}`} className="text-xl font-semibold">
            📣 <Tri bm="Teks WhatsApp" zh="WhatsApp 文案" en="WhatsApp wording" />
          </h2>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant={mode === "invite" ? "default" : "outline"}
              onClick={() => openAs("invite")}
            >
              <Tri bm="Jemputan" zh="邀请" en="Invitation" />
            </Button>
            <Button
              size="sm"
              variant={mode === "reminder" ? "default" : "outline"}
              onClick={() => openAs("reminder")}
            >
              <Tri bm="Peringatan" zh="提醒" en="Reminder" />
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">
            <Tri
              bm="Ditulis oleh kod — percuma. Ubah apa-apa dahulu; teks ini milik anda."
              zh="程序写好的 —— 免费。可以先改；文字是你们自己的。"
              en="Written by code — free. Edit anything first; the words are yours."
            />
          </p>
          <textarea
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setCopied(false);
            }}
            rows={9}
            className="w-full rounded-md border border-input bg-background p-3 text-base leading-relaxed"
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={() => void copy()}>
              {copied ? (
                <Tri bm="✓ Disalin!" zh="✓ 已复制" en="✓ Copied!" />
              ) : (
                <Tri bm="Salin" zh="复制" en="Copy" />
              )}
            </Button>
            <Button variant="outline" asChild>
              <a
                href={`https://wa.me/?text=${encodeURIComponent(text)}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                📱 <Tri bm="Buka WhatsApp" zh="打开 WhatsApp 发送" en="Open WhatsApp" />
              </a>
            </Button>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              <Tri bm="Tutup" zh="关闭" en="Close" />
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}

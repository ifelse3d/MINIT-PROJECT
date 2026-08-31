import { describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// §0-2a (work order 102) — the tukar_bahasa tool. J's live catch: 「我看不懂
// 英文」 was answered with a lecture about the Settings page. The tool's
// contract, pinned: it CHANGES the device language via the callback (the
// browser applies it), refuses honestly when no surface is listening, and
// never claims a change when the language is already the asked-for one.
//
// server-only + the db client are mocked because this ONE handler touches
// neither — everything it does is pure hand-off to the browser.
// ---------------------------------------------------------------------------

vi.mock("server-only", () => ({}));
vi.mock("@/db/supabase-server", () => ({
  getSupabaseServer: () => {
    throw new Error("tukar_bahasa must never touch the database");
  },
}));

import { runOrgTool, type AgentUiChange } from "./org-tools";

const baseCtx = { orgId: 1, todayIso: "2026-08-31" };

describe("tukar_bahasa (§0-2a)", () => {
  it("fires the ui-change callback with old → new and tells the model it is done", async () => {
    const changes: AgentUiChange[] = [];
    const result = (await runOrgTool(
      "tukar_bahasa",
      { language: "zh" },
      { ...baseCtx, uiLang: "en", onUiChange: (c) => changes.push(c) },
    )) as Record<string, unknown>;
    expect(changes).toEqual([{ kind: "language", from: "en", to: "zh" }]);
    expect(result.ok).toBe(true);
    expect(result.changed).toBe(true);
    expect(String(result.note)).toContain("undo");
  });

  it("refuses when no surface is listening — and points at the settings deep link", async () => {
    const result = (await runOrgTool(
      "tukar_bahasa",
      { language: "zh" },
      { ...baseCtx, uiLang: "en" },
    )) as Record<string, unknown>;
    expect(result.error).toBeDefined();
    expect(String(result.error)).toContain("settings_language");
  });

  it("already in that language = unchanged, and says not to claim a change", async () => {
    const changes: AgentUiChange[] = [];
    const result = (await runOrgTool(
      "tukar_bahasa",
      { language: "zh" },
      { ...baseCtx, uiLang: "zh", onUiChange: (c) => changes.push(c) },
    )) as Record<string, unknown>;
    expect(changes).toEqual([]);
    expect(result.unchanged).toBe(true);
    expect(String(result.note)).toContain("do not claim");
  });

  it("rejects a made-up language code as a tool-argument error", async () => {
    const result = (await runOrgTool(
      "tukar_bahasa",
      { language: "fr" },
      { ...baseCtx, uiLang: "en", onUiChange: () => {} },
    )) as Record<string, unknown>;
    expect(result.error).toBeDefined();
  });

  it('the "all" side-by-side mode is a real old value the undo can restore', async () => {
    const changes: AgentUiChange[] = [];
    await runOrgTool(
      "tukar_bahasa",
      { language: "bm" },
      { ...baseCtx, uiLang: "all", onUiChange: (c) => changes.push(c) },
    );
    expect(changes).toEqual([{ kind: "language", from: "all", to: "bm" }]);
  });
});

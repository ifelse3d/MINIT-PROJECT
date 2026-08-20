import { NextResponse } from "next/server";
import { buildTemplateXlsx, TEMPLATE_FILENAME, type TemplateKind } from "@/lib/roster-xlsx";

// The blank spreadsheet a society fills in before it ever opens the app.
// No org data goes into it, so it needs no quota, no AI and no RLS check —
// it is a form, not a report.

export const runtime = "nodejs";

export async function GET(req: Request) {
  const kind = new URL(req.url).searchParams.get("kind");
  if (kind !== "committee" && kind !== "glossary") {
    return NextResponse.json({ error: "unknown template" }, { status: 400 });
  }
  const file = await buildTemplateXlsx(kind as TemplateKind);

  return new NextResponse(new Uint8Array(file), {
    headers: {
      "content-type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(
        TEMPLATE_FILENAME[kind as TemplateKind],
      )}`,
      "cache-control": "public, max-age=3600",
    },
  });
}

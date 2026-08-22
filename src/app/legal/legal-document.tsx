import Link from "next/link";
import { Tri } from "@/components/language-provider";
import { parseMarkdown, type Block, type Span } from "@/lib/markdown-lite";

// ---------------------------------------------------------------------------
// The page body shared by /terms and /privacy (2026-08-22).
//
// WHY THESE PAGES EXIST AT ALL
// J is putting REAL society data in (2026-08-22), and sign-up now asks people
// to agree to something — so that something has to be readable BEFORE they
// agree, without an account, on a phone. PDPA s.7 wants the privacy notice in
// Bahasa Malaysia and English, which is what legal/*.md already are.
//
// Both are still DRAFTS with [[ ]] placeholders in them, and the banner at the
// top of each file says so. That banner is shown, not hidden: a person is
// better served by "this is a draft, not lawyer-reviewed" than by a confident
// page pretending to be final. Filling the placeholders and getting a lawyer to
// read it is on the list (STATE.md §5 question 4).
// ---------------------------------------------------------------------------

function Spans({ spans }: { spans: Span[] }) {
  return (
    <>
      {spans.map((s, i) =>
        s.kind === "strong" ? (
          <strong key={i} className="font-semibold text-foreground">
            {s.text}
          </strong>
        ) : s.kind === "code" ? (
          <code
            key={i}
            className="rounded bg-black/5 px-1 py-0.5 font-mono text-[0.9em] dark:bg-white/10"
          >
            {s.text}
          </code>
        ) : (
          <span key={i}>{s.text}</span>
        ),
      )}
    </>
  );
}

function Rendered({ block }: { block: Block }) {
  switch (block.kind) {
    case "heading":
      if (block.level === 1) {
        return (
          <h2 className="mt-10 text-2xl font-semibold tracking-tight first:mt-0">
            <Spans spans={block.spans} />
          </h2>
        );
      }
      if (block.level === 2) {
        return (
          <h3 className="mt-8 text-xl font-semibold tracking-tight">
            <Spans spans={block.spans} />
          </h3>
        );
      }
      return (
        <h4 className="mt-6 text-lg font-semibold">
          <Spans spans={block.spans} />
        </h4>
      );

    case "paragraph":
      return (
        <p className="mt-4 text-base leading-relaxed text-muted-foreground">
          <Spans spans={block.spans} />
        </p>
      );

    case "quote":
      return (
        <div className="mt-6 rounded-2xl border-2 border-amber-300 bg-amber-50 p-4 text-sm leading-relaxed text-amber-900 dark:bg-amber-400/10 dark:text-amber-100">
          {block.lines.map((line, i) => (
            <p key={i} className={i ? "mt-1" : undefined}>
              <Spans spans={line} />
            </p>
          ))}
        </div>
      );

    case "list":
      return (
        <ul className="mt-4 list-disc space-y-2 pl-6 text-base leading-relaxed text-muted-foreground">
          {block.items.map((item, i) => (
            <li key={i}>
              <Spans spans={item} />
            </li>
          ))}
        </ul>
      );

    case "table":
      // Scrolls inside itself: a five-column table must not make the whole
      // legal notice scroll sideways on a phone.
      return (
        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[32rem] border-collapse text-sm">
            <thead>
              <tr>
                {block.header.map((cell, i) => (
                  <th
                    key={i}
                    className="border-b-2 border-[color:var(--v2-border)] p-2 text-left font-semibold"
                  >
                    <Spans spans={cell} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, r) => (
                <tr key={r}>
                  {row.map((cell, c) => (
                    <td
                      key={c}
                      className="border-b border-[color:var(--v2-border)] p-2 align-top text-muted-foreground"
                    >
                      <Spans spans={cell} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );

    case "rule":
      return <hr className="mt-8 border-[color:var(--v2-border)]" />;
  }
}

export function LegalDocument({
  markdown,
  version,
}: {
  markdown: string;
  /** The content hash a person's consent is recorded against. */
  version: string;
}) {
  const blocks = parseMarkdown(markdown);
  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-16 pt-8">
      <Link href="/login" className="text-base underline underline-offset-4">
        ← <Tri bm="Kembali ke log masuk" zh="回到登入" en="Back to sign in" />
      </Link>

      <article className="mt-6">
        {blocks.map((block, i) => (
          <Rendered key={i} block={block} />
        ))}
      </article>

      <p className="mt-10 font-mono text-xs text-muted-foreground">versi / 版本 / version {version}</p>
    </div>
  );
}

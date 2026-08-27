import Link from "next/link";
import { Tri } from "@/components/language-provider";
import { getActiveOrg } from "@/lib/active-org";
import { loadConstitutionClauses } from "../actions";
import { ClauseBook } from "../clause-book";

// /constitution/clauses — the whole constitution, to READ.
//
// J's UX list, N7: the clauses were sitting in `constitutions.clauses_json`,
// verbatim, being used to answer questions, with no screen anywhere that simply
// showed them. So "what else does clause 12 say" still meant going to find the
// original PDF.
//
// Clauses are loaded here, on the server, through the user-scoped client — RLS
// decides what is visible. The device's own localStorage copy is merged in by
// the client component, because a page photographed a minute ago is on that
// device before it is anywhere else.
export const dynamic = "force-dynamic";

export default async function ConstitutionClausesPage() {
  const clauses = await loadConstitutionClauses();
  const active = await getActiveOrg().catch(() => null);

  return (
    <div className="mx-auto w-full max-w-4xl pb-10">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex h-14 w-14 items-center justify-center rounded-md bg-violet-100/80 text-3xl ring-1 ring-white/60 backdrop-blur dark:bg-violet-400/15 dark:ring-white/10">
            📜
          </div>
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">
              <span className="v2-gradient-text">
                <Tri bm="Fasal Perlembagaan" zh="章程条文" en="The Constitution" />
              </span>
            </h1>
            <p className="text-sm text-[color:var(--v2-text-soft)]">
              <Tri
                bm="Setiap fasal seperti yang tertulis — bukan ringkasan."
                zh="每一条都照原文，不是摘要。"
                en="Every clause exactly as written — not a summary."
              />
            </p>
          </div>
        </div>
        <Link href="/constitution" className="text-sm underline underline-offset-4">
          ← <Tri bm="Tanya soalan" zh="问章程问题" en="Ask a question" />
        </Link>
      </div>

      <ClauseBook orgClauses={clauses} orgName={active?.name ?? null} />
    </div>
  );
}

import "server-only";

// ---------------------------------------------------------------------------
// WHO IS THE OPERATOR? — one answer, read in two places (P-4, work order 31).
//
// /admin has decided this since S-6 with a private function; the sidebar now
// needs the same answer to show the "Ops console" row to the operator and to
// nobody else. Moving the check here keeps it ONE list read in ONE place —
// the page and the rail can never disagree about who the operator is.
//
// 🔴 What crosses to the client is a single BOOLEAN (may this session see the
// row?). The ADMIN_EMAILS list itself never leaves the server, and /admin
// keeps its own fail-closed 404 — the sidebar row is a convenience, not the
// gate (same principle as the K-3 grant card).
// ---------------------------------------------------------------------------

/** Is this the operator? No env var set = nobody is (fail closed). */
export function isOperatorEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const list = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return list.includes(email.toLowerCase());
}

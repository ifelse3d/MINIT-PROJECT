/**
 * Import this FIRST in any CLI entry point that needs src/lib/ai/*.
 *
 *     import "../scripts/allow-server-only";
 *     import { getVisionProvider } from "../src/lib/ai/provider";
 *
 * WHY
 * provider.ts, gemini.ts and openai.ts each `import "server-only"`. That package
 * throws the moment it is loaded outside a React Server Component, which is
 * exactly the point: it stops a client component from pulling the AI key path
 * into the browser bundle, turning a comment into a build error.
 *
 * A CLI script is server-side by definition, so the guard is not protecting
 * anything here — it just refuses to load, and the script dies before its first
 * line runs.
 *
 * THIS IS NOT A WORKAROUND FOR A SAFETY CHECK. The check has one job — keep the
 * AI layer out of browser bundles — and a script that runs under `npm run` is
 * not a browser bundle. Neutralising it here does not weaken the guard for the
 * app: Next.js still resolves the real "server-only" package during its build,
 * so a client component that imports the AI layer still fails exactly as before.
 *
 * HISTORY — why this file exists rather than each script re-implementing it
 * `npm run eval` was silently broken from 2026-08-03 (when the provider layer
 * introduced the guard) until 2026-08-06, because nothing ran it in between and
 * the failure is instant and total. That is three days in which "just run the
 * eval" was on the to-do list and would not have worked. Sharing one file means
 * the next CLI entry point cannot rediscover the same wall.
 */
import path from "node:path";

const serverOnlyPath = require.resolve("server-only");

if (!require.cache[serverOnlyPath]) {
  require.cache[serverOnlyPath] = {
    id: serverOnlyPath,
    filename: serverOnlyPath,
    loaded: true,
    exports: {},
    path: path.dirname(serverOnlyPath),
    paths: [],
    children: [],
  } as unknown as NodeModule;
}

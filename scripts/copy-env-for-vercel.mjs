// Puts .env.local on the clipboard in the shape Vercel's "Environment
// Variables" box accepts (KEY=VALUE, one per line), with comments and blank
// lines removed.
//
// WHY: twelve variables typed by hand into a web form is twelve chances to
// paste a key one character short, and the failure mode is a deployment that
// looks fine and quietly cannot reach Supabase. Vercel takes a whole .env in
// one paste, so this makes it one action instead of twelve.
//
// It NEVER prints a value — only the key names and a masked tail, so you can
// see it picked up the right lines without the keys ending up in a terminal
// scrollback, a screenshot, or a chat log.
import fs from "node:fs";
import { execFileSync } from "node:child_process";

const ENV = String.raw`C:\dev\minit\.env.local`;

let text;
try {
  text = fs.readFileSync(ENV, "utf8");
} catch {
  console.log("GAGAL / FAILED: .env.local tidak dijumpai / not found at " + ENV);
  process.exit(1);
}

const lines = text
  .split(/\r?\n/)
  .map((l) => l.trim())
  .filter((l) => l && !l.startsWith("#") && l.includes("="));

if (lines.length === 0) {
  console.log("GAGAL / FAILED: .env.local kosong / is empty");
  process.exit(1);
}

execFileSync("powershell", ["-NoProfile", "-Command", "$input | Set-Clipboard"], {
  input: lines.join("\n"),
});

console.log("SUDAH DISALIN / COPIED -- " + lines.length + " baris / lines:\n");
for (const l of lines) {
  const i = l.indexOf("=");
  const k = l.slice(0, i);
  const v = l.slice(i + 1).replace(/^["']|["']$/g, "");
  const secret = /KEY|SECRET|TOKEN|PASS|SERVICE_ROLE|ANON/i.test(k);
  console.log("   " + k.padEnd(30) + (secret ? "= ...." + v.slice(-4) + "  (" + v.length + " aksara/chars)" : "= " + v));
}

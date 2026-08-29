import type { Metadata } from "next";
import { Geist_Mono, Poppins } from "next/font/google";
import localFont from "next/font/local";
import { cookies } from "next/headers";
import "./globals.css";
import { LanguageProvider } from "@/components/language-provider";
import { LANG_COOKIE, htmlLangFor, isLangMode } from "@/lib/lang";
import {
  APPEARANCE_BOOT_SCRIPT,
  AppearanceProvider,
} from "@/components/appearance-provider";
import { getActiveOrg } from "@/lib/active-org";
import { getSessionUser } from "@/db/supabase-server";
import { getUsage } from "@/lib/ai/usage";
import { countUnfinishedMinutesDrafts } from "@/lib/home-stats";
import { readNeedsEinvois } from "@/lib/einvois-server";
import { EinvoisProvider } from "@/lib/einvois-pref";
import { StorageScopeProvider } from "@/lib/storage-scope";
import { isOperatorEmail } from "@/lib/admin-gate";
import { AppShell } from "@/components/v3/shell";
import { BRAND_NAME } from "@/lib/brand";

// Redesign spec §2.5 (tan shi hui's violet brief, J 8/27 拍板): Poppins is
// the brand face. It has NO CJK coverage, so Noto Sans SC below stays the
// Chinese fallback. The CSS variable keeps its old name (--font-v2) — the
// name is plumbing, and globals.css + forty components read it.
// display:"swap" + adjustFontFallback: text is readable immediately and the
// metric-matched fallback means the swap causes no visible reflow.
const poppins = Poppins({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-v2",
  display: "swap",
  adjustFontFallback: true,
});

// Chinese UI face (Stage R: the interface renders ONE language, and 中文 is
// the default). Self-hosted from the repo's own TTF — the same file the PDF
// generator embeds — so the build never depends on reaching Google Fonts.
const notoSansSC = localFont({
  src: "../assets/fonts/NotoSansSC-Regular.ttf",
  variable: "--font-sc",
  display: "swap",
  preload: false,
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: BRAND_NAME,
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icon-192.png", apple: "/apple-touch-icon.png" },
  description:
    "Pembantu pematuhan AI untuk persatuan berdaftar dan NGO Malaysia / AI compliance assistant for Malaysian registered societies and NGOs",
};

// EVERY PAGE IN THIS APP IS PER-USER AND PER-ORGANISATION, so none of them may
// be prerendered into the build output.
//
// This used to be true BY ACCIDENT. The root layout called `await headers()` to
// read the R1 demo header, and one dynamic API in the root layout opts the whole
// route tree into dynamic rendering. Removing the demo (2026-08-21) removed the
// headers() call with it, and the guarantee went with it silently — nothing
// failed, because getActiveOrg() is wrapped in .catch(), so with a database
// configured the cookie read still makes every route dynamic and the build looks
// identical. Without one, the catch swallows the error, no dynamic API is
// touched, Next decides the pages are static, and /minutes throws while being
// prerendered.
//
// A page being static or dynamic depending on whether an environment variable
// happens to be set is not a property anything should rest on. It is now stated
// out loud instead of being a side effect of a demo header that no longer
// exists.
export const dynamic = "force-dynamic";

// Fill the whole screen incl. notch/rounded corners on native + mobile.
export const viewport = {
  themeColor: "#F8FAFC",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover" as const,
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Tanya Minit lives in the floating launcher on every page, so its quota
  // status is fetched here. No active org → no launcher (same rule as the old
  // home-page mount).
  const active = await getActiveOrg().catch(() => null);
  // K-4 (work order 27): these three reads were SERIAL awaits, and this
  // layout runs on EVERY request — one extra round-trip per page, sitewide.
  // They only depend on `active`, not on each other; run them together.
  // (needsEinvois: 0-4 — null = unknown → the client falls back to the
  // device preference; see src/lib/einvois-server.ts. user: S0-4 — the
  // localStorage scope, resolved server-side so a page cannot invent it.)
  const [usage, needsEinvois, user, minutesDraftsCount] = await Promise.all([
    active ? getUsage(active.id).catch(() => null) : Promise.resolve(null),
    active ? readNeedsEinvois(active.id) : Promise.resolve(null),
    getSessionUser().catch(() => null),
    // G3-3 (work order 68, J #7): the New-minutes nav badge's count.
    active ? countUnfinishedMinutesDrafts(active.id) : Promise.resolve(null),
  ]);
  const storageScope = `${user?.id ?? "anon"}:${active?.id ?? "none"}`;
  // P-4: ONE boolean crosses to the client — "may this session see the Ops
  // console row?". The ADMIN_EMAILS list never leaves the server, and /admin
  // keeps its own fail-closed 404 gate regardless of what the sidebar shows.
  const showAdmin = isOperatorEmail(user?.email);
  // Stage R: the UI shows ONE language. The choice lives in a cookie so the
  // server can stamp <html lang> before first paint; default 中文 (J's brief).
  const cookieLang = (await cookies()).get(LANG_COOKIE)?.value;
  const langMode = isLangMode(cookieLang) ? cookieLang : "zh";
  return (
    <html
      lang={htmlLangFor(langMode)}
      className={`${poppins.variable} ${notoSansSC.variable} ${geistMono.variable} h-full antialiased`}
      // The boot script below adds the `dark` class and a font-size to <html>
      // BEFORE React hydrates, so the server-rendered attributes legitimately
      // differ from the live DOM. Without this, every dark-mode user gets a
      // hydration mismatch in the console. (Found in review, 2026-07-28.)
      suppressHydrationWarning
    >
      {/* suppressHydrationWarning: browser extensions (e.g. Grammarly) inject
          data-gr-* attributes on <body> before React hydrates, which otherwise
          triggers a harmless hydration mismatch warning. */}
      <head>
        {/* Applies this device's saved text size and light/dark BEFORE the first
            paint, so someone who chose "Extra large" never sees the page render
            small and then jump. See components/appearance-provider.tsx. */}
        <script dangerouslySetInnerHTML={{ __html: APPEARANCE_BOOT_SCRIPT }} />
        {/* Rail state before first paint (§3.1): localStorage wins, always;
            otherwise expanded ≥1440px. Written only when the user toggles —
            never on resize. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              '(function(){try{var v=localStorage.getItem("minit.rail.collapsed");var c=v===null?window.innerWidth<1440:v==="1";if(!c)document.documentElement.classList.add("minit-rail-expanded");}catch(e){}})();',
          }}
        />
      </head>
      {/* No font-size here on purpose. It used to be text-[17px], which enlarged
          body copy while leaving every rem-based utility (text-sm, text-xs, and
          the whole spacing scale) resolving against the browser's 16px root — so
          the "big text" setting did nothing for the small labels that were
          actually hard to read. The root size is now a SETTING, applied to
          <html> by AppearanceProvider, where it scales type and spacing together. */}
      <body className="min-h-full" suppressHydrationWarning>
        <StorageScopeProvider scope={storageScope}>
          <AppearanceProvider>
            {/* Only a REAL cookie counts as "already chosen" — passing the
                zh fallback would silently suppress the first-run picker. */}
            <LanguageProvider initialMode={isLangMode(cookieLang) ? cookieLang : undefined}>
              <EinvoisProvider orgValue={needsEinvois}>
                {/* AppShell picks the chrome for the route: full shell everywhere,
                    bare (language switcher only) on /login. */}
                <AppShell
                  showAiLauncher={Boolean(active)}
                  aiRemaining={usage?.totalRemaining ?? null}
                  aiUsedPct={usage?.usedPct ?? null}
                  aiBlocked={usage?.blocked ?? false}
                  showAdmin={showAdmin}
                  minutesDraftsCount={minutesDraftsCount}
                >
                  {children}
                </AppShell>
              </EinvoisProvider>
            </LanguageProvider>
          </AppearanceProvider>
        </StorageScopeProvider>
      </body>
    </html>
  );
}

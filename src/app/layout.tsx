import type { Metadata } from "next";
import { Geist_Mono, Inter } from "next/font/google";
import "./globals.css";
import { LanguageProvider } from "@/components/language-provider";
import {
  APPEARANCE_BOOT_SCRIPT,
  AppearanceProvider,
} from "@/components/appearance-provider";
import { getActiveOrg } from "@/lib/active-org";
import { getSessionUser } from "@/db/supabase-server";
import { getUsage } from "@/lib/ai/usage";
import { StorageScopeProvider } from "@/lib/storage-scope";
import { AppShell } from "@/components/v2/app-shell";

// Inter stands in for SF Pro Display (Apple's face isn't web-licensable).
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-v2",
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Minit",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icon-192.png", apple: "/icon-192.png" },
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
  const usage = active ? await getUsage(active.id).catch(() => null) : null;
  // S0-4: localStorage records are namespaced by person AND organisation, so a
  // second member on a shared laptop can never read or overwrite the first
  // member's register. Resolved here, on the server — a page cannot invent it.
  const user = await getSessionUser().catch(() => null);
  const storageScope = `${user?.id ?? "anon"}:${active?.id ?? "none"}`;
  return (
    <html
      lang="ms"
      className={`${inter.variable} ${geistMono.variable} h-full antialiased`}
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
            <LanguageProvider>
              {/* AppShell picks the chrome for the route: full shell everywhere,
                  bare (language switcher only) on /login. */}
              <AppShell
                showAiLauncher={Boolean(active)}
                aiRemaining={usage?.totalRemaining ?? null}
                aiUsedPct={usage?.usedPct ?? null}
                aiBlocked={usage?.blocked ?? false}
              >
                {children}
              </AppShell>
            </LanguageProvider>
          </AppearanceProvider>
        </StorageScopeProvider>
      </body>
    </html>
  );
}

import type { CapacitorConfig } from "@capacitor/cli";

// ---------------------------------------------------------------------------
// CAPACITOR — turns the Minit web app into native iOS + Android apps.
//
// Minit uses server-side API routes (AI extraction, PDF/e-Invois generation)
// and keeps AI keys server-side (CLAUDE.md rule 4). A native app therefore
// cannot bundle everything offline — instead the native shell loads the LIVE
// Next.js app over HTTPS. All server features keep working, keys stay secret.
//
// The app opens on the new glass design at /v2.
//
// >>> BEFORE YOU BUILD, set server.url below. Two options:
//
//   A) DEMO / DEVELOPMENT on the same Wi-Fi as your PC:
//        1. On your PC run:  npm run dev
//        2. Find your PC's local IP (Windows: `ipconfig` -> IPv4, e.g. 192.168.0.12)
//        3. Set:  url: "http://192.168.0.12:3000/v2"  and  cleartext: true
//        (cleartext allows plain http on a local network — never ship this.)
//
//   B) RELEASE — deploy the Next.js app (e.g. Vercel) then set your HTTPS URL:
//        url: "https://minit.yourdomain.com/v2"   and   cleartext: false
// ---------------------------------------------------------------------------

const config: CapacitorConfig = {
  appId: "com.minit.app", // reverse-domain id — change to your own before publishing
  appName: "Minit",
  webDir: "public", // required by Capacitor; unused while server.url is set
  server: {
    // TODO: replace with your PC's LAN IP (demo) or deployed HTTPS URL (release).
    url: "https://REPLACE-WITH-YOUR-URL/v2",
    cleartext: false, // set true ONLY for local http:// during development
  },
  backgroundColor: "#F8FAFC",
  ios: {
    contentInset: "always",
    backgroundColor: "#F8FAFC",
  },
  android: {
    backgroundColor: "#F8FAFC",
  },
};

export default config;

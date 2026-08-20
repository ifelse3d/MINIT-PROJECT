# Minit — Native App Setup (Android + iOS)

_Panduan aplikasi mudah alih · Mobile app guide_

This turns the Minit web app into real **Android** and **iOS** apps using **Capacitor**.
You keep one codebase: it still runs as a website AND becomes the app. The app opens
on the new glass design at **`/v2`**.

---

## How it works (read this first)

Minit does real work on a **server** — reading photos with AI, generating PDFs and the
e-Invois file — and your AI keys **must stay on the server** (project rule, never inside
the app). So the native app is a **shell that loads your live Minit website** over the
internet. Everything works exactly like the web version; nothing secret ships inside the app.

That means the app needs to reach a running Minit server. You have two choices:

| | Where Minit runs | Use when |
|---|---|---|
| **A. Local (demo)** | `npm run dev` on your own PC, phone on the same Wi-Fi | Testing, competition demo |
| **B. Deployed (release)** | Minit hosted online (e.g. Vercel) with an `https://` address | Real users, app stores |

---

## What you need (prerequisites)

- **Node.js** already installed (you have it — `npm run dev` works).
- **Android app** → **Android Studio** (free). Works on **your Windows PC**. ✅
- **iOS app** → a **Mac with Xcode**. ⚠️ **Apple does not allow building iOS apps on
  Windows.** If you only have Windows, options for iOS are: borrow/use a Mac, a cloud-Mac
  service (MacinCloud, MacStadium), or Ionic Appflow cloud builds. Android works fully
  on Windows today; do iOS when you have Mac access.

---

## One-time setup

Open a terminal (PowerShell) in the project folder and run:

```bash
# 1. Install the Capacitor packages (already listed in package.json)
npm install

# 2. Create the native project folders
npx cap add android      # creates the /android folder (Windows OK)
npx cap add ios          # creates the /ios folder (only useful on a Mac)
```

You now have `android/` (and `ios/`) folders — these are the real native app projects.

---

## Point the app at your server

Open **`capacitor.config.ts`** and set the `server.url`.

**Option A — local demo (same Wi-Fi):**
1. On your PC run `npm run dev`.
2. Find your PC's IP: run `ipconfig`, look for **IPv4 Address** (e.g. `192.168.0.12`).
3. In `capacitor.config.ts` set:
   ```ts
   url: "http://192.168.0.12:3000/v2",
   cleartext: true,   // allows plain http on your local network (demo only)
   ```

**Option B — release (deployed):**
1. Deploy Minit (e.g. push to Vercel). You'll get an address like `https://minit.vercel.app`.
2. In `capacitor.config.ts` set:
   ```ts
   url: "https://minit.vercel.app/v2",
   cleartext: false,
   ```

After any change to the config or the web app, sync it into the native projects:

```bash
npm run cap:sync
```

---

## Build & run — Android (on Windows)

```bash
npm run cap:android      # syncs, then opens the project in Android Studio
```

In Android Studio:
1. Let it finish loading (first time downloads build tools — be patient).
2. Plug in an Android phone (with USB debugging on) **or** start an emulator.
3. Press the green **Run ▶** button. The Minit app installs and launches.

To make a shareable **`.apk`**: Android Studio menu → **Build → Build Bundle(s)/APK(s) → Build APK(s)**.

---

## Build & run — iOS (on a Mac only)

```bash
npm run cap:ios          # syncs, then opens the project in Xcode
```

In Xcode: pick a simulator or your iPhone, set your Apple signing team, press **Run ▶**.
Publishing to the App Store needs an **Apple Developer account** ($99/year).

---

## Everyday workflow

1. Edit the web app as usual.
2. If using Option B, redeploy. If Option A, keep `npm run dev` running.
3. `npm run cap:sync` (only needed if you changed `capacitor.config.ts` or native settings).
4. Re-run from Android Studio / Xcode.

Because the app loads your live site, most day-to-day UI changes appear **without
rebuilding the app** — just refresh/reopen.

---

## App identity (before publishing)

In `capacitor.config.ts`:
- `appId` — change `com.minit.app` to your own reverse-domain id (e.g. `my.orgname.minit`).
- `appName` — the name under the icon (currently "Minit").

App icons & splash: replace the images Capacitor generates in `android/` and `ios/`
(the tool `@capacitor/assets` can generate all sizes from one 1024×1024 logo).

---

## Quick troubleshooting

- **Blank white screen in the app** → the `server.url` is wrong or the server isn't
  reachable. Check the URL, that `npm run dev` is running, and that phone + PC share Wi-Fi.
- **"Cleartext HTTP not permitted"** → you used an `http://` URL; set `cleartext: true`
  (local demo only) or switch to an `https://` URL.
- **Android Studio build errors first time** → usually missing SDK components; accept the
  prompts to install them, then retry.

---

_Reminder: the native app is only a secure window onto Minit. All compliance logic,
document generation and data stay on the server, exactly as on the web._

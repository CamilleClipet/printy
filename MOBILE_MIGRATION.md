# Printy → native apps with Capacitor

Goal: ship Printy on the App Store and Google Play with reliable Bluetooth
printing (including on iOS, where Web Bluetooth doesn't exist and users need
Bluefy today), while keeping the web build on GitHub Pages. The approach: wrap
the existing Vite + React app (`app/`) in Capacitor and replace only the browser
APIs that don't work, or work badly, inside a native WebView.

This plan follows the one used for Print Pak (`../printpak-app/MOBILE_MIGRATION.md`).
Printy talks to the same printer family (X6 "cat printer", services `af30`/`ae30`,
characteristics `ae01`/`ae02`), so the Print Pak native transport can be
reused almost as-is. Print Pak's lessons are listed where they apply.

## Starting point (what Printy has today)

- One React component, `app/src/App.tsx`, with the state, the UI and the browser calls all in one place.
- `app/src/printer/bluetooth.ts`: the `Printer` class. It mixes raw Web Bluetooth GATT calls (`navigator.bluetooth`)
  with protocol logic: the pause/resume notification, 6 ms pacing, blank-row feed collapsing and progress reporting.
  `bluetooth.test.ts` tests it by faking `navigator.bluetooth`.
- `app/src/printer/protocol.ts`, `paper.ts`, `app/src/render/*`: pure logic, already tested.
- Storage: `localStorage` for the draft (`printy-draft-v1`) and paper width (`printy-paper-mm`),
  IndexedDB for the last image (`imageStore.ts`).
- Save: `canvas.toBlob` → `navigator.share` on touch devices, otherwise `<a download>` (`App.tsx` `save()`).
- Import: `<input type=file accept=image/*>`.
- No PWA, no service worker, no `public/` folder, no icons. `vite.config.ts` already uses `base: "./"`.
- The font is loaded from Google Fonts in `index.html`.
- CI: `.github/workflows/ci.yml` (lint, typecheck, test, build) and `deploy.yml` (GitHub Pages from `app/dist`).

## What changes and what doesn't

| Area | Today | In the Capacitor app | Effort |
|---|---|---|---|
| Rendering, protocol, paper, UI, CSS | Web code | **Unchanged** | None |
| BLE (`printer/bluetooth.ts`) | `navigator.bluetooth` inside `Printer` | `Printer` keeps the protocol logic and calls a `PrinterTransport`: Web Bluetooth on the web, `@capacitor-community/bluetooth-le` in the apps (port of `printpak-app/app/src/platform/native/bluetooth.ts`) | Medium |
| Save PNG (`save()` in `App.tsx`) | `navigator.share` / `<a download>` | `<a download>` does **nothing** in a WebView, and `navigator.share` with files isn't reliable there. Use `@capacitor/filesystem` + `@capacitor/share` | Low–medium |
| Import (`<input type=file>`) | File input | Works in both WebViews. Test only | Low (test) |
| Draft / paper width (localStorage) | localStorage | Keep it. Print Pak's move to `@capacitor/preferences` was part of the Phase 3 attempt that froze the iOS app. Only move if data loss is actually seen | None (test) |
| Last image (IndexedDB) | IndexedDB | Works in WKWebView and Android WebView. Test that it survives app kill and update | None (test) |
| Font (Google Fonts `<link>`) | Network | Bundle it (`@fontsource/bricolage-grotesque`): it works offline, and the app no longer contacts Google (simpler privacy labels) | Low |
| Vite build | `base: "./"`, no PWA | **The same `dist/` works for Pages and the apps.** No `--mode native` needed (unlike Print Pak) | None |
| `confirm("Clear all text?")` | Browser dialog | Capacitor shows native alerts for `alert/confirm`. Test only | None (test) |
| Keyboard handling (`revealTextarea`, `body.typing`) | iOS Safari workaround | WKWebView resizes differently. Tune with `@capacitor/keyboard` (`resize` mode) | Low–medium (test) |
| Escape to close the preview / menus | `keydown` | Also close on the Android back button (`@capacitor/app`) | Low |
| "Use Bluefy" error message | Shown when there's no Web Bluetooth | Must never appear in the apps. Native errors: Bluetooth off, permission denied | Low |

---

## Phase 0 — Prepare the web app (no behavior change)

Status: **done** on branch `mobile_migration_phase0`. Lint, typecheck, 24 tests and build are green, and the web app was checked by hand (Save, Connect and Print, font, draft and image after a reload).
Note: in Bluefy, leaving the app and coming back reloads the page and drops the printer. This is expected on the web (the Vite dev server and iOS both cause it).

Steps
1. Create `app/src/platform/` with the same shape as Print Pak, so later phases only add files:
   - `types.ts`: `PrinterTransport` (`supported`, `connect(hooks) → name`, `reconnect?`, `lastDeviceName?`,
     `write(bytes)`, `disconnect()`, with `hooks = { onDisconnect, onNotify(bytes) }`), `ChooserCancelled`,
     `SaveFile`, `ShareFile`, `ShareResult`. Copy `printpak-app/app/src/platform/types.ts` and drop the parts Printy doesn't use.
   - `web/bluetooth.ts`: the current `navigator.bluetooth` code from `Printer.connect()` (same filters:
     `namePrefix: "X6"` **or** `services: [SERVICE_ADV]`, `optionalServices: [SERVICE, SERVICE_ADV]`).
     Picker cancellation (`NotFoundError` while choosing) throws `ChooserCancelled`. `write` uses
     `writeValueWithoutResponse`, or `writeValue` if that's missing. Import the UUIDs from `printer/protocol.ts` instead of redefining them.
   - `web/files.ts`: `saveFile(blob, name)` and `shareFile(blob, name)`, with the code moved from `save()` in `App.tsx`.
     Keep the current rule: share sheet on touch devices (`pointer: coarse`), download otherwise.
   - `index.ts`: exports `printerTransport`, `saveFile`, `shareFile` and `isNativePlatform` (always `false` for now).
2. Refactor `printer/bluetooth.ts`: `Printer` takes a `PrinterTransport` (default: the one from `platform`).
   It keeps everything that doesn't depend on the transport: callbacks, status labels, `paused` handling of
   `51 78 AE … v[6] = 0x10/0x00`, pacing (`pace = 6`), blank-row feed collapsing, progress, error messages.
   Only the GATT calls move out. Transport disconnect → the current `onDisconnect` behavior.
3. Tests:
   - Rewrite `bluetooth.test.ts` against a **fake `PrinterTransport`** (no `navigator.bluetooth` mock): connect reports the name,
     cancellation shows no error, `supported: false` shows the "can't use Bluetooth" message, the full byte stream equals the
     expected `CMD.*` sequence (keep it as a golden array: Phase 2 compares against it), a failed write reports
     "Printing stopped", pause/resume holds and releases writes, a disconnect mid-job ends cleanly.
   - Add a small `platform/web/bluetooth.test.ts` with the existing `navigator.bluetooth` fake for the GATT path (filters, UUIDs, notifications optional).
4. Bundle the font: `npm i @fontsource/bricolage-grotesque` (weights 400/600/800, `opsz` variable if available),
   import it in `main.tsx`, remove the Google Fonts `<link>` tags from `index.html`.
5. Add `app/public/` with app icons (needed later by `@capacitor/assets`, and useful for a web favicon):
   a 1024×1024 `icon.png` source (no transparency for iOS).

What to test
- `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`: all green.
- Manual regression on the web: text/image/test modes, Save on desktop (download) and phone (share sheet), Connect and
  Print over Web Bluetooth in Chrome (desktop + Android) and Bluefy, draft and image survive a reload.
- The font looks identical, and the page loads with no requests to `fonts.googleapis.com` (DevTools → Network).

## Phase 1 — Add Capacitor, first boot on devices

Status: **code done** on branch `mobile_migration_phase1` (Capacitor 8.6, `fr.camilleclipet.printy`). Lint, typecheck, 24 tests,
web build, `./gradlew assembleDebug` and the iOS simulator build are green. The app boots on the iOS simulator in light and dark mode
(status bar follows the theme, safe areas OK, bundled font). Still to do: the store id reservations (step 1), real-device checks, keyboard
tuning (step 10, `revealTextarea` unchanged so far), and the Android back button and older Android versions.

Steps
1. Names and app id (decide **now**; the app id can't change after the first store release):
   - Store listing title: **"Printy: Thermal Printer"** on both stores. Home-screen name (`appName`): **"Printy"**.
     Another app called "Printy" exists on Google Play. That's allowed, because only the package id must be unique; the suffix avoids confusion.
   - App id: **`fr.camilleclipet.printy`** (registered on Apple Developer as an explicit App ID). Same id on Android.
     No capabilities are needed: Bluetooth, Photos and Camera only need `Info.plist` usage strings, and bundled fonts need nothing.
     Don't tick "Fonts": it's for apps that install fonts for other apps to use.
   - Reserve it before writing native code:
     - Apple: developer.apple.com → Certificates, Identifiers & Profiles → Identifiers → **+** → App IDs → App → explicit Bundle ID.
       If it's taken, Apple says it's not available. Then create the app in App Store Connect with that bundle id and the
       name "Printy: Thermal Printer", which reserves the name too.
     - Google: Play Console → Create app ("Printy: Thermal Printer"). The package name is claimed by the **first AAB upload**
       (internal testing track), so upload an early build as soon as Phase 1 runs. Google rejects the upload if the id is already used.
       A 404 at `play.google.com/store/apps/details?id=<id>` is only a hint, because unpublished apps also hold their ids.
2. In `app/`: `npm i @capacitor/core @capacitor/app @capacitor/status-bar @capacitor/splash-screen @capacitor/keyboard`
   and `npm i -D @capacitor/cli @capacitor/assets`, then `npm i @capacitor/ios @capacitor/android`.
   Match Print Pak's versions (Capacitor 8, Node 22: CI already uses Node 22).
3. `npx cap init "Printy" <app id> --web-dir dist`, then write `capacitor.config.ts` from Print Pak's:
   `webDir: 'dist'`, `ios.contentInset: 'never'`, `SplashScreen.launchAutoHide: false`,
   `SystemBars.insetsHandling: 'css'`, `backgroundColor` = Printy's `--casing` (`#d9dee2`), and the
   `CAP_SERVER_URL` live-reload switch.
4. `npx cap add ios` and `npx cap add android`, commit `app/ios/` and `app/android/`
   (add their build outputs to `.gitignore`: the default Capacitor `.gitignore` files inside each folder handle most of it).
5. Scripts in `package.json`, copied from Print Pak:
   `"cap:sync": "npm run build && cap sync"`, `"cap:ios": "cap open ios"`, `"cap:android": "cap open android"`,
   `"cap:live:ios"` / `"cap:live:android"` with `scripts/cap-live-reload.mjs` (copy it). The dev server already
   serves HTTPS through `basicSsl`. If the WebView refuses the self-signed certificate, use the Cloudflare tunnel URL as `CAP_SERVER_URL`.
6. Native shell, `src/platform/native/shell.ts` (`initPlatform()` called from `main.tsx`, `hideNativeSplash()` after the first render):
   - Status bar: overlay the WebView. Style must follow `prefers-color-scheme`, because Printy has a dark theme (Print Pak forces light).
   - Splash: hide after the first React commit.
   - Android back button: close the full-screen preview first, then an open toolbar menu, then blur a focused textarea, then exit.
     This needs a small dismiss registry (copy `backDismissRegistry.ts`). `App.tsx` and `FormatToolbar` register their close handlers there.
7. Icons and splash: `npx @capacitor/assets generate` from `app/assets/` (icon-only, icon-foreground, icon-background, splash).
8. Orientation: portrait only. iOS: iPhone only (`TARGETED_DEVICE_FAMILY = 1`), because iPad multitasking requires all orientations
   (Print Pak commit `edca284`). Android: `android:screenOrientation="portrait"` on the activity.
   App Store Connect: the app record has the **iOS** platform only. In Pricing and Availability, untick
   "Make this app available on Mac" (Apple silicon) and "Apple Vision Pro", which are on by default for iPhone apps.
9. Safe areas: `:root` already pads with `env(safe-area-inset-top/bottom)`, `.bar` and `.preview-overlay` too. Check them in the app.
10. Keyboard: set `Keyboard.resize` in `capacitor.config.ts` (try `'native'` first, then `'body'`). Then check that
    `revealTextarea` still works. Its hard-coded `delta = 50` may need a native-only branch.
11. README: add a "Native apps (iOS and Android)" section, adapted from Print Pak's root `README.md` (setup, the sync loop,
    Xcode and Android Studio, logs, live reload).

What to test
- The app launches on a real iPhone, a recent Android phone, an older Android phone (8–10) and emulators. It works with no network (font bundled).
- Light and dark mode: status bar text is readable, no overlap with the notch, home indicator or status bar, the bottom `.bar` sits above the home indicator.
- Typing a long text: the textarea stays visible above the keyboard, the bar hides (`body.typing`) and comes back on blur, no layout jump.
- Android back: closes the full-screen preview, then menus, then exits.
- Preview rendering speed while typing matches the mobile browser.

## Phase 2 — Bluetooth printing (the main reason for this work)

Steps
1. `npm i @capacitor-community/bluetooth-le @capacitor-community/keep-awake`, `npx cap sync`.
2. `src/platform/native/bluetooth.ts`: port Print Pak's file. It already contains what Printy needs:
   - `BleClient.initialize({ androidNeverForLocation: true })` (once, retried after a failure).
   - Bluetooth off: `isEnabled`, `requestEnable` on Android, "Bluetooth is off" message.
   - Permission errors → "Allow Bluetooth access in Settings".
   - Already-connected printers (`getConnectedDevices`), then a scan (`requestLEScan({ services: [SERVICE_ADV] })`, 6 s).
   - Android: high connection priority and an MTU log. A Printy row is `width / 8` + 8 bytes: 56 bytes at 57 mm, **up to ~112 bytes
     at 110 mm**. Check that the negotiated MTU − 3 covers the widest paper setting, and refuse to print (clear message) if it doesn't.
   - `writeWithoutResponse` on `ae30/ae01`, notifications on `ae02` → `hooks.onNotify`.
   - Last device saved (`printer.lastDevice` in localStorage) and `reconnect()`.
   - Import the UUIDs from `printer/protocol.ts`.
   Print Pak's scan only filters by service `af30`, while the web picker also accepts the `X6` name prefix. Check with the real printer that it advertises `af30`.
   If it doesn't, also match `localName` starting with `X6`.
3. Device chooser: Printy has no chooser UI. Start with "first printer found" (Print Pak's `scanForPrinter` fallback). Add a simple list
   chooser (`PrinterDeviceSelector`) only if two printers nearby turns out to be a real case. Any new UI goes to the designer.
4. `platform/index.ts`: `isNativePlatform = Capacitor.isNativePlatform()`, and pick the native or web transport.
   `Printer.connect()`: on native, try `reconnect()` first when a device is saved, then fall back to a scan. The status label shows the
   printer name. The "open this page in Bluefy" message is web-only.
5. Permissions:
   - iOS `Info.plist`: `NSBluetoothAlwaysUsageDescription` ("Printy uses Bluetooth to send your text and images to your thermal printer.").
   - Android `AndroidManifest.xml`: the same block as Print Pak: `BLUETOOTH_SCAN` (`neverForLocation`, `tools:targetApi="s"`), `BLUETOOTH_CONNECT`,
     plus legacy `BLUETOOTH`, `BLUETOOTH_ADMIN`, `ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION` with `maxSdkVersion="30"`.
6. Keep the screen on during a print (`KeepAwake.keepAwake()` / `allowSleep()` around `Printer.print`). Backgrounded mid-print:
   let the job fail cleanly with "Printing stopped". No `bluetooth-central` background mode.
7. Flow control: keep the 6 ms pacing and the pause handling. If rows go missing on iOS, use `write` (with response) every N packets,
   or tune the pacing on native only.
8. Add `platform/native/bluetooth.test.ts` (port Print Pak's, mocking `BleClient`): Bluetooth off, permission denied, cancel, reconnect fallback, write after disconnect throws.

What to test (real printer, both platforms)
- First run: permission prompt → connect → print the test strip at each darkness level.
- Prints match a web/Chrome print of the same content. The byte stream matches the Phase 0 golden test.
- Text in every font and style, rotated text, a long text (≥ 2,000 rows), an image, top/bottom spacing, paper widths 57, 80 and a custom width.
- Failure cases: printer off or out of range at connect and mid-print, paper out, Bluetooth off mid-print, permission denied then allowed in Settings,
  app backgrounded or screen locked mid-print, reconnect after the printer goes to sleep, printer already connected to another phone.
- OS versions: Android 10, 12+ (new BLE permissions) and the latest; iOS current and current−1.

Start the Google Play closed test (see Phase 5) as soon as this phase works.

## Phase 3 — Save, import, storage (small, separate steps)

Print Pak's first Phase 3 attempt (share + Preferences + deep links in one go) froze the iOS app and was reverted.
Do each step on its own, build, test on a real iPhone, then commit.

Steps
1. **Save** (`platform/native/files.ts`): `npm i @capacitor/filesystem @capacitor/share`. Write the PNG to `Directory.Cache` (base64),
   then `Share.share({ files: [uri] })`. From the share sheet the user can pick "Save Image" (Photos), Files, Messages and so on.
   Add `NSPhotoLibraryAddUsageDescription` to `Info.plist` **in this same step**. Without it, Save Image crashes the app (a Print Pak bug).
   Cancelling the share sheet is not an error. Delete old cache files at the next save.
2. **Import**: test the existing `<input type=file accept=image/*>` on both platforms (Photos, Files, camera option on iOS).
   Only if the Android picker or HEIC handling is poor, switch to `@capacitor/camera` `pickImages` behind `chooseImage`.
   If the iOS picker offers "Take Photo", also add `NSCameraUsageDescription`.
3. **Storage**: no code change. Test only (see below). Move to `@capacitor/preferences` only if iOS actually clears the draft.

What to test
- Saved PNG: it has exactly the print width in pixels (384 at 57 mm, 576 at 80 mm, no rescaling), it appears in Photos/Gallery, and it can be shared to Messages, Files and Drive.
- Import: JPEG, HEIC (iPhone), PNG with transparency, a 48 MP photo, EXIF rotation, picking the same file twice, Remove image.
- The draft, paper width and last image survive app kill, a reboot and an app update.
- Airplane mode: everything works.

## Phase 4 — CI, release builds, beta

Steps
1. Extend `.github/workflows/ci.yml` with Print Pak's jobs: the current checks (+ `npm run build` uploaded as an artifact),
   `android` (JDK 21, `npx cap sync android`, `./gradlew bundleRelease`, unsigned) and `ios` (macOS runner, `npx cap sync ios`,
   unsigned simulator `xcodebuild` Release). Restrict CI pushes to `main` (plus PRs), like Print Pak. `deploy.yml` stays the same.
2. Signing: Android upload keystore (Play App Signing), iOS distribution certificate and provisioning profile
   (or fastlane `match`). Secrets go in GitHub secrets, never in the repo. Use fastlane or Codemagic for signed uploads.
3. Versioning: `package.json` `version` → `versionName` / `CFBundleShortVersionString`; CI run number → build number.
4. Static pages on GitHub Pages (`app/public/`): `privacy.html` and `support.html` (copy Print Pak's layout and `legal.css`),
   plus `licenses.html` generated by a script like Print Pak's `scripts/gen-licenses.mjs`. Link them from the Settings tab.
5. Beta: TestFlight (iOS), then Play Console internal testing → **closed testing**.
6. Optional: Sentry Capacitor SDK for JS errors and native crashes. If you add it, declare crash data in the privacy labels.

What to test
- Release builds, not just debug: R8/minification doesn't break the BLE plugin, and the iOS build passes App Store Connect validation.
- Installs from TestFlight and the Play testing track on clean devices: first-run permission, connect, print, save, and an upgrade from the previous beta keeps the draft.
- Play Console pre-launch report: no crashes, no accessibility blockers.

## Phase 5 — Store submission

Admin
- Apple Developer Program (yearly fee) and Google Play Console (one-time fee). You may already have both from Print Pak.
- **Personal Play accounts created after Nov 2023 need a closed test with at least 12 testers opted in for 14 days in a row before production.**
  This applies to each new app, so start it right after Phase 2.
- Privacy policy (`privacy.html`): text and images stay on the device, nothing is sent anywhere, no accounts, no tracking
  (true once the font is bundled in Phase 0).
- Apple: App Privacy "Data Not Collected", `ITSAppUsesNonExemptEncryption = false`, age rating, 6.9" and 6.5" iPhone screenshots.
- Google: Data safety form, content rating, the current target API level, feature graphic and phone screenshots, AAB upload.

App Review risk (iOS Guideline 4.2, "minimum functionality"): Printy is a small single-screen app, so this risk is **higher than for Print Pak**.
Arguments for the review notes: it works offline, it has no web UI chrome, and it uses native Bluetooth, the share sheet and Photos.
Its main value (printing on iPhone without Bluefy) can't be done on the web. Also include:
- a short video of a real print, since reviewers won't have the printer;
- a note that the app still works without a printer (preview and Save as PNG).

Steps
1. Fill in the store listings → submit the iOS build → promote Android from closed testing to production with a staged rollout (20% → 100%).
2. After launch, watch crash reports and Play vitals (ANRs).

What to test
- The production build from each store on a clean device, and the first-run permission flow one last time.

---

## Order and rough sizing (one developer, part time)

| Phase | Size | Notes |
|---|---|---|
| 0 Platform layer, transport split, bundled font | S | Web app unchanged |
| 1 Capacitor shell, first boot | S | Same `dist/` for web and apps |
| 2 Native Bluetooth printing | S–M | Mostly a port of Print Pak. Start the Play closed test right after |
| 3 Save, import, storage | S | One step at a time |
| 4 CI, signing, beta | S | Copy Print Pak's workflows |
| 5 Store submission | S work, but calendar time | 14-day closed test, App Review |

Suggested branches/commits, like Print Pak: `mobile migration phase 0` … `phase 3` on a `mobile_migration` branch, one PR, then `phase4` and the store work on separate branches.

## Main risks

1. **App Review 4.2**: small app. Mitigation: native features, the review notes and video above. If it's rejected, ship Android first and iterate.
2. **Wide paper over BLE**: rows up to ~112 bytes at 110 mm. Mitigation: MTU check on Android, long-strip tests at 80 mm and the max custom width on iOS.
3. **iOS write-without-response flow control**: shared pacing and pause handling, a fallback to writes with response, long-strip tests.
4. **Saving inside a WebView**: every download/share path must go through `platform/`, otherwise Save silently does nothing.
5. **Keyboard behavior** in WKWebView vs Safari: the `revealTextarea` workaround was tuned for Safari. Test it early, in Phase 1.
6. **Duplicated code with Print Pak** (transport, shell, scripts): accept the copy for now. If both apps stay alive, extract a shared
   `cat-printer` package later (protocol + transports).

## Known issues / backlog (fill in during testing)

- "Printed." appears when the last write is queued, not when the paper stops (same as Print Pak). Not part of the migration.

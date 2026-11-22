# Printy

Print text, images and test strips on a Bluetooth thermal "cat printer" (X6 family) straight from your phone's browser.

Built with React, TypeScript and Vite. It uses Web Bluetooth, so it needs a browser that supports it: Chrome on desktop or Android, or the [Bluefy](https://apps.apple.com/app/bluefy-web-ble-browser/id1492822055) app on iPhone.

## Requirements

- Node.js 22 or newer (`node -v` to check; Capacitor 8 needs it)

## Running locally

The web app lives in `app/`. Run all npm commands from there:

```sh
cd app
npm install
npm run dev -- --host
```

The dev server runs over HTTPS with a self-signed certificate (`@vitejs/plugin-basic-ssl`), because Web Bluetooth only works on secure pages. Code changes reload in the browser automatically.

### On your computer

Open `https://localhost:5173/` and accept the certificate warning.

### On your phone (iPhone / Bluefy)

The simplest way is a Cloudflare quick tunnel, which gives the dev server a public HTTPS address with a real certificate. No signup needed. With the dev server running, open a second terminal and run:

```sh
npx cloudflared tunnel --url https://localhost:5173 --no-tls-verify
```

After a few seconds it prints the address in a box like this:

```
Your quick Tunnel has been created! Visit it at:
https://some-random-words.trycloudflare.com
```

Open that address in Bluefy, then tap **Connect** to pair with the printer. The address changes every time you restart the tunnel.

#### Alternative: local Wi-Fi

If your phone and computer are on the same Wi-Fi network, you can skip the tunnel:

1. Vite prints several `Network:` URLs when it starts. Pick the one for your Wi-Fi adapter (usually `en0` on macOS) and ignore any `bridge*`, `utun*` or VPN addresses.
2. Open `https://<lan-ip>:5173/` on your phone and accept the self-signed certificate warning.

Some browsers (including Bluefy) may not let you get past the certificate warning. If that happens, use the tunnel.

## Building

From `app/`:

```sh
npm run build     # type-check and build into app/dist/
npm run preview   # serve the built version on https://localhost:4173
```

`app/dist/` is a static site that uses relative paths, so it can be served from any host or subfolder. To test the built version on your phone, point the tunnel at port 4173 instead of 5173.

## Native apps (iOS and Android)

The same code is also packaged as an iOS and an Android app with
[Capacitor](https://capacitorjs.com/). The native projects live in
`app/ios/` and `app/android/`. Native Bluetooth printing comes in Phase 2
of the migration; until then the apps are for layout and keyboard testing. Plan and known issues:
`MOBILE_MIGRATION.md`.

### One-time setup

- **iOS**: install **Xcode** from the Mac App Store, open it once and accept
  the extra components it offers to install. In **Xcode → Settings →
  Accounts**, add your Apple ID. A free account is enough to run the app on
  your own iPhone.
- **Android**: install [Android Studio](https://developer.android.com/studio).
  On first launch, let the setup wizard install the Android SDK. Android
  builds need **JDK 21**: Android Studio ships one (its "JBR"). Add this
  line to `~/.zshrc`, then open a new terminal:
  ```sh
  export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
  ```

### The loop: build, sync, run

The native apps don't use the dev server: they contain a copy of the built
web app. **After every change under `src/`**, from `app/`:

```sh
npm run cap:sync
```

This builds the web app (`npm run build`, the same `dist/` as the website) and
copies it into both native projects. Then run the app from Xcode or Android
Studio (see below). Skipping this step means the phone runs the previous
version.

### Testing with Xcode (iPhone or simulator)

1. From `app/`, run `npm run cap:sync`, then `npm run cap:ios`.
   Xcode opens `ios/App/App.xcodeproj`. The project uses Swift Package
   Manager, so there is no `.xcworkspace` and no `pod install`.
2. Wait until the status box in the middle of the toolbar no longer says
   "Resolving Package Graph…" or "Fetching…".
3. **First time only, signing:** in the left sidebar click **App** (blue
   icon) → target **App** → **Signing & Capabilities**. Tick "Automatically
   manage signing" and pick your **Team** (your Apple ID).
4. In the device menu at the top ("App > …"), pick your iPhone (plugged in
   by USB, or on the same Wi-Fi once paired) or a simulator such as
   "iPhone 16".
5. Press **▶** (⌘R).
6. **First time on a real iPhone:**
   - If Xcode asks for it, turn on **Settings → Privacy & Security →
     Developer Mode** on the iPhone. The iPhone restarts.
   - With a free account, the first launch is blocked until you trust
     yourself as a developer: **Settings → General → VPN & Device
     Management** → your Apple ID → **Trust**. Then press ▶ again.

The simulator has no Bluetooth. Use it for layout only, and a real iPhone
for printing. Apps signed with a free account
stop opening after 7 days. Press ▶ again to reinstall.

**Console logs (Web Inspector):** on the iPhone, turn on **Settings → Apps
→ Safari → Advanced → Web Inspector**. On the Mac, in Safari, turn on
**Settings → Advanced → Show features for web developers**. While the app
runs, choose **Develop → *your iPhone* → localhost** in Safari to get the
console, network and elements panels. The bottom panel in Xcode shows
native logs and crash reasons.

**If the build fails with package or "missing module" errors**, typically
after `npm install`/`npm ci`: in Xcode, choose **File → Packages → Reset
Package Caches**, then **Product → Clean Build Folder** (⇧⌘K), then ▶.
If that's not enough, quit Xcode and run
`rm -rf ~/Library/Developer/Xcode/DerivedData/App-*`, then
`npm run cap:sync && npm run cap:ios`.

**"No signing certificate" / "0 valid identities":** in **Xcode → Settings
→ Accounts**, select your Apple ID → **Manage Certificates…** → **+** →
**Apple Development**.

### Testing with Android Studio (emulator or phone)

1. From `app/`, run `npm run cap:sync`, then `npm run cap:android`.
   Android Studio opens the `android/` folder.
2. Wait for the **Gradle sync** to finish (progress bar at the bottom right).
   The first time it downloads a lot and can take several minutes.
3. **First time only, emulator:** open **Device Manager** (phone icon on the
   right side bar, or **Tools → Device Manager**) → **+** → **Create Virtual
   Device**. Pick for example **Pixel 8a**, choose a recent system image
   (download it), then **Finish**.
4. In the device menu at the top, pick the emulator (or a real phone), then
   press **▶ Run 'app'**.

You can also skip the IDE: `npx cap run android` builds and asks which
device to install on.

The emulator has no Bluetooth. It's fine for layout, import, Save and the
back button, but printing needs a real Android phone.

**Real Android phone:** on the phone, open **Settings → About phone** and
tap **Build number** 7 times to unlock developer options. Then turn on
**Settings → System → Developer options → USB debugging**. Plug it in,
accept the "Allow USB debugging?" prompt, and it appears in the device menu.

**Console logs:** with the app running, open `chrome://inspect` in Chrome
on the Mac and click **inspect** under the app's WebView. Android Studio's
**Logcat** tab (bottom) shows native logs and crashes.

**If Gradle complains about the Java version**, check that `JAVA_HOME`
points to Android Studio's JDK (see one-time setup), or set
`org.gradle.java.home` to the same path in `~/.gradle/gradle.properties`.
To check a build from the terminal: `cd android && ./gradlew assembleDebug`.

### Live reload (optional)

To see changes on the device without running `cap:sync` each time, run
these in two terminals from `app/`:

```sh
npm run dev -- --host 0.0.0.0
npm run cap:live:ios      # or: npm run cap:live:android
```

The app then loads from the dev server on your Mac over Wi-Fi, so the
phone and the Mac must be on the same network. Accept the development
certificate if the phone asks. If the wrong network address is detected,
set it yourself: `CAP_SERVER_HOST=192.168.1.20 npm run cap:live:ios`.
Run `npm run cap:sync` and ▶ afterwards to go back to a normal build, which
doesn't need the Mac.

### Icons and splash screen

Sources are in `app/assets/` (`icon-only.png`, `icon-foreground.png`,
`icon-background.png`, `splash.png`). After changing them, from `app/`:

```sh
npx capacitor-assets generate --ios --android --iconBackgroundColor '#d9dee2' --iconBackgroundColorDark '#22272c' --splashBackgroundColor '#d9dee2' --splashBackgroundColorDark '#22272c'
```

## Tests

From `app/`:

```sh
npm test             # run tests once
npm run test:watch   # watch for changes
npm run typecheck    # type-check without building
npm run lint         # ESLint (TypeScript, React hooks, unhandled promises)
```

CI runs lint, typecheck, tests and the production build on every push and pull request.

## Project structure

```
app/                     the web app (run npm commands here)
  index.html             Vite entry page
  vite.config.ts         Vite config (React, self-signed HTTPS, tunnel hosts)
  capacitor.config.ts    Capacitor config (app id, splash, status bar, keyboard, live reload)
  ios/, android/         native projects (generated by Capacitor, committed)
  assets/                icon and splash sources for @capacitor/assets
  scripts/               cap-live-reload.mjs
  src/
    App.tsx              UI and app state
    index.css            styles
    platform/            browser vs native APIs (Bluetooth transport, save/share, native shell)
    printer/
      protocol.ts        printer packet format and commands
      bluetooth.ts       connecting, flow control and printing
    render/              text / image / test-strip rendering and black-and-white conversion
```

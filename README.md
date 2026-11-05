# Printy

Print text, images and test strips on a Bluetooth thermal "cat printer" (X6 family) straight from your phone's browser.

Built with React, TypeScript and Vite. It uses Web Bluetooth, so it needs a browser that supports it: Chrome on desktop or Android, or the [Bluefy](https://apps.apple.com/app/bluefy-web-ble-browser/id1492822055) app on iPhone.

## Requirements

- Node.js 18 or newer (`node -v` to check)

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
  src/
    App.tsx              UI and app state
    index.css            styles
    printer/
      protocol.ts        printer packet format and commands
      bluetooth.ts       connecting, flow control and printing
    render/              text / image / test-strip rendering and black-and-white conversion
```

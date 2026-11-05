import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import basicSsl from "@vitejs/plugin-basic-ssl";

export default defineConfig({
  base: "./",
  // Self-signed HTTPS for the dev server: Web Bluetooth needs a secure context,
  // so the phone (Bluefy) must load the app over https://<lan-ip>:5173.
  plugins: [react(), basicSsl()],
  // Pre-bundle every React entry together so a late re-optimization can't
  // serve two React copies (breaks hooks: "resolveDispatcher().useRef").
  optimizeDeps: {
    include: ["react", "react-dom", "react-dom/client", "react/jsx-runtime", "react/jsx-dev-runtime"],
  },
  server: {
    // Allow access through Cloudflare quick tunnels as a fallback.
    allowedHosts: [".trycloudflare.com"],
  },
  test: {
    environment: "node",
  },
});

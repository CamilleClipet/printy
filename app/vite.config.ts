import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import basicSsl from "@vitejs/plugin-basic-ssl";

export default defineConfig({
  base: "./",
  // Self-signed HTTPS for the dev server: Web Bluetooth needs a secure context,
  // so the phone (Bluefy) must load the app over https://<lan-ip>:5173.
  plugins: [react(), basicSsl()],
  server: {
    // Allow access through Cloudflare quick tunnels as a fallback.
    allowedHosts: [".trycloudflare.com"],
  },
});

import React from "react";
import { createRoot } from "react-dom/client";
// opsz variant: optical size + weight axes, like the Google Fonts URL it replaces.
import "@fontsource-variable/bricolage-grotesque/opsz.css";
import App from "./App";
import { initPlatform } from "./platform/native/shell";
import "./index.css";

initPlatform();

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

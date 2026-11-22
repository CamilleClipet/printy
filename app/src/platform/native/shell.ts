import { Capacitor, SystemBarType, SystemBars, SystemBarsStyle } from "@capacitor/core";
import { dismissRegisteredNativeOverlay } from "./backDismissRegistry";

let initialized = false;

export function initPlatform(): void {
  if (initialized || !Capacitor.isNativePlatform()) return;
  initialized = true;
  void configureNativeShell();
}

async function configureNativeShell(): Promise<void> {
  const platform = Capacitor.getPlatform();

  if (platform === "android") {
    const { App } = await import("@capacitor/app");
    await App.addListener("backButton", () => {
      if (!dismissNativeOverlay()) void App.exitApp();
    });
    // DEFAULT follows the system theme, like the CSS (prefers-color-scheme).
    await SystemBars.setStyle({ style: SystemBarsStyle.Default, bar: SystemBarType.StatusBar });
  }

  if (platform === "ios") {
    const { StatusBar, Style } = await import("@capacitor/status-bar");
    await StatusBar.setOverlaysWebView({ overlay: true });
    await StatusBar.setStyle({ style: Style.Default });
  }
}

/** Android back: preview, then menus (registered by React), then a focused textarea. */
function dismissNativeOverlay(): boolean {
  if (dismissRegisteredNativeOverlay()) return true;
  const active = document.activeElement;
  if (active instanceof HTMLTextAreaElement || active instanceof HTMLInputElement) {
    active.blur();
    return true;
  }
  return false;
}

/** Called from a React effect after the first native UI commit. */
export function hideNativeSplash(): void {
  if (!Capacitor.isNativePlatform()) return;
  void import("@capacitor/splash-screen").then(({ SplashScreen }) => SplashScreen.hide());
}

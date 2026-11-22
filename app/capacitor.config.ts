import type { CapacitorConfig } from '@capacitor/cli';
import { KeyboardResize } from '@capacitor/keyboard';

const liveReloadUrl = process.env.CAP_SERVER_URL;

const config: CapacitorConfig = {
  appId: 'fr.camilleclipet.printy',
  appName: 'Printy',
  webDir: 'dist',
  backgroundColor: '#d9dee2',
  ios: {
    contentInset: 'never',
  },
  plugins: {
    SplashScreen: {
      backgroundColor: '#d9dee2',
      launchAutoHide: false,
    },
    SystemBars: {
      insetsHandling: 'css',
      initialViewportFitValueHint: 'cover',
      style: 'DEFAULT',
      hidden: false,
    },
    Keyboard: {
      resize: KeyboardResize.Native,
    },
  },
  ...(liveReloadUrl ? { server: { url: liveReloadUrl, cleartext: true } } : {}),
};

export default config;

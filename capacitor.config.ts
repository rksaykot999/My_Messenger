import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.mymessenger.app',
  appName: 'My Messenger',
  webDir: 'out',
  android: {
    allowMixedContent: true,
  },
  server: {
    androidScheme: 'https',
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
    GoogleAuth: {
      scopes: ["profile", "email"],
      serverClientId: "1038574226468-okpbrd9mbo9sl5bh6icsvf2344dpb2sf.apps.googleusercontent.com",
      androidClientId: "1038574226468-1fjicamrksdmiqf4f7gdisb9jad8n2hd.apps.googleusercontent.com",
      forceCodeForRefreshToken: false,
    },
  },
};

export default config;

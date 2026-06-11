import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.lovable.cae1b3003e54411b8fb315a49ade0906',
  appName: '4K SMART Admin',
  webDir: 'dist',
  server: {
    url: 'https://cae1b300-3e54-411b-8fb3-15a49ade0906.lovableproject.com?forceHideBadge=true',
    cleartext: true,
  },
  android: {
    allowMixedContent: true,
  },
};

export default config;
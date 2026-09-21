import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.yydsxwh.kemiao.days',
  appName: '颗秒日事v2',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    allowNavigation: ['yydsxwh.com', '*.yydsxwh.com'],
  },
  android: {
    backgroundColor: '#fff5f7',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 900,
      launchAutoHide: true,
      backgroundColor: '#fff5f7',
      showSpinner: false,
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#fff5f7',
    },
    LocalNotifications: {
      smallIcon: 'ic_stat_days',
      iconColor: '#e11d48',
    },
  },
}

export default config

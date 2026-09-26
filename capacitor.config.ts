import type { CapacitorConfig } from '@capacitor/cli'

const allowNavigation = (process.env.CAPACITOR_ALLOW_NAVIGATION || '')
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean)

const config: CapacitorConfig = {
  appId: 'com.yydsxwh.kemiao.days',
  appName: '颗秒日事',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    ...(allowNavigation.length ? { allowNavigation } : {}),
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

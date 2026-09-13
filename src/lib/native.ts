import { Capacitor } from '@capacitor/core'

export function isNativeApp(): boolean {
  try {
    return Capacitor.isNativePlatform()
  } catch {
    return false
  }
}

export function timetableOcrUrl(): string {
  if (isNativeApp()) return 'https://www.yydsxwh.com/api/days/timetable-ocr'
  return '/api/days/timetable-ocr'
}

export async function applyNativeChrome() {
  if (!isNativeApp()) return
  const { StatusBar, Style } = await import('@capacitor/status-bar')
  const { SplashScreen } = await import('@capacitor/splash-screen')
  try {
    await StatusBar.setBackgroundColor({ color: '#FFF5F7' })
    await StatusBar.setStyle({ style: Style.Dark })
  } catch {
    // web or older webview
  }
  try {
    await SplashScreen.hide()
  } catch {
    // ignore
  }
}

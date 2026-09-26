import { Capacitor } from '@capacitor/core'
import { configuredApiOrigin } from './public-env'

export function isNativeApp(): boolean {
  try {
    return Capacitor.isNativePlatform()
  } catch {
    return false
  }
}

export function timetableOcrUrl(): string {
  if (isNativeApp()) {
    const origin = configuredApiOrigin()
    if (!origin) throw new Error('MISSING_VITE_DAYS_API_ORIGIN')
    return `${origin}/api/days/timetable-ocr`
  }
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

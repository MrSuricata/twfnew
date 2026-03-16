import { Capacitor } from '@capacitor/core'
import { StatusBar, Style } from '@capacitor/status-bar'
import { SplashScreen } from '@capacitor/splash-screen'
import { Keyboard } from '@capacitor/keyboard'
import { App } from '@capacitor/app'

/**
 * Returns true when running inside a native Capacitor shell (Android/iOS).
 */
export const isNative = Capacitor.isNativePlatform()

/**
 * Initialize Capacitor plugins. Safe to call on web — guards with isNative.
 */
export function initCapacitor() {
  if (!isNative) return

  // Mark body so CSS can apply native-specific styles
  document.body.classList.add('capacitor-native')

  // Dark status bar with brand background
  StatusBar.setStyle({ style: Style.Dark }).catch(() => {})
  StatusBar.setBackgroundColor({ color: '#0f172a' }).catch(() => {})

  // Hide splash screen after app is ready
  SplashScreen.hide().catch(() => {})

  // Handle keyboard overlapping input fields
  Keyboard.setAccessoryBarVisible({ isVisible: true }).catch(() => {})

  // Handle Android back button — go back in browser history or exit
  App.addListener('backButton', ({ canGoBack }) => {
    if (canGoBack) {
      window.history.back()
    } else {
      App.exitApp()
    }
  })
}

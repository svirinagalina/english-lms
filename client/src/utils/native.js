import { Capacitor } from '@capacitor/core'
import { PushNotifications } from '@capacitor/push-notifications'
import { api } from '../api'

// The iOS app (mobile/) is this same site inside a native shell: these
// helpers are what differs there. In a browser they do nothing.
export const isNativeApp = () => Capacitor.isNativePlatform()

let registeredToken = null
let listening = false

// After sign-in: ask once for permission (iOS shows its own dialog), then
// hand the phone's token to the server so lessons, homework and reminders
// reach it. `open(url)` is called when a notification is tapped.
export async function setUpPush(open) {
  // Android push needs Firebase, which isn't set up yet; register() without
  // it crashes the app.
  if (!isNativeApp() || Capacitor.getPlatform() === 'android') return
  try {
    if (!listening) {
      listening = true
      await PushNotifications.addListener('registration', ({ value }) => {
        registeredToken = value
        api.registerPushDevice(value).catch(() => {})
      })
      await PushNotifications.addListener('registrationError', (error) => console.warn('Push registration failed:', error?.error ?? error))
      await PushNotifications.addListener('pushNotificationActionPerformed', ({ notification }) => {
        const url = notification?.data?.url
        if (typeof url === 'string' && /^\/(?![\\/])/.test(url)) open(url)
      })
    }
    let { receive } = await PushNotifications.checkPermissions()
    if (receive === 'prompt' || receive === 'prompt-with-rationale') receive = (await PushNotifications.requestPermissions()).receive
    if (receive === 'granted') await PushNotifications.register()
  } catch (error) {
    console.warn('Push set-up failed:', error?.message ?? error)
  }
}

// Signing out: this phone stops getting the account's notifications.
export async function forgetPush() {
  if (!isNativeApp() || !registeredToken) return
  await api.unregisterPushDevice(registeredToken).catch(() => {})
  registeredToken = null
}

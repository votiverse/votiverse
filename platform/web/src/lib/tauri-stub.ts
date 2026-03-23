/**
 * Stub for @choochmeque/tauri-plugin-notifications-api.
 * Used in browser dev mode only — the real package is only available inside Tauri.
 * These functions are never called because push.ts guards with isTauri.
 */
export async function isPermissionGranted(): Promise<boolean> {
  return false;
}
export async function requestPermission(): Promise<string> {
  return "denied";
}
export async function registerForPushNotifications(): Promise<string | null> {
  return null;
}
export async function onNotificationReceived(): Promise<() => void> {
  return () => {};
}
export async function onAction(): Promise<() => void> {
  return () => {};
}

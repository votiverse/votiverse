/**
 * Push notification registration — only active inside Tauri mobile.
 *
 * Uses dynamic imports so the @choochmeque/tauri-plugin-notifications-api
 * package is never loaded in browser context.
 */

import { isTauri } from "./tauri.js";

/**
 * Request notification permission, register for push notifications,
 * and return the device token. Returns null in browser context or
 * if permission is denied.
 */
export async function registerForPushNotifications(): Promise<string | null> {
  if (!isTauri) return null;

  try {
    const {
      isPermissionGranted,
      requestPermission,
      registerForPushNotifications: register,
    } = await import("@choochmeque/tauri-plugin-notifications-api");

    let granted = await isPermissionGranted();
    if (!granted) {
      const perm = await requestPermission();
      granted = perm === "granted";
    }
    if (!granted) return null;

    const token = await register();
    return token ?? null;
  } catch (err) {
    console.warn("Push notification registration failed:", err);
    return null;
  }
}

/**
 * Listen for incoming notifications (foreground).
 * Returns an unlisten function.
 */
export async function onPushNotification(
  callback: (notification: unknown) => void,
): Promise<(() => void) | null> {
  if (!isTauri) return null;

  try {
    const { onNotificationReceived } = await import(
      "@choochmeque/tauri-plugin-notifications-api"
    );
    return await onNotificationReceived(callback);
  } catch {
    return null;
  }
}

/**
 * Listen for notification tap actions.
 * Returns an unlisten function.
 */
export async function onPushAction(
  callback: (notification: unknown) => void,
): Promise<(() => void) | null> {
  if (!isTauri) return null;

  try {
    const { onAction } = await import(
      "@choochmeque/tauri-plugin-notifications-api"
    );
    return await onAction(callback);
  } catch {
    return null;
  }
}

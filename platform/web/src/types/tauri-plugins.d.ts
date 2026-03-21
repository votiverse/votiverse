/**
 * Type declarations for Tauri plugin packages that are only available
 * at runtime inside the Tauri WebView (dynamic imports, never bundled
 * in browser builds).
 */

declare module "@choochmeque/tauri-plugin-notifications-api" {
  export function isPermissionGranted(): Promise<boolean>;
  export function requestPermission(): Promise<"granted" | "denied" | "default">;
  export function registerForPushNotifications(): Promise<string>;
  export function sendNotification(options: {
    title: string;
    body?: string;
    icon?: string;
  }): Promise<void>;
  export function onNotificationReceived(
    callback: (notification: unknown) => void,
  ): Promise<() => void>;
  export function onAction(
    callback: (notification: unknown) => void,
  ): Promise<() => void>;
}

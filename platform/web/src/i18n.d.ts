/**
 * Type-safe translation keys via react-i18next module augmentation.
 *
 * The English JSON files are the single source of truth for both
 * translations and types. When a key is added to a JSON file,
 * t() auto-completes it; when a key is removed, t() errors.
 */

import "i18next";
import type common from "../public/locales/en/common.json";
import type auth from "../public/locales/en/auth.json";
import type governance from "../public/locales/en/governance.json";
import type onboarding from "../public/locales/en/onboarding.json";
import type notifications from "../public/locales/en/notifications.json";
import type settings from "../public/locales/en/settings.json";

declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: "common";
    resources: {
      common: typeof common;
      auth: typeof auth;
      governance: typeof governance;
      onboarding: typeof onboarding;
      notifications: typeof notifications;
      settings: typeof settings;
    };
  }
}

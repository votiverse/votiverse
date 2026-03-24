/**
 * Social sign-in buttons — Google and Microsoft.
 *
 * These are regular <a> links that navigate to the backend OAuth initiation
 * endpoints. The browser does a full-page redirect to the provider, then
 * the backend callback redirects back to the frontend with auth cookies set.
 */

import { useTranslation } from "react-i18next";

const BASE_URL = import.meta.env.VITE_API_BASE_URL || "/api";

interface SocialButtonProps {
  redirect?: string;
}

export function GoogleSignInButton({ redirect }: SocialButtonProps) {
  const { t } = useTranslation("auth");
  const href = `${BASE_URL}/auth/oauth/google${redirect ? `?redirect=${encodeURIComponent(redirect)}` : ""}`;

  return (
    <a
      href={href}
      className="flex items-center justify-center gap-3 w-full min-h-[44px] px-4 py-2.5 bg-surface-raised border border-border-strong rounded-lg text-sm font-medium text-text-secondary hover:bg-interactive-hover hover:border-border-strong transition-colors cursor-pointer"
    >
      <GoogleLogo />
      {t("continueWithGoogle")}
    </a>
  );
}

export function MicrosoftSignInButton({ redirect }: SocialButtonProps) {
  const { t } = useTranslation("auth");
  const href = `${BASE_URL}/auth/oauth/microsoft${redirect ? `?redirect=${encodeURIComponent(redirect)}` : ""}`;

  return (
    <a
      href={href}
      className="flex items-center justify-center gap-3 w-full min-h-[44px] px-4 py-2.5 bg-[#2f2f2f] border border-[#2f2f2f] rounded-lg text-sm font-medium text-white hover:bg-[#1a1a1a] transition-colors cursor-pointer"
    >
      <MicrosoftLogo />
      {t("continueWithMicrosoft")}
    </a>
  );
}

/** Google "G" logo (official colors). */
function GoogleLogo() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4" />
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853" />
      <path d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05" />
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335" />
    </svg>
  );
}

/** Microsoft four-square logo. */
function MicrosoftLogo() {
  return (
    <svg width="18" height="18" viewBox="0 0 21 21" fill="none" aria-hidden="true">
      <rect x="1" y="1" width="9" height="9" fill="#F25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
      <rect x="1" y="11" width="9" height="9" fill="#00A4EF" />
      <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
    </svg>
  );
}

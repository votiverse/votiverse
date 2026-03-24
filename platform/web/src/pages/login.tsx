/**
 * Login page — dedicated full-page login/signup experience.
 *
 * Features:
 * - Social login buttons (Google, Microsoft) prominently placed
 * - Email/password form below with "or" divider
 * - Compact locale picker in top-right
 * - Handles redirect after login via ?redirect= query param
 * - Shows OAuth errors from ?oauth_error= query param
 */

import { useState, useEffect, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { useTranslation } from "react-i18next";
import { useIdentity } from "../hooks/use-identity.js";
import { getOAuthProviders } from "../api/oauth.js";
import { GoogleSignInButton, MicrosoftSignInButton } from "../components/social-buttons.js";
import { LocalePicker } from "../components/locale-picker.js";
import { HandlePicker } from "../components/handle-picker.js";
import { Spinner, ErrorBox, Button, Input } from "../components/ui.js";

const BASE_URL = import.meta.env.VITE_API_BASE_URL || "/api";

export function LoginPage() {
  const { t } = useTranslation("auth");
  const { login, register, loading: authLoading, storeUserId, handle } = useIdentity();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [handleInput, setHandleInput] = useState("");
  const [handleEdited, setHandleEdited] = useState(false);
  const [handleAvailable, setHandleAvailable] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [providers, setProviders] = useState<string[]>([]);
  const [showHandlePicker, setShowHandlePicker] = useState(false);

  const redirect = searchParams.get("redirect") || "/";
  const oauthError = searchParams.get("oauth_error");
  const oauthNew = searchParams.get("oauth_new");

  // Fetch enabled OAuth providers
  useEffect(() => {
    void getOAuthProviders().then(setProviders);
  }, []);

  // Show OAuth error from query param
  useEffect(() => {
    if (oauthError) {
      setError(oauthError);
      // Clean up the URL
      const next = new URLSearchParams(searchParams);
      next.delete("oauth_error");
      setSearchParams(next, { replace: true });
    }
  }, [oauthError, searchParams, setSearchParams]);

  // Handle post-OAuth new account — show handle picker
  useEffect(() => {
    if (oauthNew === "true" && storeUserId) {
      setShowHandlePicker(true);
      const next = new URLSearchParams(searchParams);
      next.delete("oauth_new");
      setSearchParams(next, { replace: true });
    }
  }, [oauthNew, storeUserId, searchParams, setSearchParams]);

  // If already logged in and not showing handle picker, redirect
  useEffect(() => {
    if (storeUserId && !authLoading && !showHandlePicker) {
      navigate(redirect, { replace: true });
    }
  }, [storeUserId, authLoading, showHandlePicker, redirect, navigate]);

  // Auto-suggest handle from name
  useEffect(() => {
    if (!handleEdited && mode === "register") {
      const suggested = name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 30);
      setHandleInput(suggested);
      setHandleAvailable(null);
    }
  }, [name, handleEdited, mode]);

  // Check handle availability with debounce
  const checkHandle = useCallback(async (h: string) => {
    if (h.length < 3) { setHandleAvailable(null); return; }
    try {
      const res = await fetch(`${BASE_URL}/auth/check-handle/${encodeURIComponent(h)}`);
      if (res.ok) {
        const data = await res.json() as { available: boolean };
        setHandleAvailable(data.available);
      }
    } catch {
      // Ignore
    }
  }, []);

  useEffect(() => {
    if (mode !== "register" || handleInput.length < 3) return;
    const timer = setTimeout(() => checkHandle(handleInput), 400);
    return () => clearTimeout(timer);
  }, [handleInput, mode, checkHandle]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (mode === "register") {
        await register(email, password, name, handleInput || undefined);
      } else {
        await login(email, password);
      }
      // Navigation handled by the useEffect above
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common:error.generic"));
    } finally {
      setSubmitting(false);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <Spinner />
          <p className="mt-4 text-sm text-gray-500">{t("checkingSession")}</p>
        </div>
      </div>
    );
  }

  // Handle picker modal (post-social-signup)
  if (showHandlePicker) {
    return (
      <div className="min-h-screen bg-gray-50">
        <HandlePicker
          defaultHandle={handle}
          onComplete={() => {
            setShowHandlePicker(false);
            navigate(redirect, { replace: true });
          }}
        />
      </div>
    );
  }

  const hasProviders = providers.length > 0;
  const hasGoogle = providers.includes("google");
  const hasMicrosoft = providers.includes("microsoft");

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Top bar with locale picker */}
      <div className="flex justify-end p-4">
        <LocalePicker />
      </div>

      {/* Centered content */}
      <div className="flex-1 flex items-start sm:items-center justify-center px-4 pb-12">
        <div className="w-full max-w-sm">
          {/* Logo and title */}
          <div className="text-center mb-8">
            <img src="/logo.svg" alt="Votiverse" className="w-14 h-14 mx-auto mb-4" />
            <h1 className="text-xl sm:text-2xl font-semibold text-gray-900">
              {mode === "login" ? t("welcomeBack") : t("createAccount")}
            </h1>
            <p className="mt-2 text-sm text-gray-500">
              {mode === "login" ? t("signInToContinue") : t("joinToContinue")}
            </p>
          </div>

          {error && <div className="mb-4"><ErrorBox message={error} /></div>}

          {/* Social login buttons */}
          {hasProviders && (
            <div className="space-y-3 mb-6">
              {hasGoogle && <GoogleSignInButton redirect={redirect} />}
              {hasMicrosoft && <MicrosoftSignInButton redirect={redirect} />}
            </div>
          )}

          {/* Divider */}
          {hasProviders && (
            <div className="relative mb-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-200" />
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="bg-gray-50 px-3 text-gray-400">{t("orDivider")}</span>
              </div>
            </div>
          )}

          {/* Email/password form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === "register" && (
              <>
                <div>
                  <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">{t("label.name")}</label>
                  <Input
                    id="name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={t("placeholder.name")}
                    required
                  />
                </div>
                <div>
                  <label htmlFor="handle" className="block text-sm font-medium text-gray-700 mb-1">
                    {t("label.handle")}
                    {handleAvailable === true && handleInput.length >= 3 && (
                      <span className="ml-2 text-green-600 text-xs font-normal">{t("handle.available")}</span>
                    )}
                    {handleAvailable === false && (
                      <span className="ml-2 text-red-600 text-xs font-normal">{t("handle.taken")}</span>
                    )}
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">@</span>
                    <Input
                      id="handle"
                      type="text"
                      value={handleInput}
                      onChange={(e) => {
                        setHandleInput(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""));
                        setHandleEdited(true);
                        setHandleAvailable(null);
                      }}
                      placeholder="your-handle"
                      className="pl-7"
                      minLength={3}
                      maxLength={30}
                    />
                  </div>
                  <p className="text-xs text-gray-400 mt-1">{t("handle.hint")}</p>
                </div>
              </>
            )}
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">{t("label.email")}</label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
              />
              {mode === "register" && (
                <p className="text-xs text-gray-400 mt-1">{t("email.hint")}</p>
              )}
            </div>
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">{t("label.password")}</label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                minLength={6}
              />
            </div>
            <Button type="submit" disabled={submitting} className="w-full">
              {submitting ? <Spinner /> : mode === "login" ? t("signIn") : t("createAccountButton")}
            </Button>
          </form>

          {/* Mode toggle + forgot password */}
          <div className="mt-6 text-center space-y-2">
            <p className="text-sm text-gray-500">
              {mode === "login" ? (
                <>
                  {t("noAccount")}{" "}
                  <button onClick={() => { setMode("register"); setError(null); }} className="text-brand font-medium hover:underline cursor-pointer">
                    {t("signUp")}
                  </button>
                </>
              ) : (
                <>
                  {t("hasAccount")}{" "}
                  <button onClick={() => { setMode("login"); setError(null); }} className="text-brand font-medium hover:underline cursor-pointer">
                    {t("signIn")}
                  </button>
                </>
              )}
            </p>
            {mode === "login" && (
              <p className="text-sm">
                <button className="text-gray-400 hover:text-gray-600 cursor-pointer">
                  {t("forgotPassword")}
                </button>
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

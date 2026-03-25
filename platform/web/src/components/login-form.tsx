import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useIdentity } from "../hooks/use-identity.js";
import { Spinner, ErrorBox, Button, Input } from "./ui.js";

const BASE_URL = import.meta.env.VITE_API_BASE_URL || "/api";

/** Generate a handle suggestion from a display name. */
function suggestHandle(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30);
}

export function LoginForm() {
  const { t } = useTranslation("auth");
  const { login, register, loading: authLoading } = useIdentity();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [handle, setHandle] = useState("");
  const [handleEdited, setHandleEdited] = useState(false);
  const [handleAvailable, setHandleAvailable] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Auto-suggest handle from name (unless user has manually edited it)
  useEffect(() => {
    if (!handleEdited && mode === "register") {
      const suggested = suggestHandle(name);
      setHandle(suggested);
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
    if (mode !== "register" || handle.length < 3) return;
    const timer = setTimeout(() => checkHandle(handle), 400);
    return () => clearTimeout(timer);
  }, [handle, mode, checkHandle]);

  if (authLoading) {
    return (
      <div className="max-w-md mx-auto py-16 text-center">
        <Spinner />
        <p className="mt-4 text-sm text-text-muted">{t("checkingSession")}</p>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (mode === "register") {
        await register(email, password, name, handle || undefined);
      } else {
        await login(email, password);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common:error.generic"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-sm mx-auto py-8 sm:py-16">
      <div className="text-center mb-8">
        <div className="w-12 h-12 bg-accent rounded-xl flex items-center justify-center mx-auto mb-4">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-text-on-accent"><path d="m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/><path d="m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/><path d="M7 21h10"/><path d="M12 3v18"/><path d="M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2"/></svg>
        </div>
        <h1 className="text-xl sm:text-2xl font-bold font-display text-text-primary">
          {mode === "login" ? t("welcomeBack") : t("createAccount")}
        </h1>
        <p className="mt-2 text-sm text-text-muted">
          {mode === "login" ? t("signInToContinue") : t("joinToContinue")}
        </p>
      </div>

      {error && <ErrorBox message={error} />}

      <form onSubmit={handleSubmit} className="space-y-4 mt-6">
        {mode === "register" && (
          <>
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-text-secondary mb-1">{t("label.name")}</label>
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
              <label htmlFor="handle" className="block text-sm font-medium text-text-secondary mb-1">
                {t("label.handle")}
                {handleAvailable === true && handle.length >= 3 && (
                  <span className="ml-2 text-success-text text-xs font-normal">{t("handle.available")}</span>
                )}
                {handleAvailable === false && (
                  <span className="ml-2 text-error-text text-xs font-normal">{t("handle.taken")}</span>
                )}
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary text-sm">@</span>
                <Input
                  id="handle"
                  type="text"
                  value={handle}
                  onChange={(e) => {
                    setHandle(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""));
                    setHandleEdited(true);
                    setHandleAvailable(null);
                  }}
                  placeholder="your-handle"
                  className="pl-7"
                  minLength={3}
                  maxLength={30}
                />
              </div>
              <p className="text-xs text-text-tertiary mt-1">{t("handle.hint")}</p>
            </div>
          </>
        )}
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-text-secondary mb-1">{t("label.email")}</label>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
          />
          {mode === "register" && (
            <p className="text-xs text-text-tertiary mt-1">{t("email.hint")}</p>
          )}
        </div>
        <div>
          <label htmlFor="password" className="block text-sm font-medium text-text-secondary mb-1">{t("label.password")}</label>
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

      <p className="text-center text-sm text-text-muted mt-6">
        {mode === "login" ? (
          <>
            {t("noAccount")}{" "}
            <button onClick={() => { setMode("register"); setError(null); }} className="text-accent-text font-medium hover:underline">
              {t("signUp")}
            </button>
          </>
        ) : (
          <>
            {t("hasAccount")}{" "}
            <button onClick={() => { setMode("login"); setError(null); }} className="text-accent-text font-medium hover:underline">
              {t("signIn")}
            </button>
          </>
        )}
      </p>
    </div>
  );
}

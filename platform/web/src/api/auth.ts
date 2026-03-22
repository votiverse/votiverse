/**
 * Auth API — communicates with the client backend for authentication.
 *
 * Web browsers use httpOnly cookies (set by the backend) — tokens never
 * touch JavaScript. Mobile apps (Tauri WebView) use localStorage +
 * Authorization headers as a fallback.
 */

import { isTauri } from "../lib/tauri.js";

const BASE_URL = import.meta.env.VITE_API_BASE_URL || "/api";

const ACCESS_TOKEN_KEY = "votiverse_access_token";
const REFRESH_TOKEN_KEY = "votiverse_refresh_token";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  handle?: string | null;
  avatarUrl?: string | null;
  bio?: string;
}

export interface MeResponse {
  id: string;
  email: string;
  name: string;
  handle?: string | null;
  avatarUrl?: string | null;
  bio?: string;
  memberships: Array<{
    assemblyId: string;
    participantId: string;
    assemblyName: string;
    joinedAt: string;
  }>;
}

// ---- Token storage (Tauri mobile only) ----

export function getAccessToken(): string | null {
  if (!isTauri) return null;
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

function setTokens(accessToken: string, refreshToken: string): void {
  if (!isTauri) return;
  localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
  localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
}

function clearTokenStorage(): void {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  localStorage.removeItem("votiverse_identity");
  localStorage.removeItem("votiverse_jwt");
}

// ---- Auth API calls ----

export async function register(
  email: string,
  password: string,
  name: string,
  handle?: string,
): Promise<{ user: AuthUser; accessToken: string }> {
  const res = await fetch(`${BASE_URL}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ email, password, name, ...(handle ? { handle } : {}) }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.error?.message ?? "Registration failed");
  }
  const data = await res.json() as { user: AuthUser; accessToken: string; refreshToken: string };
  // Mobile: store tokens in localStorage. Web: cookies already set by backend.
  setTokens(data.accessToken, data.refreshToken);
  return { user: data.user, accessToken: data.accessToken };
}

export async function login(
  email: string,
  password: string,
): Promise<{ user: AuthUser; accessToken: string }> {
  const res = await fetch(`${BASE_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.error?.message ?? "Login failed");
  }
  const data = await res.json() as { user: AuthUser; accessToken: string; refreshToken: string };
  setTokens(data.accessToken, data.refreshToken);
  return { user: data.user, accessToken: data.accessToken };
}

export async function refreshSession(): Promise<string | null> {
  if (isTauri) {
    // Mobile: send refresh token in body
    const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
    if (!refreshToken) return null;

    const res = await fetch(`${BASE_URL}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ refreshToken }),
    });
    if (!res.ok) {
      clearTokenStorage();
      return null;
    }
    const data = await res.json() as { accessToken: string; refreshToken: string };
    setTokens(data.accessToken, data.refreshToken);
    return data.accessToken;
  }

  // Web browser: refresh cookie is sent automatically
  const res = await fetch(`${BASE_URL}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({}),
  });
  if (!res.ok) {
    return null;
  }
  // New cookies are set by the backend response. Nothing to store.
  return "refreshed";
}

export async function logout(): Promise<void> {
  if (isTauri) {
    // Mobile: send refresh token in body
    const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
    const token = getAccessToken();
    if (refreshToken) {
      await fetch(`${BASE_URL}/auth/logout`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        credentials: "include",
        body: JSON.stringify({ refreshToken }),
      }).catch(() => {});
    }
  } else {
    // Web browser: cookies sent automatically
    await fetch(`${BASE_URL}/auth/logout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({}),
    }).catch(() => {});
  }

  clearTokenStorage();
}

export async function getMe(): Promise<MeResponse | null> {
  const headers: Record<string, string> = {};
  if (isTauri) {
    const token = getAccessToken();
    if (!token) return null;
    headers["Authorization"] = `Bearer ${token}`;
  }

  let res = await fetch(`${BASE_URL}/me`, {
    headers,
    credentials: "include",
  });

  if (res.status === 401) {
    const newToken = await refreshSession();
    if (!newToken) return null;

    const retryHeaders: Record<string, string> = {};
    if (isTauri) {
      retryHeaders["Authorization"] = `Bearer ${newToken}`;
    }
    const retryRes = await fetch(`${BASE_URL}/me`, {
      headers: retryHeaders,
      credentials: "include",
    });
    if (!retryRes.ok) return null;
    return retryRes.json() as Promise<MeResponse>;
  }

  if (!res.ok) return null;
  return res.json() as Promise<MeResponse>;
}

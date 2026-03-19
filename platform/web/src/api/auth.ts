/**
 * Auth API — communicates with the client backend for authentication.
 */

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

// ---- Token storage ----

export function getAccessToken(): string | null {
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

function setTokens(accessToken: string, refreshToken: string): void {
  localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
  localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
}

export function clearAuth(): void {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  // Also clear legacy identity data
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
    body: JSON.stringify({ email, password, name, ...(handle ? { handle } : {}) }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.error?.message ?? "Registration failed");
  }
  const data = await res.json() as { user: AuthUser; accessToken: string; refreshToken: string };
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
  const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
  if (!refreshToken) return null;

  const res = await fetch(`${BASE_URL}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken }),
  });
  if (!res.ok) {
    clearAuth();
    return null;
  }
  const data = await res.json() as { accessToken: string; refreshToken: string };
  setTokens(data.accessToken, data.refreshToken);
  return data.accessToken;
}

export async function logout(): Promise<void> {
  const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
  if (refreshToken) {
    const token = getAccessToken();
    await fetch(`${BASE_URL}/auth/logout`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ refreshToken }),
    }).catch(() => {});
  }
  clearAuth();
}

export async function getMe(): Promise<MeResponse | null> {
  const token = getAccessToken();
  if (!token) return null;

  const res = await fetch(`${BASE_URL}/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (res.status === 401) {
    // Try refresh
    const newToken = await refreshSession();
    if (!newToken) return null;
    const retryRes = await fetch(`${BASE_URL}/me`, {
      headers: { Authorization: `Bearer ${newToken}` },
    });
    if (!retryRes.ok) return null;
    return retryRes.json() as Promise<MeResponse>;
  }

  if (!res.ok) return null;
  return res.json() as Promise<MeResponse>;
}

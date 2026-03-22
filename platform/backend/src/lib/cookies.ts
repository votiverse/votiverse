/**
 * httpOnly cookie helpers for secure token delivery.
 *
 * Web browsers receive tokens via Set-Cookie headers (httpOnly, never accessible to JS).
 * Mobile apps (Tauri WebView) receive tokens in the response body and use Authorization headers.
 * The backend supports both patterns simultaneously.
 */

import type { Context } from "hono";
import { parseDurationMs } from "./jwt.js";

const ACCESS_COOKIE = "votiverse_access";
const REFRESH_COOKIE = "votiverse_refresh";

const isProduction = () => process.env["NODE_ENV"] === "production";

/**
 * Set httpOnly auth cookies on the response.
 * Called after login, register, and token refresh.
 */
export function setAuthCookies(
  c: Context,
  accessToken: string,
  refreshToken: string,
  accessExpiry: string,
  refreshExpiry: string,
): void {
  const secure = isProduction();
  const accessMaxAge = Math.floor(parseDurationMs(accessExpiry) / 1000);
  const refreshMaxAge = Math.floor(parseDurationMs(refreshExpiry) / 1000);

  c.header("Set-Cookie", buildCookieString(ACCESS_COOKIE, accessToken, {
    httpOnly: true,
    secure,
    sameSite: "Lax",
    path: "/",
    maxAge: accessMaxAge,
  }), { append: true });

  c.header("Set-Cookie", buildCookieString(REFRESH_COOKIE, refreshToken, {
    httpOnly: true,
    secure,
    sameSite: "Strict",
    path: "/auth",
    maxAge: refreshMaxAge,
  }), { append: true });
}

/**
 * Clear auth cookies by setting them with Max-Age=0.
 * Called on logout.
 */
export function clearAuthCookies(c: Context): void {
  const secure = isProduction();

  c.header("Set-Cookie", buildCookieString(ACCESS_COOKIE, "", {
    httpOnly: true,
    secure,
    sameSite: "Lax",
    path: "/",
    maxAge: 0,
  }), { append: true });

  c.header("Set-Cookie", buildCookieString(REFRESH_COOKIE, "", {
    httpOnly: true,
    secure,
    sameSite: "Strict",
    path: "/auth",
    maxAge: 0,
  }), { append: true });
}

/**
 * Extract the access token from the request Cookie header.
 * Returns null if the cookie is not present.
 */
export function getAccessTokenFromCookie(c: Context): string | null {
  return parseCookie(c.req.header("Cookie"), ACCESS_COOKIE);
}

/**
 * Extract the refresh token from the request Cookie header.
 * Returns null if the cookie is not present.
 */
export function getRefreshTokenFromCookie(c: Context): string | null {
  return parseCookie(c.req.header("Cookie"), REFRESH_COOKIE);
}

// ---- Helpers ----

interface CookieOptions {
  httpOnly: boolean;
  secure: boolean;
  sameSite: "Strict" | "Lax" | "None";
  path: string;
  maxAge: number;
}

function buildCookieString(name: string, value: string, opts: CookieOptions): string {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  if (opts.httpOnly) parts.push("HttpOnly");
  if (opts.secure) parts.push("Secure");
  parts.push(`SameSite=${opts.sameSite}`);
  parts.push(`Path=${opts.path}`);
  parts.push(`Max-Age=${opts.maxAge}`);
  return parts.join("; ");
}

function parseCookie(header: string | undefined, name: string): string | null {
  if (!header) return null;
  const prefix = `${name}=`;
  for (const part of header.split(";")) {
    const trimmed = part.trim();
    if (trimmed.startsWith(prefix)) {
      return decodeURIComponent(trimmed.slice(prefix.length));
    }
  }
  return null;
}

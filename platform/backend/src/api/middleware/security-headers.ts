/**
 * HTTP security headers middleware.
 * Sets standard security headers on all responses.
 */

import type { MiddlewareHandler } from "hono";

export const securityHeaders: MiddlewareHandler = async (c, next) => {
  await next();

  // Prevent MIME type sniffing
  c.header("X-Content-Type-Options", "nosniff");

  // Prevent clickjacking
  c.header("X-Frame-Options", "DENY");

  // HSTS — enforce HTTPS for 1 year (only effective over HTTPS)
  c.header("Strict-Transport-Security", "max-age=31536000; includeSubDomains");

  // Disable browser-side caching for API responses
  c.header("Cache-Control", "no-store");

  // Prevent referrer leakage
  c.header("Referrer-Policy", "strict-origin-when-cross-origin");

  // Restrict browser features
  c.header("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
};

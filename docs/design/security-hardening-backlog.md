# Security Hardening Backlog

Operational improvements identified during the March 2026 security audit. These are not vulnerabilities — all exploitable issues were fixed in commits `b4ec6bc`..`fd9b808`. These items improve defense-in-depth, incident response capability, and production readiness.

---

## 1. Security Event Audit Logging

**Priority:** High | **Effort:** Medium

The application logs HTTP requests (method, path, status, duration) but does not maintain a structured audit trail of security-relevant events. This makes incident detection and forensic analysis difficult.

**Events to log (structured, to a dedicated `audit_events` table or log stream):**
- Failed login attempts (IP, email, reason, lockout triggered?)
- Successful logins (user ID, method: password/OAuth, IP)
- Password resets (requested, completed)
- OAuth account linking/unlinking
- Session revocation (single, all)
- Admin role changes (who changed whom, old role, new role)
- Group capability changes
- Join request approvals/rejections

**Implementation notes:**
- Use the existing `Logger` interface (`platform/backend/src/lib/logger.ts`) with a dedicated `{ component: "audit" }` child logger
- In production, route audit logs to a separate CloudWatch log group or an append-only data store
- Include `requestId` (from the request-id middleware) for correlation with HTTP logs
- Do not log PII beyond user IDs and email addresses

---

## 2. Explicit Argon2 Parameters

**Priority:** Medium | **Effort:** Low

`platform/backend/src/lib/password.ts` uses `@node-rs/argon2` with library defaults. If a library update changes defaults, existing hashes could become unverifiable or security properties could weaken silently.

**Recommendation:** Pin parameters explicitly:
```ts
const ARGON2_OPTIONS = {
  memoryCost: 65536,  // 64 MiB
  timeCost: 3,
  parallelism: 4,
};
```

Verify current defaults match OWASP recommendations (memory >= 47 MiB, time >= 1, parallelism = 1 for single-threaded servers). Adjust based on target server hardware — the goal is ~250ms per hash on production instances.

---

## 3. JWT ID (jti) Claim for Access Token Revocation

**Priority:** Low | **Effort:** Medium

Access tokens (15m in production) cannot be individually revoked — only the refresh token family can be revoked, forcing the user to wait up to 15 minutes for the access token to expire naturally.

**Current mitigation:** Short expiry (15m) limits the exposure window. Refresh token rotation with replay detection catches stolen refresh tokens immediately.

**If needed in the future:** Add a `jti` (UUID) claim to access tokens. Maintain a small revocation set (Redis or in-memory with TTL matching token expiry). Check `jti` against the set in the auth middleware. Only worth implementing if the 15-minute window becomes unacceptable (e.g., for compliance or high-sensitivity actions).

---

## 4. Reduce Dev Token Expiry

**Priority:** Low | **Effort:** Low

Development access tokens expire after 7 days (`platform/backend/src/config/schema.ts`). This is excessive — a leaked dev token remains valid for a week.

**Recommendation:** Reduce to 1 hour. The refresh token (365 days in dev) handles seamless re-authentication, so short access token expiry doesn't affect the development experience.

```ts
jwtAccessExpiry: process.env["BACKEND_JWT_ACCESS_EXPIRY"] ??
  (process.env["NODE_ENV"] === "production" ? "15m" : "1h"),
```

---

## 5. Cross-Instance Rate Limiting

**Priority:** Medium (production only) | **Effort:** Medium

Rate limiting is per-process (in-memory sliding window). In a multi-instance deployment, each instance has independent counters, effectively multiplying the allowed rate by the instance count.

**Current mitigation:** AWS WAF can handle DDoS protection at the ALB level. The per-instance limiter provides endpoint-specific granularity (e.g., stricter on `/auth/*`).

**If scaling beyond WAF:** Replace the in-memory `Map<string, WindowEntry>` in `rate-limiter.ts` with a Redis-backed counter using `INCR` + `EXPIRE`. The same sliding-window logic works — just swap the storage backend. Consider the `rate-limiter-flexible` npm package which supports Redis, Memcached, and cluster modes.

---

## 6. HSTS Preloading

**Priority:** Low | **Effort:** Low

The `Strict-Transport-Security` header is set to `max-age=31536000; includeSubDomains` but does not include the `preload` directive. HSTS preloading adds the domain to browsers' built-in HSTS list, protecting even the first visit from SSL stripping.

**Prerequisites before enabling:**
1. All subdomains must support HTTPS
2. The base domain must redirect HTTP to HTTPS
3. Submit to hstspreload.org after adding the directive

```ts
c.header("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
```

---

## 7. Authenticated Change-Password Endpoint

**Priority:** Low | **Effort:** Low

Currently, password changes are only possible via the forgot-password flow (email token). There is no authenticated `PUT /auth/password` endpoint for logged-in users to change their password directly.

**Recommendation:** Add `PUT /auth/password` requiring the current password + new password. Revoke all sessions on success (same as `resetPassword`). This is standard for user account management UIs.

---

## 8. Content Security Policy for Web UI

**Priority:** Medium | **Effort:** Medium

The backend and VCP have strict CSP headers (`default-src 'none'`) appropriate for JSON APIs. The web UI (served by Vite in dev, static hosting in production) does not set CSP headers.

**Recommendation:** Add a CSP meta tag or response header for the web UI:
```
default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' https://api.votiverse.com; frame-ancestors 'none'
```

Adjust `connect-src` to match the backend URL. The `'unsafe-inline'` for styles is needed for Tailwind's runtime style injection; consider extracting to a stylesheet if CSP strictness is a requirement.

---

## 9. Dependency Vulnerability Scanning

**Priority:** Medium | **Effort:** Low (setup)

No automated dependency scanning is configured. Vulnerable transitive dependencies can introduce supply chain risks.

**Recommendation:**
- Add `npm audit` to CI (fail on high/critical)
- Enable GitHub Dependabot or Renovate for automated PRs
- Pin major versions in `package.json` to avoid unexpected breaking changes
- Review `pnpm audit` output periodically

---

## 10. Rate Limiting on Sensitive Non-Auth Endpoints

**Priority:** Low | **Effort:** Low

Rate limiting currently distinguishes only `/auth/*` (10/min) vs everything else (100/min). Some non-auth endpoints warrant stricter limits:

- `POST /groups/:id/invitations` — bulk invite abuse
- `POST /groups/:id/join-requests` — join request spam
- `POST /auth/resend-verification` — email bombing (already authenticated, but no per-user limit)

**Recommendation:** Add a third rate limit tier for write-heavy endpoints, or add per-user (not per-IP) rate limiting for authenticated routes.

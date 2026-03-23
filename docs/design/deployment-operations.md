# Deployment & Operations Guide

This document covers production deployment configuration, database migrations, asset storage, and operational concerns for the Votiverse platform.

---

## Environment Variables

### Backend (`platform/backend/`)

#### Required in production

| Variable | Description | Example |
|----------|-------------|---------|
| `NODE_ENV` | Must be `"production"` | `production` |
| `BACKEND_JWT_SECRET` | JWT signing secret (min 32 chars, random) | `openssl rand -base64 48` |
| `BACKEND_CORS_ORIGINS` | Comma-separated allowed origins | `https://app.votiverse.com` |
| `BACKEND_VCP_API_KEY` | API key for VCP communication | `vcp_prod_xxxxx` |
| `BACKEND_DATABASE_URL` | PostgreSQL connection string | `postgresql://user:pass@host:5432/votiverse_backend` |
| `BACKEND_VCP_URL` | VCP base URL | `http://vcp.internal:3000` |

#### Asset storage (S3)

| Variable | Description | Default |
|----------|-------------|---------|
| `BACKEND_ASSET_STORAGE` | `"database"` (dev) or `"s3"` (prod) | `database` |
| `BACKEND_S3_BUCKET` | S3 bucket name (required when `s3`) | — |
| `BACKEND_S3_REGION` | AWS region | `us-east-1` |
| `BACKEND_S3_CDN_DOMAIN` | CloudFront distribution domain | — |

When `BACKEND_ASSET_STORAGE=s3`:
- `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner` must be installed
- The backend IAM role needs `s3:PutObject`, `s3:GetObject`, `s3:HeadObject`, `s3:DeleteObject` on the bucket
- If `BACKEND_S3_CDN_DOMAIN` is set, asset read URLs use `https://{domain}/{key}`; otherwise they use the S3 direct URL

#### Auth & session

| Variable | Description | Default (prod) |
|----------|-------------|----------------|
| `BACKEND_JWT_ACCESS_EXPIRY` | Access token lifetime | `15m` |
| `BACKEND_JWT_REFRESH_EXPIRY` | Refresh token lifetime | `30d` |
| `BACKEND_COOKIE_DOMAIN` | Cookie Domain attribute for cross-subdomain | — |

#### Rate limiting

| Variable | Description | Default |
|----------|-------------|---------|
| `BACKEND_RATE_LIMIT_ENABLED` | Enable app-level rate limiting | `true` |
| `BACKEND_RATE_LIMIT_RPM` | Legacy (unused) | `0` |

Rate limits are in-memory, per-instance:
- `/auth/*` endpoints: 10 requests/minute per IP
- All other endpoints: 100 requests/minute per IP

For DDoS protection, use AWS WAF at the ALB level. Set `BACKEND_RATE_LIMIT_ENABLED=false` if WAF handles all rate limiting.

#### Email (SMTP)

| Variable | Description |
|----------|-------------|
| `BACKEND_NOTIFICATION_ADAPTER` | `"smtp"` for production email |
| `BACKEND_SMTP_HOST` | SMTP server hostname |
| `BACKEND_SMTP_PORT` | SMTP port (default: `587`) |
| `BACKEND_SMTP_USER` | SMTP username |
| `BACKEND_SMTP_PASS` | SMTP password |
| `BACKEND_SMTP_FROM` | Sender address |

#### Push notifications

| Variable | Description |
|----------|-------------|
| `APNS_KEY_PATH` | Path to APNs .p8 key file |
| `APNS_KEY_ID` | APNs key ID |
| `APNS_TEAM_ID` | Apple team ID |
| `APNS_BUNDLE_ID` | iOS app bundle ID |
| `APNS_SANDBOX` | `"false"` for production APNs |
| `FCM_SERVICE_ACCOUNT_PATH` | Path to Firebase service account JSON |

### VCP (`platform/vcp/`)

| Variable | Description | Example |
|----------|-------------|---------|
| `NODE_ENV` | Must be `"production"` | `production` |
| `VCP_DATABASE_URL` | PostgreSQL connection string | `postgresql://user:pass@host:5432/votiverse_vcp` |
| `VCP_API_KEYS` | JSON array of API key configs | `[{"key":"vcp_prod_xxxxx","clientId":"backend","clientName":"Backend"}]` |
| `VCP_CORS_ORIGINS` | Comma-separated allowed origins | `http://backend.internal:4000` |
| `VCP_JWT_SECRET` | JWT secret (if using JWT auth mode) | — |

---

## Database Migrations

Both backend and VCP include a migration framework that runs on startup.

### How it works

1. On startup, the migrator checks the `migrations/` directory for `.sql` files
2. It compares them against the `schema_migrations` table to find unapplied migrations
3. Each new migration is executed in a transaction
4. Applied migrations are recorded in `schema_migrations`

### Creating a migration

```bash
# Backend
echo "ALTER TABLE users ADD COLUMN phone TEXT;" > platform/backend/migrations/001_add_phone.sql

# VCP
echo "CREATE INDEX idx_events_created ON events(occurred_at);" > platform/vcp/migrations/001_add_events_index.sql
```

### Naming convention

```
NNN_description.sql
```

- `NNN`: zero-padded number (001, 002, 003, ...)
- `description`: snake_case description of the change
- Files are sorted lexicographically — numbering ensures correct order

### Rules

- **Migrations are append-only.** Never modify or delete a migration that has been applied to any environment.
- **Each migration runs in a transaction.** If any statement fails, the entire migration rolls back.
- **Test migrations locally first.** Run against a dev database before deploying.
- **The initial schema uses `CREATE TABLE IF NOT EXISTS`** in the adapter's `initialize()` method. Migrations are for subsequent changes after the initial deployment.

### Checking migration status

```sql
SELECT * FROM schema_migrations ORDER BY version;
```

---

## Asset Storage

### Architecture

```
Browser → POST /assets/upload-url → Backend → generates presigned S3 PUT URL
Browser → PUT presigned-url → S3 (direct upload, no backend involvement)
Browser → POST /assets/:id/confirm → Backend → verifies S3 object, stores metadata
Browser → GET asset-url → CloudFront → S3 (CDN-served, no backend involvement)
```

### Upload flow (S3 mode)

1. **Request upload URL**: `POST /assemblies/:id/assets/upload-url` with `{ filename, mimeType }`
   - Returns `{ assetId, uploadUrl }` where `uploadUrl` is a presigned S3 PUT URL (valid for 5 minutes)
2. **Upload directly to S3**: `PUT uploadUrl` with the file body and `Content-Type` header
3. **Confirm upload**: `POST /assemblies/:id/assets/:assetId/confirm` with `{ sizeBytes, hash }`
   - Backend verifies the S3 object exists via `HeadObject`
   - Stores metadata in the database (no binary data)
   - Returns `{ id, filename, mimeType, sizeBytes, hash, url }` where `url` is the CloudFront URL

### Upload flow (database mode, dev only)

1. **Direct upload**: `POST /assemblies/:id/assets` with multipart form data (`file` field)
   - Backend stores the binary in the database
   - Returns `{ id, filename, mimeType, sizeBytes, hash, url }`

### Read flow

- **S3 mode**: `GET /assemblies/:id/assets/:assetId` redirects (302) to the CloudFront URL
- **Database mode**: `GET /assemblies/:id/assets/:assetId` serves the blob directly with `Content-Type` and `Content-Disposition` headers

### S3 bucket policy

The bucket should be private (no public access). CloudFront uses an Origin Access Identity (OAI) or Origin Access Control (OAC) to read from S3. Presigned PUT URLs allow direct uploads without making the bucket writable by the public.

### S3 key structure

```
assets/{assemblyId}/{assetId}/{filename}
```

### Required IAM permissions (backend role)

```json
{
  "Effect": "Allow",
  "Action": [
    "s3:PutObject",
    "s3:GetObject",
    "s3:HeadObject",
    "s3:DeleteObject"
  ],
  "Resource": "arn:aws:s3:::BUCKET_NAME/assets/*"
}
```

---

## Dev-Only Endpoints

The following endpoints are **completely blocked in production** by a middleware guard that returns 403 before the request reaches any handler.

### Backend

| Endpoint | Purpose |
|----------|---------|
| `GET /dev/clock` | Read backend dev clock state |
| `POST /dev/clock/advance` | Advance time by N milliseconds |
| `POST /dev/clock/reset` | Reset to real time |
| `POST /dev/clock/sync` | Sync with VCP dev clock |
| `POST /dev/notifications/trigger` | Create test notification |
| `POST /dev/notifications/seed` | Seed sample notifications |
| `POST /internal/memberships` | Seed membership data |
| `POST /internal/tracked-events` | Seed tracked events |
| `POST /internal/tracked-surveys` | Seed tracked surveys |
| `POST /internal/assemblies-cache` | Seed assembly cache |
| `POST /internal/topics-cache` | Seed topic cache |
| `POST /internal/surveys-cache` | Seed survey cache |
| `POST /internal/content-seed` | Seed proposal/note content |

**Guard mechanism**: In production (`NODE_ENV=production`), a middleware in `server.ts` intercepts `/dev/*` and `/internal/*` before any handler runs. In development, these endpoints bypass authentication for convenience.

### VCP

| Endpoint | Purpose |
|----------|---------|
| `GET /dev/clock` | Read VCP test clock state |
| `POST /dev/clock/advance` | Advance test clock |
| `POST /dev/clock/set` | Set clock to specific time |
| `POST /dev/clock/reset` | Reset to real time |

**Guard mechanism**: Fail-closed. Dev routes are only mounted when `NODE_ENV` is explicitly `"development"` or `"test"`. If `NODE_ENV` is unset or any other value, dev routes do not exist. A belt-and-suspenders middleware inside the dev routes also checks `isDevEnabled()`.

---

## Security Hardening Summary

These measures are active in production:

| Feature | Description |
|---------|-------------|
| **Brute-force protection** | Account locked for 15 minutes after 5 failed login attempts |
| **Rate limiting** | 10 req/min on auth, 100 req/min global (per IP, per instance) |
| **Password minimum** | 12 characters enforced by Zod schema + service-level check |
| **Email verification** | Required before joining assemblies. 24-hour verification token. |
| **Token family tracking** | Refresh token replay detection — reuse of a revoked token kills the entire session family |
| **Refresh token rotation** | Every refresh issues a new token and revokes the old one |
| **Refresh token lifetime** | 30 days (production default) |
| **Error suppression** | Internal errors return generic message; real error logged server-side |
| **Cookie security** | httpOnly, Secure, SameSite=Lax (access) / Strict (refresh) |
| **Input validation** | Zod schemas on all auth, profile, invitation, and device token endpoints |
| **CORS enforcement** | Explicit origin allowlist required in production |
| **Security headers** | HSTS, X-Content-Type-Options, X-Frame-Options, CSP, Referrer-Policy, Permissions-Policy |
| **Dev endpoint lockdown** | `/dev/*` and `/internal/*` blocked by middleware in production |

---

## PostgreSQL Connection Pool

Both VCP and backend PostgreSQL adapters accept pool configuration:

| Setting | Default | Description |
|---------|---------|-------------|
| `max` | 20 | Maximum connections in the pool |
| `idleTimeoutMillis` | 30,000 | Close idle connections after 30s |
| `connectionTimeoutMillis` | 5,000 | Fail if connection can't be acquired in 5s |

To override, pass `poolConfig` to the `PostgresAdapter` constructor. For most ASG deployments, the defaults are appropriate. Adjust `max` if you have many concurrent requests per instance or a connection limit on the RDS instance.

---

## VCP Proxy Timeout

All backend-to-VCP HTTP calls have a **30-second timeout**. If the VCP doesn't respond:
- Proxy requests return `504 Gateway Timeout` with code `VCP_TIMEOUT`
- Content route VCP calls throw and are caught by the error handler
- VCPClient requests throw (caught by the caller)

This prevents the backend from hanging if the VCP is unresponsive.

---

## Production Startup Checklist

1. Set `NODE_ENV=production` on both backend and VCP
2. Set all required environment variables (see tables above)
3. Run the backend and VCP — they will:
   - Validate production config (fail fast with clear errors if misconfigured)
   - Initialize the database schema (`CREATE TABLE IF NOT EXISTS`)
   - Run any pending migrations from the `migrations/` directory
   - Start the HTTP server
4. Verify health: `GET /health` on both services should return 200
5. Verify dev endpoints are blocked: `GET /dev/clock` should return 403

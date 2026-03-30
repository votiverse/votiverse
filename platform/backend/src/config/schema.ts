/**
 * Backend configuration schema and loading.
 */

export interface BackendConfig {
  port: number;
  dbPath: string;
  databaseUrl: string | null;
  jwtSecret: string;
  jwtAccessExpiry: string;
  jwtRefreshExpiry: string;
  vcpBaseUrl: string;
  vcpApiKey: string;
  logLevel: "debug" | "info" | "warn" | "error";
  corsOrigins: string[];
  rateLimitRpm: number;
  rateLimitEnabled: boolean;
  cookieDomain: string | null;
  maxBodySize: number;
  notificationAdapter: "console" | "file" | "smtp" | "ses" | "twilio";
  notificationIntervalMs: number;
  notificationFileDir: string;
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPass: string;
  smtpFrom: string;
  apnsKeyPath: string | null;
  apnsKeyId: string;
  apnsTeamId: string;
  apnsBundleId: string;
  apnsSandbox: boolean;
  fcmServiceAccountPath: string | null;
  assetStorage: "database" | "s3";
  s3Bucket: string;
  s3Region: string;
  s3CdnDomain: string;
  oauthGoogleClientId: string;
  oauthGoogleClientSecret: string;
  oauthMicrosoftClientId: string;
  oauthMicrosoftClientSecret: string;
  oauthRedirectBaseUrl: string;
  oauthFrontendUrl: string;
  /** Trust proxy headers (X-Forwarded-For, X-Real-IP) for client IP detection.
   *  Set to true when running behind a reverse proxy (ALB, CloudFront).
   *  Default: true in production, false otherwise. */
  trustProxy: boolean;
}

const DEFAULT_JWT_SECRET = "backend-dev-secret-do-not-use-in-production";

export function loadConfig(): BackendConfig {
  return {
    port: parseInt(process.env["BACKEND_PORT"] ?? "4000", 10),
    dbPath: process.env["BACKEND_DB_PATH"] ?? "./backend-dev.db",
    databaseUrl: process.env["BACKEND_DATABASE_URL"] ?? null,
    jwtSecret: process.env["BACKEND_JWT_SECRET"] ?? DEFAULT_JWT_SECRET,
    jwtAccessExpiry: process.env["BACKEND_JWT_ACCESS_EXPIRY"] ??
      (process.env["NODE_ENV"] === "production" ? "15m" : "7d"),
    jwtRefreshExpiry: process.env["BACKEND_JWT_REFRESH_EXPIRY"] ??
      (process.env["NODE_ENV"] === "production" ? "30d" : "365d"),
    vcpBaseUrl: process.env["BACKEND_VCP_URL"] ?? "http://localhost:3000",
    vcpApiKey: process.env["BACKEND_VCP_API_KEY"] ?? "vcp_dev_key_00000000",
    logLevel: (process.env["BACKEND_LOG_LEVEL"] as BackendConfig["logLevel"]) ?? "info",
    corsOrigins: parseCorsOrigins(process.env["BACKEND_CORS_ORIGINS"]),
    rateLimitRpm: parseInt(process.env["BACKEND_RATE_LIMIT_RPM"] ?? "0", 10),
    rateLimitEnabled: process.env["BACKEND_RATE_LIMIT_ENABLED"]
      ? process.env["BACKEND_RATE_LIMIT_ENABLED"] !== "false"
      : process.env["NODE_ENV"] === "production",
    cookieDomain: process.env["BACKEND_COOKIE_DOMAIN"] ?? null,
    maxBodySize: parseInt(process.env["BACKEND_MAX_BODY_SIZE"] ?? String(1024 * 1024), 10),
    notificationAdapter: (process.env["BACKEND_NOTIFICATION_ADAPTER"] as BackendConfig["notificationAdapter"]) ?? "console",
    notificationIntervalMs: parseInt(process.env["BACKEND_NOTIFICATION_INTERVAL"] ?? "60000", 10),
    notificationFileDir: process.env["BACKEND_NOTIFICATION_FILE_DIR"] ?? "./notifications",
    smtpHost: process.env["BACKEND_SMTP_HOST"] ?? "",
    smtpPort: parseInt(process.env["BACKEND_SMTP_PORT"] ?? "587", 10),
    smtpUser: process.env["BACKEND_SMTP_USER"] ?? "",
    smtpPass: process.env["BACKEND_SMTP_PASS"] ?? "",
    smtpFrom: process.env["BACKEND_SMTP_FROM"] ?? "noreply@votiverse.example.com",
    apnsKeyPath: process.env["APNS_KEY_PATH"] ?? null,
    apnsKeyId: process.env["APNS_KEY_ID"] ?? "",
    apnsTeamId: process.env["APNS_TEAM_ID"] ?? "Q3NAYGQX43",
    apnsBundleId: process.env["APNS_BUNDLE_ID"] ?? "app.votiverse.mobile",
    apnsSandbox: process.env["APNS_SANDBOX"] !== "false",
    fcmServiceAccountPath: process.env["FCM_SERVICE_ACCOUNT_PATH"] ?? null,
    assetStorage: (process.env["BACKEND_ASSET_STORAGE"] as "database" | "s3") ?? "database",
    s3Bucket: process.env["BACKEND_S3_BUCKET"] ?? "",
    s3Region: process.env["BACKEND_S3_REGION"] ?? "us-east-1",
    s3CdnDomain: process.env["BACKEND_S3_CDN_DOMAIN"] ?? "",
    oauthGoogleClientId: process.env["OAUTH_GOOGLE_CLIENT_ID"] ?? "",
    oauthGoogleClientSecret: process.env["OAUTH_GOOGLE_CLIENT_SECRET"] ?? "",
    oauthMicrosoftClientId: process.env["OAUTH_MICROSOFT_CLIENT_ID"] ?? "",
    oauthMicrosoftClientSecret: process.env["OAUTH_MICROSOFT_CLIENT_SECRET"] ?? "",
    oauthRedirectBaseUrl: process.env["OAUTH_REDIRECT_BASE_URL"] ?? "http://localhost:4000",
    oauthFrontendUrl: process.env["OAUTH_FRONTEND_URL"] ?? "http://localhost:5173",
    trustProxy: process.env["BACKEND_TRUST_PROXY"]
      ? process.env["BACKEND_TRUST_PROXY"] === "true"
      : process.env["NODE_ENV"] === "production",
  };
}

function parseCorsOrigins(envValue: string | undefined): string[] {
  if (!envValue) return ["http://localhost:5173", "http://localhost:5174", "tauri://localhost", "https://tauri.localhost", "http://tauri.localhost"];
  return envValue.split(",").map((s) => s.trim()).filter(Boolean);
}

export function validateProductionConfig(config: BackendConfig): void {
  const errors: string[] = [];

  if (config.jwtSecret === DEFAULT_JWT_SECRET) {
    errors.push("BACKEND_JWT_SECRET must be explicitly set in production");
  }

  if (!process.env["BACKEND_CORS_ORIGINS"]) {
    errors.push("BACKEND_CORS_ORIGINS must be explicitly set in production");
  }

  if (config.vcpApiKey === "vcp_dev_key_00000000") {
    errors.push("BACKEND_VCP_API_KEY must be explicitly set in production");
  }

  if (!config.databaseUrl) {
    errors.push("BACKEND_DATABASE_URL must be set in production (PostgreSQL connection string)");
  }

  if (config.vcpBaseUrl === "http://localhost:3000") {
    errors.push("BACKEND_VCP_URL should point to the production VCP endpoint");
  }

  if (config.assetStorage === "database") {
    errors.push("BACKEND_ASSET_STORAGE should be 's3' in production — database storage does not scale");
  }

  if (config.assetStorage === "s3") {
    if (!config.s3Bucket) {
      errors.push("BACKEND_S3_BUCKET is required when asset storage is 's3'");
    }
  }

  if (config.notificationAdapter === "smtp") {
    if (!config.smtpHost) errors.push("BACKEND_SMTP_HOST is required when notification adapter is 'smtp'");
    if (!config.smtpUser) errors.push("BACKEND_SMTP_USER is required when notification adapter is 'smtp'");
    if (!config.smtpPass) errors.push("BACKEND_SMTP_PASS is required when notification adapter is 'smtp'");
  }

  if (errors.length > 0) {
    throw new Error(
      `Production configuration errors:\n${errors.map((e) => `  - ${e}`).join("\n")}`,
    );
  }
}

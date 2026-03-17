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
  maxBodySize: number;
  notificationAdapter: "console" | "file" | "smtp" | "ses" | "twilio";
  notificationIntervalMs: number;
  notificationFileDir: string;
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPass: string;
  smtpFrom: string;
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
      (process.env["NODE_ENV"] === "production" ? "90d" : "365d"),
    vcpBaseUrl: process.env["BACKEND_VCP_URL"] ?? "http://localhost:3000",
    vcpApiKey: process.env["BACKEND_VCP_API_KEY"] ?? "vcp_dev_key_00000000",
    logLevel: (process.env["BACKEND_LOG_LEVEL"] as BackendConfig["logLevel"]) ?? "info",
    corsOrigins: parseCorsOrigins(process.env["BACKEND_CORS_ORIGINS"]),
    rateLimitRpm: parseInt(process.env["BACKEND_RATE_LIMIT_RPM"] ?? "0", 10),
    maxBodySize: parseInt(process.env["BACKEND_MAX_BODY_SIZE"] ?? String(1024 * 1024), 10),
    notificationAdapter: (process.env["BACKEND_NOTIFICATION_ADAPTER"] as BackendConfig["notificationAdapter"]) ?? "console",
    notificationIntervalMs: parseInt(process.env["BACKEND_NOTIFICATION_INTERVAL"] ?? "60000", 10),
    notificationFileDir: process.env["BACKEND_NOTIFICATION_FILE_DIR"] ?? "./notifications",
    smtpHost: process.env["BACKEND_SMTP_HOST"] ?? "",
    smtpPort: parseInt(process.env["BACKEND_SMTP_PORT"] ?? "587", 10),
    smtpUser: process.env["BACKEND_SMTP_USER"] ?? "",
    smtpPass: process.env["BACKEND_SMTP_PASS"] ?? "",
    smtpFrom: process.env["BACKEND_SMTP_FROM"] ?? "noreply@votiverse.example.com",
  };
}

function parseCorsOrigins(envValue: string | undefined): string[] {
  if (!envValue) return ["http://localhost:5173", "http://localhost:5174"];
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

  if (errors.length > 0) {
    throw new Error(
      `Production configuration errors:\n${errors.map((e) => `  - ${e}`).join("\n")}`,
    );
  }
}

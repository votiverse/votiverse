/**
 * VCP configuration schema and loading.
 */

export interface VCPConfig {
  /** HTTP server port. */
  port: number;
  /** SQLite database file path (used when databaseUrl is not set). */
  dbPath: string;
  /** PostgreSQL connection URL. If set, PostgreSQL is used instead of SQLite. */
  databaseUrl: string | null;
  /** API keys: array of { key, clientId, clientName }. */
  apiKeys: Array<{ key: string; clientId: string; clientName: string }>;
  /** Log level. */
  logLevel: "debug" | "info" | "warn" | "error";
  /** Allowed CORS origins. */
  corsOrigins: string[];
  /** JWT signing secret. If set, enables JWT authentication for participants. */
  jwtSecret: string | null;
  /** JWT token expiry duration (e.g., "24h", "7d"). */
  jwtExpiry: string;
  /** Rate limit: requests per minute per client. 0 = disabled. */
  rateLimitRpm: number;
  /** Max request body size in bytes. */
  maxBodySize: number;
}

const DEFAULT_API_KEY = "vcp_dev_key_00000000";
const DEFAULT_CLIENT_ID = "dev-client";
const DEFAULT_CLIENT_NAME = "Local Development Client";

export function loadConfig(): VCPConfig {
  return {
    port: parseInt(process.env["VCP_PORT"] ?? "3000", 10),
    dbPath: process.env["VCP_DB_PATH"] ?? "./vcp-dev.db",
    databaseUrl: process.env["VCP_DATABASE_URL"] ?? null,
    apiKeys: parseApiKeys(process.env["VCP_API_KEYS"]),
    logLevel: (process.env["VCP_LOG_LEVEL"] as VCPConfig["logLevel"]) ?? "info",
    corsOrigins: parseCorsOrigins(process.env["VCP_CORS_ORIGINS"]),
    jwtSecret: process.env["VCP_JWT_SECRET"] ?? null,
    jwtExpiry: process.env["VCP_JWT_EXPIRY"] ?? "24h",
    rateLimitRpm: parseInt(process.env["VCP_RATE_LIMIT_RPM"] ?? "0", 10),
    maxBodySize: parseInt(process.env["VCP_MAX_BODY_SIZE"] ?? String(1024 * 1024), 10),
  };
}

function parseApiKeys(
  envValue: string | undefined,
): VCPConfig["apiKeys"] {
  if (!envValue) {
    return [{ key: DEFAULT_API_KEY, clientId: DEFAULT_CLIENT_ID, clientName: DEFAULT_CLIENT_NAME }];
  }
  try {
    return JSON.parse(envValue) as VCPConfig["apiKeys"];
  } catch {
    // Treat as a single key
    return [{ key: envValue, clientId: DEFAULT_CLIENT_ID, clientName: DEFAULT_CLIENT_NAME }];
  }
}

const DEFAULT_CORS_ORIGINS = ["http://localhost:5173", "http://localhost:5174"];

function parseCorsOrigins(envValue: string | undefined): string[] {
  if (!envValue) return DEFAULT_CORS_ORIGINS;
  return envValue.split(",").map((s) => s.trim()).filter(Boolean);
}

/**
 * Validate config for production safety.
 * Throws if critical settings are missing or insecure.
 */
export function validateProductionConfig(config: VCPConfig): void {
  const errors: string[] = [];

  if (!process.env["VCP_CORS_ORIGINS"]) {
    errors.push("VCP_CORS_ORIGINS must be explicitly set in production");
  }

  if (!process.env["VCP_API_KEYS"]) {
    errors.push("VCP_API_KEYS must be explicitly set in production (default dev key is not allowed)");
  }

  if (!config.jwtSecret) {
    errors.push("VCP_JWT_SECRET must be set in production for participant authentication");
  }

  if (config.dbPath === "./vcp-dev.db" && !config.databaseUrl) {
    console.warn("[vcp] WARNING: VCP_DB_PATH is the default './vcp-dev.db' in production mode");
  }

  if (errors.length > 0) {
    throw new Error(
      `Production configuration errors:\n${errors.map((e) => `  - ${e}`).join("\n")}`,
    );
  }
}

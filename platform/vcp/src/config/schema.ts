/**
 * VCP configuration schema and loading.
 */

export interface VCPConfig {
  /** HTTP server port. */
  port: number;
  /** SQLite database file path. */
  dbPath: string;
  /** API keys: array of { key, clientId, clientName }. */
  apiKeys: Array<{ key: string; clientId: string; clientName: string }>;
  /** Log level. */
  logLevel: "debug" | "info" | "warn" | "error";
  /** Allowed CORS origins. */
  corsOrigins: string[];
}

const DEFAULT_API_KEY = "vcp_dev_key_00000000";
const DEFAULT_CLIENT_ID = "dev-client";
const DEFAULT_CLIENT_NAME = "Local Development Client";

export function loadConfig(): VCPConfig {
  return {
    port: parseInt(process.env["VCP_PORT"] ?? "3000", 10),
    dbPath: process.env["VCP_DB_PATH"] ?? "./vcp-dev.db",
    apiKeys: parseApiKeys(process.env["VCP_API_KEYS"]),
    logLevel: (process.env["VCP_LOG_LEVEL"] as VCPConfig["logLevel"]) ?? "info",
    corsOrigins: parseCorsOrigins(process.env["VCP_CORS_ORIGINS"]),
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

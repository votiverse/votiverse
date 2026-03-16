/**
 * Structured logger with level filtering and JSON output.
 *
 * - Dev mode: human-readable `[level] message key=value` format
 * - Production mode (NODE_ENV=production): JSON lines to stdout/stderr
 */

type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  [key: string]: unknown;
}

export interface Logger {
  debug(message: string, fields?: Record<string, unknown>): void;
  info(message: string, fields?: Record<string, unknown>): void;
  warn(message: string, fields?: Record<string, unknown>): void;
  error(message: string, fields?: Record<string, unknown>): void;
  child(fields: Record<string, unknown>): Logger;
}

let globalLevel: LogLevel = "info";
let jsonMode = false;

export function configureLogger(level: LogLevel): void {
  globalLevel = level;
  jsonMode = process.env["NODE_ENV"] === "production";
}

function shouldLog(level: LogLevel): boolean {
  return LEVEL_ORDER[level] >= LEVEL_ORDER[globalLevel];
}

function emit(entry: LogEntry): void {
  if (jsonMode) {
    const stream = entry.level === "error" ? process.stderr : process.stdout;
    stream.write(JSON.stringify(entry) + "\n");
  } else {
    const { timestamp: _ts, level, message, ...rest } = entry;
    const extra = Object.entries(rest)
      .map(([k, v]) => `${k}=${typeof v === "string" ? v : JSON.stringify(v)}`)
      .join(" ");
    const line = `[${level}] ${message}${extra ? " " + extra : ""}`;
    if (level === "error") {
      console.error(line);
    } else {
      console.log(line);
    }
  }
}

export function createLogger(baseFields?: Record<string, unknown>): Logger {
  const base = baseFields ?? {};

  function log(level: LogLevel, message: string, fields?: Record<string, unknown>): void {
    if (!shouldLog(level)) return;
    emit({
      timestamp: new Date().toISOString(),
      level,
      message,
      ...base,
      ...fields,
    });
  }

  return {
    debug: (msg, fields) => log("debug", msg, fields),
    info: (msg, fields) => log("info", msg, fields),
    warn: (msg, fields) => log("warn", msg, fields),
    error: (msg, fields) => log("error", msg, fields),
    child: (fields) => createLogger({ ...base, ...fields }),
  };
}

export const logger = createLogger({ service: "backend" });

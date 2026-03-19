/**
 * Simple CSV parser for bulk invitation imports.
 *
 * Accepts a CSV string with a `handle` column (and optional `email` column).
 * Returns parsed rows and per-row errors.
 */

export interface ParsedRow {
  row: number;
  handle: string;
}

export interface ParseError {
  row: number;
  value: string;
  reason: string;
}

export interface ParseResult {
  rows: ParsedRow[];
  errors: ParseError[];
}

const HANDLE_REGEX = /^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/;

/**
 * Parse a CSV string of handles for bulk invitation.
 *
 * Accepted formats:
 *   - One handle per line (no header)
 *   - CSV with `handle` column header
 *   - Handles may be prefixed with `@` (stripped automatically)
 *   - Handles are normalized to lowercase
 */
export function parseCsvInvites(csv: string): ParseResult {
  const rows: ParsedRow[] = [];
  const errors: ParseError[] = [];

  const lines = csv.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
  if (lines.length === 0) return { rows, errors };

  // Detect header row
  let startLine = 0;
  const firstLine = lines[0].toLowerCase();
  if (firstLine === "handle" || firstLine.startsWith("handle,") || firstLine.startsWith("handle\t")) {
    startLine = 1;
  }

  for (let i = startLine; i < lines.length; i++) {
    const rowNum = i + 1;
    // Take first column (comma or tab separated)
    let value = lines[i].split(/[,\t]/)[0].trim();

    // Strip surrounding quotes
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1).trim();
    }

    // Strip @ prefix
    if (value.startsWith("@")) {
      value = value.slice(1);
    }

    // Normalize
    value = value.toLowerCase();

    if (!value) {
      continue; // skip blank lines
    }

    if (!HANDLE_REGEX.test(value) || value.length < 3 || value.length > 30) {
      errors.push({ row: rowNum, value, reason: "Invalid handle format (3-30 chars, lowercase alphanumeric and hyphens)" });
      continue;
    }

    // Deduplicate
    if (rows.some((r) => r.handle === value)) {
      errors.push({ row: rowNum, value, reason: "Duplicate handle" });
      continue;
    }

    rows.push({ row: rowNum, handle: value });
  }

  return { rows, errors };
}

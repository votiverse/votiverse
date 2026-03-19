/**
 * CSV parser unit tests — handles for bulk invitation imports.
 */

import { describe, it, expect } from "vitest";
import { parseCsvInvites } from "../src/lib/csv-parser.js";

describe("parseCsvInvites", () => {
  it("parses simple one-handle-per-line format", () => {
    const result = parseCsvInvites("alice\nbob\ncharlie");
    expect(result.rows).toHaveLength(3);
    expect(result.errors).toHaveLength(0);
    expect(result.rows.map((r) => r.handle)).toEqual(["alice", "bob", "charlie"]);
  });

  it("handles CSV with header row", () => {
    const result = parseCsvInvites("handle\nalice\nbob");
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0].handle).toBe("alice");
  });

  it("strips @ prefix from handles", () => {
    const result = parseCsvInvites("@alice\n@bob");
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0].handle).toBe("alice");
  });

  it("normalizes handles to lowercase", () => {
    const result = parseCsvInvites("Alice\nBOB\nCharlie-Smith");
    expect(result.rows.map((r) => r.handle)).toEqual(["alice", "bob", "charlie-smith"]);
  });

  it("handles CSV with comma-separated columns (takes first column)", () => {
    const result = parseCsvInvites("handle,email\nalice,alice@example.com\nbob,bob@example.com");
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0].handle).toBe("alice");
  });

  it("handles tab-separated values", () => {
    const result = parseCsvInvites("handle\temail\nalice\talice@example.com");
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].handle).toBe("alice");
  });

  it("strips surrounding quotes", () => {
    const result = parseCsvInvites('"alice"\n\'bob\'');
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0].handle).toBe("alice");
    expect(result.rows[1].handle).toBe("bob");
  });

  it("skips blank lines", () => {
    const result = parseCsvInvites("alice\n\n\nbob\n");
    expect(result.rows).toHaveLength(2);
  });

  it("handles Windows-style line endings", () => {
    const result = parseCsvInvites("alice\r\nbob\r\ncharlie");
    expect(result.rows).toHaveLength(3);
  });

  it("reports invalid handle format", () => {
    const result = parseCsvInvites("alice\na\ninvalid handle with spaces\nbob");
    expect(result.rows).toHaveLength(2);
    expect(result.errors).toHaveLength(2);
    expect(result.errors[0].reason).toMatch(/Invalid handle/);
  });

  it("deduplicates handles", () => {
    const result = parseCsvInvites("alice\nbob\nalice\nALICE");
    expect(result.rows).toHaveLength(2);
    expect(result.errors).toHaveLength(2);
    expect(result.errors[0].reason).toMatch(/Duplicate/);
  });

  it("returns empty result for empty input", () => {
    const result = parseCsvInvites("");
    expect(result.rows).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
  });

  it("includes row numbers in results", () => {
    const result = parseCsvInvites("handle\nalice\nbob");
    expect(result.rows[0].row).toBe(2); // row 1 is header
    expect(result.rows[1].row).toBe(3);
  });
});

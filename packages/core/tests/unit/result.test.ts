import { describe, it, expect } from "vitest";
import { ok, err, isOk, isErr, unwrap, unwrapErr } from "../../src/result.js";
import type { Result } from "../../src/result.js";

describe("Result type", () => {
  describe("ok()", () => {
    it("creates a successful result", () => {
      const result = ok(42);
      expect(result.ok).toBe(true);
      expect(result.value).toBe(42);
    });

    it("works with complex values", () => {
      const result = ok({ name: "Alice", age: 30 });
      expect(result.ok).toBe(true);
      expect(result.value).toEqual({ name: "Alice", age: 30 });
    });

    it("works with undefined value", () => {
      const result = ok(undefined);
      expect(result.ok).toBe(true);
      expect(result.value).toBeUndefined();
    });
  });

  describe("err()", () => {
    it("creates a failed result", () => {
      const result = err("something went wrong");
      expect(result.ok).toBe(false);
      expect(result.error).toBe("something went wrong");
    });

    it("works with error objects", () => {
      const error = new Error("test");
      const result = err(error);
      expect(result.ok).toBe(false);
      expect(result.error).toBe(error);
    });
  });

  describe("isOk() / isErr()", () => {
    it("isOk returns true for Ok results", () => {
      const result: Result<number, string> = ok(1);
      expect(isOk(result)).toBe(true);
      expect(isErr(result)).toBe(false);
    });

    it("isErr returns true for Err results", () => {
      const result: Result<number, string> = err("fail");
      expect(isOk(result)).toBe(false);
      expect(isErr(result)).toBe(true);
    });

    it("narrows the type correctly for Ok", () => {
      const result: Result<number, string> = ok(42);
      if (isOk(result)) {
        // TypeScript should know this is Ok<number> here
        expect(result.value).toBe(42);
      }
    });

    it("narrows the type correctly for Err", () => {
      const result: Result<number, string> = err("fail");
      if (isErr(result)) {
        // TypeScript should know this is Err<string> here
        expect(result.error).toBe("fail");
      }
    });
  });

  describe("unwrap()", () => {
    it("returns the value from an Ok result", () => {
      expect(unwrap(ok(42))).toBe(42);
    });

    it("throws for an Err result", () => {
      expect(() => unwrap(err("fail"))).toThrow("Attempted to unwrap an Err result: fail");
    });
  });

  describe("unwrapErr()", () => {
    it("returns the error from an Err result", () => {
      expect(unwrapErr(err("fail"))).toBe("fail");
    });

    it("throws for an Ok result", () => {
      expect(() => unwrapErr(ok(42))).toThrow("Attempted to unwrapErr an Ok result");
    });
  });
});

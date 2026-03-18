import { describe, it, expect } from "vitest";
import { computeContentHash, computeAssetHash } from "../../src/content-hash.js";

describe("computeContentHash", () => {
  it("produces a 64-character hex string (SHA-256)", () => {
    const hash = computeContentHash("hello world");
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("is deterministic for the same input", () => {
    const a = computeContentHash("# Title\n\nBody text");
    const b = computeContentHash("# Title\n\nBody text");
    expect(a).toBe(b);
  });

  it("differs for different markdown", () => {
    const a = computeContentHash("version 1");
    const b = computeContentHash("version 2");
    expect(a).not.toBe(b);
  });

  it("includes the null byte separator even with no assets", () => {
    const withEmpty = computeContentHash("hello", []);
    const withDefault = computeContentHash("hello");
    expect(withEmpty).toBe(withDefault);
  });

  it("differs when assets change", () => {
    const a = computeContentHash("same markdown", ["aaa"]);
    const b = computeContentHash("same markdown", ["bbb"]);
    expect(a).not.toBe(b);
  });

  it("is order-independent for asset hashes (sorted internally)", () => {
    const a = computeContentHash("text", ["hash_a", "hash_b", "hash_c"]);
    const b = computeContentHash("text", ["hash_c", "hash_a", "hash_b"]);
    expect(a).toBe(b);
  });

  it("differs when an asset is added", () => {
    const without = computeContentHash("text", []);
    const with_ = computeContentHash("text", ["asset_hash"]);
    expect(without).not.toBe(with_);
  });

  it("handles empty markdown", () => {
    const hash = computeContentHash("", ["abc"]);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("preserves whitespace significance", () => {
    const a = computeContentHash("hello world");
    const b = computeContentHash("hello  world");
    expect(a).not.toBe(b);
  });

  it("preserves trailing newline significance", () => {
    const a = computeContentHash("hello\n");
    const b = computeContentHash("hello");
    expect(a).not.toBe(b);
  });
});

describe("computeAssetHash", () => {
  it("produces a 64-character hex string", () => {
    const hash = computeAssetHash(Buffer.from("image data"));
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("is deterministic", () => {
    const data = Buffer.from("binary content");
    expect(computeAssetHash(data)).toBe(computeAssetHash(data));
  });

  it("differs for different data", () => {
    const a = computeAssetHash(Buffer.from("file A"));
    const b = computeAssetHash(Buffer.from("file B"));
    expect(a).not.toBe(b);
  });
});

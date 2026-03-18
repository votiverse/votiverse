/**
 * @votiverse/content — Content hash computation
 *
 * SHA-256 content hash covering markdown text and asset binary hashes.
 * See docs/design/content-architecture.md Appendix C for the specification.
 */

import { createHash } from "node:crypto";
import type { ContentHash } from "@votiverse/core";

/**
 * Computes the canonical content hash for a document.
 *
 * Algorithm: SHA-256(markdown + "\0" + sorted(assetHashes).join("\0"))
 *
 * The null byte separator cannot appear in UTF-8 markdown or hex-encoded
 * hashes, making the encoding unambiguous.
 *
 * @param markdown - The markdown text content.
 * @param assetHashes - SHA-256 hex hashes of referenced asset binaries. Order does not matter.
 * @returns The content hash as a hex-encoded SHA-256 string.
 */
export function computeContentHash(markdown: string, assetHashes: readonly string[] = []): ContentHash {
  const sorted = [...assetHashes].sort();
  const input = markdown + "\0" + sorted.join("\0");
  return createHash("sha256").update(input, "utf8").digest("hex") as ContentHash;
}

/**
 * Computes the SHA-256 hash of binary asset data.
 *
 * @param data - The binary content of the asset.
 * @returns Hex-encoded SHA-256 hash.
 */
export function computeAssetHash(data: Buffer | Uint8Array): string {
  return createHash("sha256").update(data).digest("hex");
}

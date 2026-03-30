/**
 * AssetStore — abstract interface for binary asset storage.
 *
 * Production uses S3 with CloudFront CDN and presigned upload URLs.
 * Development uses the database (BLOB/BYTEA) for zero-config setup.
 *
 * Refactored to use group_id instead of assembly_id.
 *
 * Upload flow (S3):
 *   1. Client calls POST /assets/upload-url → gets presigned PUT URL + asset ID
 *   2. Client uploads directly to S3 using the presigned URL
 *   3. Client calls POST /assets/:id/confirm → backend verifies S3 object, stores metadata
 *
 * Upload flow (Database, dev only):
 *   1. Client calls POST /assets (multipart form) → backend stores in DB
 *
 * Read flow (S3): backend returns CloudFront URL — client fetches directly from CDN
 * Read flow (Database): backend serves the blob via GET /assets/:id
 */

import { createHash } from "node:crypto";
import { v7 as uuidv7 } from "uuid";

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface AssetMetadata {
  id: string;
  groupId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  hash: string;
  uploadedBy: string;
  uploadedAt: number;
  url: string;
}

export interface UploadRequest {
  assetId: string;
  uploadUrl: string;
  /** S3 key or storage path — client doesn't need this but confirm does. */
  key: string;
}

export interface AssetStore {
  /** Generate a presigned upload URL. Returns the asset ID and URL. */
  requestUpload(params: {
    groupId: string;
    filename: string;
    mimeType: string;
    uploadedBy: string;
  }): Promise<UploadRequest>;

  /** Confirm an upload completed. Verifies the object exists and stores metadata. */
  confirmUpload(assetId: string, sizeBytes: number, hash: string): Promise<AssetMetadata>;

  /** Get the public (CDN) URL for an asset. */
  getUrl(assetId: string): Promise<string | null>;

  /** Get asset metadata (without binary data). */
  getMetadata(assetId: string): Promise<AssetMetadata | null>;

  /** Delete an asset from storage and metadata. */
  deleteAsset(assetId: string): Promise<void>;

  /**
   * Store an asset directly (for dev/migration — bypasses presigned URL flow).
   * DatabaseAssetStore implements this; S3AssetStore uploads to S3 directly.
   */
  storeDirect(params: {
    groupId: string;
    filename: string;
    mimeType: string;
    data: Buffer;
    uploadedBy: string;
  }): Promise<AssetMetadata>;
}

// ---------------------------------------------------------------------------
// Database implementation (development)
// ---------------------------------------------------------------------------

import type { DatabaseAdapter } from "../adapters/database/interface.js";

export class DatabaseAssetStore implements AssetStore {
  constructor(
    private readonly db: DatabaseAdapter,
    private readonly baseUrl: string,
  ) {}

  async requestUpload(params: {
    groupId: string;
    filename: string;
    mimeType: string;
    uploadedBy: string;
  }): Promise<UploadRequest> {
    // Database store doesn't use presigned URLs — return a POST endpoint
    const assetId = uuidv7();
    return {
      assetId,
      uploadUrl: `${this.baseUrl}/groups/${params.groupId}/assets`,
      key: assetId,
    };
  }

  async confirmUpload(assetId: string, _sizeBytes: number, _hash: string): Promise<AssetMetadata> {
    // In DB mode, the upload goes through storeDirect, so confirm is a no-op lookup
    const meta = await this.getMetadata(assetId);
    if (!meta) throw new Error(`Asset ${assetId} not found — upload may not have completed`);
    return meta;
  }

  async getUrl(assetId: string): Promise<string | null> {
    const row = await this.db.queryOne<{ group_id: string }>(
      "SELECT group_id FROM assets WHERE id = ?",
      [assetId],
    );
    if (!row) return null;
    return `${this.baseUrl}/groups/${row.group_id}/assets/${assetId}`;
  }

  async getMetadata(assetId: string): Promise<AssetMetadata | null> {
    const row = await this.db.queryOne<Record<string, unknown>>(
      "SELECT id, group_id, filename, mime_type, size_bytes, hash, uploaded_by, uploaded_at FROM assets WHERE id = ?",
      [assetId],
    );
    if (!row) return null;
    const groupId = row["group_id"] as string;
    return {
      id: row["id"] as string,
      groupId,
      filename: row["filename"] as string,
      mimeType: row["mime_type"] as string,
      sizeBytes: row["size_bytes"] as number,
      hash: row["hash"] as string,
      uploadedBy: row["uploaded_by"] as string,
      uploadedAt: row["uploaded_at"] as number,
      url: `${this.baseUrl}/groups/${groupId}/assets/${assetId}`,
    };
  }

  async deleteAsset(assetId: string): Promise<void> {
    await this.db.run("DELETE FROM assets WHERE id = ?", [assetId]);
  }

  async storeDirect(params: {
    groupId: string;
    filename: string;
    mimeType: string;
    data: Buffer;
    uploadedBy: string;
  }): Promise<AssetMetadata> {
    const id = uuidv7();
    const hash = createHash("sha256").update(params.data).digest("hex");
    const sizeBytes = params.data.length;
    const now = Date.now();

    await this.db.run(
      `INSERT INTO assets (id, group_id, filename, mime_type, size_bytes, hash, uploaded_by, uploaded_at, data)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, params.groupId, params.filename, params.mimeType, sizeBytes, hash, params.uploadedBy, now, params.data],
    );

    return {
      id,
      groupId: params.groupId,
      filename: params.filename,
      mimeType: params.mimeType,
      sizeBytes,
      hash,
      uploadedBy: params.uploadedBy,
      uploadedAt: now,
      url: `${this.baseUrl}/groups/${params.groupId}/assets/${id}`,
    };
  }

  /** Get raw binary data — only available in DatabaseAssetStore (dev). */
  async getData(assetId: string): Promise<{ data: Buffer; mimeType: string; filename: string; sizeBytes: number } | null> {
    const row = await this.db.queryOne<Record<string, unknown>>(
      "SELECT data, mime_type, filename, size_bytes FROM assets WHERE id = ?",
      [assetId],
    );
    if (!row) return null;
    return {
      data: row["data"] as Buffer,
      mimeType: row["mime_type"] as string,
      filename: row["filename"] as string,
      sizeBytes: row["size_bytes"] as number,
    };
  }
}

// ---------------------------------------------------------------------------
// S3 implementation (production)
// ---------------------------------------------------------------------------

export interface S3AssetStoreConfig {
  bucket: string;
  region: string;
  /** CloudFront distribution domain (e.g., "d1234.cloudfront.net"). If set, read URLs use this. */
  cdnDomain?: string;
  /** Presigned URL expiry in seconds (default: 300 = 5 minutes). */
  uploadUrlExpirySecs?: number;
}

/**
 * S3-backed asset store with CloudFront CDN.
 *
 * Requires @aws-sdk/client-s3 and @aws-sdk/s3-request-presigner
 * as peer dependencies — only imported when this class is instantiated.
 *
 * Assets are stored at: s3://{bucket}/assets/{groupId}/{assetId}/{filename}
 */
export class S3AssetStore implements AssetStore {
  private s3Client: unknown;
  private readonly config: Required<S3AssetStoreConfig>;

  constructor(
    private readonly db: DatabaseAdapter,
    s3Config: S3AssetStoreConfig,
  ) {
    this.config = {
      bucket: s3Config.bucket,
      region: s3Config.region,
      cdnDomain: s3Config.cdnDomain ?? "",
      uploadUrlExpirySecs: s3Config.uploadUrlExpirySecs ?? 300,
    };
  }

  private async getS3() {
    if (!this.s3Client) {
      const { S3Client } = await import("@aws-sdk/client-s3");
      this.s3Client = new S3Client({ region: this.config.region });
    }
    return this.s3Client;
  }

  async requestUpload(params: {
    groupId: string;
    filename: string;
    mimeType: string;
    uploadedBy: string;
  }): Promise<UploadRequest> {
    const assetId = uuidv7();
    const key = `assets/${params.groupId}/${assetId}/${params.filename}`;

    const s3 = await this.getS3();
    const { PutObjectCommand } = await import("@aws-sdk/client-s3");
    const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");

    const command = new PutObjectCommand({
      Bucket: this.config.bucket,
      Key: key,
      ContentType: params.mimeType,
    });

    const uploadUrl = await getSignedUrl(s3 as import("@aws-sdk/client-s3").S3Client, command, {
      expiresIn: this.config.uploadUrlExpirySecs,
    });

    // Pre-register metadata (without size/hash — those come on confirm)
    const now = Date.now();
    await this.db.run(
      `INSERT INTO assets (id, group_id, filename, mime_type, size_bytes, hash, uploaded_by, uploaded_at)
       VALUES (?, ?, ?, ?, 0, '', ?, ?)`,
      [assetId, params.groupId, params.filename, params.mimeType, params.uploadedBy, now],
    );

    return { assetId, uploadUrl, key };
  }

  async confirmUpload(assetId: string, sizeBytes: number, hash: string): Promise<AssetMetadata> {
    // Verify the object exists in S3
    const row = await this.db.queryOne<Record<string, unknown>>(
      "SELECT * FROM assets WHERE id = ?",
      [assetId],
    );
    if (!row) throw new Error(`Asset ${assetId} not found`);

    const groupId = row["group_id"] as string;
    const filename = row["filename"] as string;
    const key = `assets/${groupId}/${assetId}/${filename}`;

    const s3 = await this.getS3();
    const { HeadObjectCommand } = await import("@aws-sdk/client-s3");

    try {
      await (s3 as import("@aws-sdk/client-s3").S3Client).send(new HeadObjectCommand({
        Bucket: this.config.bucket,
        Key: key,
      }));
    } catch {
      throw new Error(`Asset ${assetId} not found in S3 — upload may not have completed`);
    }

    // Update metadata with confirmed size and hash
    await this.db.run(
      "UPDATE assets SET size_bytes = ?, hash = ? WHERE id = ?",
      [sizeBytes, hash, assetId],
    );

    return {
      id: assetId,
      groupId,
      filename,
      mimeType: row["mime_type"] as string,
      sizeBytes,
      hash,
      uploadedBy: row["uploaded_by"] as string,
      uploadedAt: row["uploaded_at"] as number,
      url: this.buildReadUrl(key),
    };
  }

  async getUrl(assetId: string): Promise<string | null> {
    const row = await this.db.queryOne<Record<string, unknown>>(
      "SELECT group_id, filename FROM assets WHERE id = ?",
      [assetId],
    );
    if (!row) return null;
    const key = `assets/${row["group_id"]}/${assetId}/${row["filename"]}`;
    return this.buildReadUrl(key);
  }

  async getMetadata(assetId: string): Promise<AssetMetadata | null> {
    const row = await this.db.queryOne<Record<string, unknown>>(
      "SELECT id, group_id, filename, mime_type, size_bytes, hash, uploaded_by, uploaded_at FROM assets WHERE id = ?",
      [assetId],
    );
    if (!row) return null;
    const groupId = row["group_id"] as string;
    const filename = row["filename"] as string;
    const key = `assets/${groupId}/${assetId}/${filename}`;
    return {
      id: row["id"] as string,
      groupId,
      filename,
      mimeType: row["mime_type"] as string,
      sizeBytes: row["size_bytes"] as number,
      hash: row["hash"] as string,
      uploadedBy: row["uploaded_by"] as string,
      uploadedAt: row["uploaded_at"] as number,
      url: this.buildReadUrl(key),
    };
  }

  async deleteAsset(assetId: string): Promise<void> {
    const row = await this.db.queryOne<Record<string, unknown>>(
      "SELECT group_id, filename FROM assets WHERE id = ?",
      [assetId],
    );
    if (row) {
      const key = `assets/${row["group_id"]}/${assetId}/${row["filename"]}`;
      const s3 = await this.getS3();
      const { DeleteObjectCommand } = await import("@aws-sdk/client-s3");
      await (s3 as import("@aws-sdk/client-s3").S3Client).send(new DeleteObjectCommand({
        Bucket: this.config.bucket,
        Key: key,
      }));
    }
    await this.db.run("DELETE FROM assets WHERE id = ?", [assetId]);
  }

  async storeDirect(params: {
    groupId: string;
    filename: string;
    mimeType: string;
    data: Buffer;
    uploadedBy: string;
  }): Promise<AssetMetadata> {
    const id = uuidv7();
    const hash = createHash("sha256").update(params.data).digest("hex");
    const sizeBytes = params.data.length;
    const now = Date.now();
    const key = `assets/${params.groupId}/${id}/${params.filename}`;

    // Upload to S3
    const s3 = await this.getS3();
    const { PutObjectCommand } = await import("@aws-sdk/client-s3");
    await (s3 as import("@aws-sdk/client-s3").S3Client).send(new PutObjectCommand({
      Bucket: this.config.bucket,
      Key: key,
      Body: params.data,
      ContentType: params.mimeType,
    }));

    // Store metadata (no binary data in DB)
    await this.db.run(
      `INSERT INTO assets (id, group_id, filename, mime_type, size_bytes, hash, uploaded_by, uploaded_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, params.groupId, params.filename, params.mimeType, sizeBytes, hash, params.uploadedBy, now],
    );

    return {
      id,
      groupId: params.groupId,
      filename: params.filename,
      mimeType: params.mimeType,
      sizeBytes,
      hash,
      uploadedBy: params.uploadedBy,
      uploadedAt: now,
      url: this.buildReadUrl(key),
    };
  }

  private buildReadUrl(key: string): string {
    if (this.config.cdnDomain) {
      return `https://${this.config.cdnDomain}/${key}`;
    }
    return `https://${this.config.bucket}.s3.${this.config.region}.amazonaws.com/${key}`;
  }
}

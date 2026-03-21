/**
 * PushDeliveryService — sends push notifications to mobile devices via APNs (iOS) and FCM (Android).
 *
 * Uses the APNs HTTP/2 API directly via Node's built-in http2 module.
 * FCM support can be added later for Android.
 *
 * APNs authentication uses a .p8 key file (token-based auth), which is
 * the recommended approach over certificate-based auth.
 */

import { createSign } from "node:crypto";
import * as http2 from "node:http2";
import { readFileSync } from "node:fs";
import type { DatabaseAdapter } from "../adapters/database/interface.js";
import { logger } from "../lib/logger.js";

const log = logger.child({ component: "push-delivery" });

export interface PushConfig {
  /** APNs .p8 key file path. If not set, push delivery is disabled. */
  apnsKeyPath: string | null;
  /** APNs key ID (from Apple Developer Portal). */
  apnsKeyId: string;
  /** Apple Developer Team ID. */
  apnsTeamId: string;
  /** App bundle identifier. */
  apnsBundleId: string;
  /** Use APNs sandbox (development) or production. */
  apnsSandbox: boolean;
}

interface DeviceTokenRow {
  id: string;
  user_id: string;
  platform: string;
  token: string;
}

export class PushDeliveryService {
  private apnsKey: string | null = null;
  private apnsJwt: string | null = null;
  private apnsJwtTimestamp = 0;
  private apnsConnection: http2.ClientHttp2Session | null = null;

  constructor(
    private readonly db: DatabaseAdapter,
    private readonly config: PushConfig,
  ) {
    if (config.apnsKeyPath) {
      try {
        this.apnsKey = readFileSync(config.apnsKeyPath, "utf8");
        log.info("APNs key loaded", { keyId: config.apnsKeyId });
      } catch (err) {
        log.warn("APNs key file not found — push notifications disabled", {
          path: config.apnsKeyPath,
          error: String(err),
        });
      }
    } else {
      log.info("APNs not configured — push notifications disabled");
    }
  }

  /** Whether push delivery is available. */
  get enabled(): boolean {
    return this.apnsKey !== null;
  }

  /**
   * Send a push notification to all devices registered by a user.
   * Fire-and-forget — errors are logged but never thrown.
   */
  async sendToUser(params: {
    userId: string;
    title: string;
    body: string;
    category?: string;
    actionUrl?: string;
    badge?: number;
  }): Promise<void> {
    const devices = await this.db.query<DeviceTokenRow>(
      `SELECT id, user_id, platform, token FROM device_tokens WHERE user_id = ?`,
      [params.userId],
    );

    if (devices.length === 0) return;

    for (const device of devices) {
      try {
        if (device.platform === "ios") {
          await this.sendApns(device.token, {
            title: params.title,
            body: params.body,
            category: params.category,
            actionUrl: params.actionUrl,
            badge: params.badge,
          });
        }
        // Android FCM: add here when needed
      } catch (err) {
        log.error("Push delivery failed", {
          platform: device.platform,
          userId: params.userId,
          error: String(err),
        });
        // Remove invalid tokens (APNs returns 410 for unregistered devices)
        if (err instanceof ApnsError && err.status === 410) {
          await this.db.run(`DELETE FROM device_tokens WHERE id = ?`, [device.id]);
          log.info("Removed expired device token", { deviceId: device.id });
        }
      }
    }
  }

  /**
   * Send a push notification to all devices of multiple users.
   */
  async sendToUsers(
    userIds: string[],
    params: { title: string; body: string; category?: string; actionUrl?: string },
  ): Promise<void> {
    for (const userId of userIds) {
      await this.sendToUser({ userId, ...params });
    }
  }

  // ---- APNs HTTP/2 ----

  private async sendApns(
    deviceToken: string,
    payload: { title: string; body: string; category?: string; actionUrl?: string; badge?: number },
  ): Promise<void> {
    if (!this.apnsKey) return;

    const jwt = this.getApnsJwt();
    const host = this.config.apnsSandbox
      ? "api.sandbox.push.apple.com"
      : "api.push.apple.com";

    const apnsPayload = {
      aps: {
        alert: { title: payload.title, body: payload.body },
        sound: "default",
        ...(payload.badge !== undefined ? { badge: payload.badge } : {}),
        ...(payload.category ? { category: payload.category } : {}),
      },
      ...(payload.actionUrl ? { actionUrl: payload.actionUrl } : {}),
    };

    const session = this.getApnsConnection(host);

    return new Promise<void>((resolve, reject) => {
      const req = session.request({
        ":method": "POST",
        ":path": `/3/device/${deviceToken}`,
        "authorization": `bearer ${jwt}`,
        "apns-topic": this.config.apnsBundleId,
        "apns-push-type": "alert",
        "apns-priority": "10",
        "content-type": "application/json",
      });

      req.setEncoding("utf8");
      let responseData = "";
      let statusCode = 0;

      req.on("response", (headers) => {
        statusCode = headers[":status"] as number;
      });
      req.on("data", (chunk) => { responseData += chunk; });
      req.on("end", () => {
        if (statusCode === 200) {
          log.debug("APNs push sent", { deviceToken: deviceToken.substring(0, 8) + "..." });
          resolve();
        } else {
          const error = new ApnsError(statusCode, responseData);
          log.warn("APNs push rejected", { status: statusCode, reason: responseData });
          reject(error);
        }
      });
      req.on("error", (err) => reject(err));

      req.write(JSON.stringify(apnsPayload));
      req.end();
    });
  }

  private getApnsConnection(host: string): http2.ClientHttp2Session {
    if (this.apnsConnection && !this.apnsConnection.closed && !this.apnsConnection.destroyed) {
      return this.apnsConnection;
    }
    this.apnsConnection = http2.connect(`https://${host}`);
    this.apnsConnection.on("error", (err) => {
      log.error("APNs connection error", { error: String(err) });
      this.apnsConnection = null;
    });
    this.apnsConnection.on("close", () => {
      this.apnsConnection = null;
    });
    return this.apnsConnection;
  }

  /**
   * Generate or reuse an APNs JWT. Tokens are valid for 60 minutes;
   * we refresh every 50 minutes to avoid expiration during delivery.
   */
  private getApnsJwt(): string {
    const now = Math.floor(Date.now() / 1000);
    if (this.apnsJwt && now - this.apnsJwtTimestamp < 3000) {
      return this.apnsJwt;
    }

    const header = Buffer.from(JSON.stringify({
      alg: "ES256",
      kid: this.config.apnsKeyId,
    })).toString("base64url");

    const claims = Buffer.from(JSON.stringify({
      iss: this.config.apnsTeamId,
      iat: now,
    })).toString("base64url");

    const signer = createSign("SHA256");
    signer.update(`${header}.${claims}`);
    const signature = signer.sign(this.apnsKey!, "base64url");

    this.apnsJwt = `${header}.${claims}.${signature}`;
    this.apnsJwtTimestamp = now;
    return this.apnsJwt;
  }

  /** Close the APNs HTTP/2 connection. */
  close(): void {
    if (this.apnsConnection) {
      this.apnsConnection.close();
      this.apnsConnection = null;
    }
  }
}

class ApnsError extends Error {
  constructor(public readonly status: number, public readonly reason: string) {
    super(`APNs error ${status}: ${reason}`);
    this.name = "ApnsError";
  }
}

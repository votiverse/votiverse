/**
 * Simple API key authentication adapter.
 *
 * Keys are loaded from configuration. For local dev, a default key is always available.
 */

import { createHash } from "node:crypto";
import type { AuthAdapter, ClientInfo } from "./interface.js";
import type { DatabaseAdapter } from "../database/interface.js";

export class SimpleAuthAdapter implements AuthAdapter {
  private readonly staticKeys: Map<string, ClientInfo>;

  constructor(
    keys: Array<{ key: string; clientId: string; clientName: string; scopes?: string[] }>,
    private readonly db?: DatabaseAdapter,
  ) {
    this.staticKeys = new Map();
    for (const k of keys) {
      this.staticKeys.set(k.key, {
        id: k.clientId,
        name: k.clientName,
        scopes: (k.scopes ?? ["participant", "operational"]) as ClientInfo["scopes"],
      });
    }
  }

  validate(apiKey: string): ClientInfo | null {
    // Check static keys first
    const staticClient = this.staticKeys.get(apiKey);
    if (staticClient) return staticClient;

    // Check database if available
    if (this.db) {
      const hash = createHash("sha256").update(apiKey).digest("hex");
      const row = this.db.queryOne<{ id: string; name: string }>(
        "SELECT id, name FROM clients WHERE api_key_hash = ?",
        [hash],
      );
      if (row) return { id: row.id, name: row.name, scopes: ["participant", "operational"] };
    }

    return null;
  }
}

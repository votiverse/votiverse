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
    keys: Array<{ key: string; clientId: string; clientName: string; scopes?: string[]; assemblyAccess?: readonly string[] | "*" }>,
    private readonly db?: DatabaseAdapter,
  ) {
    this.staticKeys = new Map();
    for (const k of keys) {
      this.staticKeys.set(k.key, {
        id: k.clientId,
        name: k.clientName,
        scopes: (k.scopes ?? ["participant", "operational"]) as ClientInfo["scopes"],
        assemblyAccess: k.assemblyAccess ?? "*",
      });
    }
  }

  async validate(apiKey: string): Promise<ClientInfo | null> {
    // Check static keys first
    const staticClient = this.staticKeys.get(apiKey);
    if (staticClient) return staticClient;

    // Check database if available
    if (this.db) {
      const hash = createHash("sha256").update(apiKey).digest("hex");
      const row = await this.db.queryOne<{ id: string; name: string; assembly_access: string }>(
        "SELECT id, name, assembly_access FROM clients WHERE api_key_hash = ?",
        [hash],
      );
      if (row) {
        let assemblyAccess: readonly string[] | "*";
        try {
          const parsed = JSON.parse(row.assembly_access);
          assemblyAccess = parsed === "*" ? "*" : (parsed as string[]);
        } catch {
          assemblyAccess = [];
        }
        return { id: row.id, name: row.name, scopes: ["participant", "operational"], assemblyAccess };
      }
    }

    return null;
  }

  /** Grant a client access to an assembly. No-op for static clients with "*". */
  async grantAssemblyAccess(clientId: string, assemblyId: string): Promise<void> {
    // Check if it's a static client with wildcard — no-op
    for (const client of this.staticKeys.values()) {
      if (client.id === clientId && client.assemblyAccess === "*") return;
    }

    // For static clients with explicit lists, update in-memory
    for (const client of this.staticKeys.values()) {
      if (client.id === clientId && Array.isArray(client.assemblyAccess)) {
        if (!client.assemblyAccess.includes(assemblyId)) {
          (client.assemblyAccess as string[]).push(assemblyId);
        }
        return;
      }
    }

    // For DB-backed clients, update the database
    if (this.db) {
      const row = await this.db.queryOne<{ assembly_access: string }>(
        "SELECT assembly_access FROM clients WHERE id = ?",
        [clientId],
      );
      if (row) {
        let list: string[];
        try {
          list = JSON.parse(row.assembly_access) as string[];
        } catch {
          list = [];
        }
        if (!list.includes(assemblyId)) {
          list.push(assemblyId);
          await this.db.run(
            "UPDATE clients SET assembly_access = ? WHERE id = ?",
            [JSON.stringify(list), clientId],
          );
        }
      }
    }
  }
}

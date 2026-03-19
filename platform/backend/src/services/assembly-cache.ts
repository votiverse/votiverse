/**
 * AssemblyCacheService — local cache of assembly data to avoid VCP round-trips.
 *
 * Assembly config is immutable after creation, so the cache never goes stale.
 * admissionMode is a backend-owned mutable setting (not part of GovernanceConfig).
 */

import type { DatabaseAdapter } from "../adapters/database/interface.js";

export type AdmissionMode = "open" | "approval" | "invite-only";

export interface CachedAssembly {
  id: string;
  organizationId: string | null;
  name: string;
  config: unknown;
  status: string;
  createdAt: string;
  admissionMode: AdmissionMode;
}

interface CachedAssemblyRow {
  id: string;
  organization_id: string | null;
  name: string;
  config: string;
  status: string;
  created_at: string;
  admission_mode: string;
}

function rowToAssembly(row: CachedAssemblyRow): CachedAssembly {
  return {
    id: row.id,
    organizationId: row.organization_id,
    name: row.name,
    config: JSON.parse(row.config),
    status: row.status,
    createdAt: row.created_at,
    admissionMode: (row.admission_mode as AdmissionMode) ?? "approval",
  };
}

export class AssemblyCacheService {
  constructor(private readonly db: DatabaseAdapter) {}

  /** Insert or replace an assembly in the cache. */
  async upsert(assembly: Omit<CachedAssembly, "admissionMode"> & { admissionMode?: AdmissionMode }): Promise<void> {
    const configJson = typeof assembly.config === "string" ? assembly.config : JSON.stringify(assembly.config);
    const admissionMode = assembly.admissionMode ?? "approval";
    await this.db.run(
      `INSERT INTO assemblies_cache (id, organization_id, name, config, status, created_at, admission_mode)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (id) DO UPDATE SET
         organization_id = excluded.organization_id,
         name = excluded.name,
         config = excluded.config,
         status = excluded.status,
         created_at = excluded.created_at,
         admission_mode = excluded.admission_mode`,
      [
        assembly.id,
        assembly.organizationId,
        assembly.name,
        configJson,
        assembly.status,
        assembly.createdAt,
        admissionMode,
      ],
    );
  }

  /** Get a single assembly by ID. Returns undefined if not cached. */
  async get(id: string): Promise<CachedAssembly | undefined> {
    const row = await this.db.queryOne<CachedAssemblyRow>(
      "SELECT id, organization_id, name, config, status, created_at, admission_mode FROM assemblies_cache WHERE id = ?",
      [id],
    );
    return row ? rowToAssembly(row) : undefined;
  }

  /** Get assemblies matching a set of IDs. */
  async listByIds(ids: string[]): Promise<CachedAssembly[]> {
    if (ids.length === 0) return [];

    const placeholders = ids.map(() => "?").join(", ");
    const rows = await this.db.query<CachedAssemblyRow>(
      `SELECT id, organization_id, name, config, status, created_at, admission_mode FROM assemblies_cache WHERE id IN (${placeholders})`,
      ids,
    );
    return rows.map(rowToAssembly);
  }

  /** Update the admission mode for an assembly. */
  async updateAdmissionMode(assemblyId: string, mode: AdmissionMode): Promise<void> {
    await this.db.run(
      "UPDATE assemblies_cache SET admission_mode = ? WHERE id = ?",
      [mode, assemblyId],
    );
  }
}

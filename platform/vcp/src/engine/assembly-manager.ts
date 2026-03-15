/**
 * AssemblyManager — manages engine instances per Assembly.
 *
 * Each Assembly gets its own VotiverseEngine backed by a scoped
 * SQLiteEventStore. Engine instances are cached in memory for the
 * lifetime of the server process.
 */

import type { GovernanceConfig } from "@votiverse/config";
import type { VotiverseEngine } from "@votiverse/engine";
import { createEngine } from "@votiverse/engine";
import { InvitationProvider } from "@votiverse/identity";
import type { ParticipantId, TopicId, IssueId, VotingEventId, Issue } from "@votiverse/core";
import { isOk } from "@votiverse/core";
import type { DatabaseAdapter } from "../adapters/database/interface.js";
import type { QueueAdapter } from "../adapters/queue/interface.js";
import { SQLiteEventStore } from "./sqlite-event-store.js";

interface AssemblyRecord {
  id: string;
  organization_id: string | null;
  name: string;
  config: string;
  status: string;
  created_at: string;
}

interface IssueRow {
  id: string;
  assembly_id: string;
  title: string;
  description: string;
  topic_ids: string;
  voting_event_id: string;
  choices: string | null;
}

interface ParticipantRow {
  id: string;
  assembly_id: string;
  name: string;
  registered_at: string;
}

export interface AssemblyInfo {
  id: string;
  organizationId: string | null;
  name: string;
  config: GovernanceConfig;
  status: string;
  createdAt: string;
}

export interface CreateAssemblyParams {
  name: string;
  organizationId?: string;
  config: GovernanceConfig;
}

export class AssemblyManager {
  private readonly engines = new Map<string, { engine: VotiverseEngine; provider: InvitationProvider; store: SQLiteEventStore }>();

  constructor(
    private readonly db: DatabaseAdapter,
    private readonly queue: QueueAdapter,
  ) {}

  /** Register a new Assembly. */
  createAssembly(id: string, params: CreateAssemblyParams): AssemblyInfo {
    this.db.run(
      `INSERT INTO assemblies (id, organization_id, name, config, created_at, status)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        id,
        params.organizationId ?? null,
        params.name,
        JSON.stringify(params.config),
        new Date().toISOString(),
        "active",
      ],
    );

    return {
      id,
      organizationId: params.organizationId ?? null,
      name: params.name,
      config: params.config,
      status: "active",
      createdAt: new Date().toISOString(),
    };
  }

  /** List all assemblies. */
  listAssemblies(): AssemblyInfo[] {
    const rows = this.db.query<AssemblyRecord>(
      "SELECT * FROM assemblies ORDER BY created_at DESC",
    );
    return rows.map((row) => ({
      id: row.id,
      organizationId: row.organization_id,
      name: row.name,
      config: JSON.parse(row.config) as GovernanceConfig,
      status: row.status,
      createdAt: row.created_at,
    }));
  }

  /** Get Assembly info without instantiating the engine. */
  getAssemblyInfo(assemblyId: string): AssemblyInfo | undefined {
    const row = this.db.queryOne<AssemblyRecord>(
      "SELECT * FROM assemblies WHERE id = ?",
      [assemblyId],
    );
    if (!row) return undefined;
    return {
      id: row.id,
      organizationId: row.organization_id,
      name: row.name,
      config: JSON.parse(row.config) as GovernanceConfig,
      status: row.status,
      createdAt: row.created_at,
    };
  }

  /** Get or create a cached engine instance for an Assembly. */
  async getEngine(assemblyId: string): Promise<{ engine: VotiverseEngine; provider: InvitationProvider; store: SQLiteEventStore }> {
    const cached = this.engines.get(assemblyId);
    if (cached) return cached;

    const info = this.getAssemblyInfo(assemblyId);
    if (!info) {
      throw new AssemblyNotFoundError(assemblyId);
    }

    const store = new SQLiteEventStore(this.db, assemblyId);
    const provider = new InvitationProvider(store);
    const engine = createEngine({
      config: info.config,
      eventStore: store,
      identityProvider: provider,
    });

    // Rehydrate from persisted events
    await provider.rehydrate();
    await engine.rehydrate();

    // Inject persisted issue details
    const issueRows = this.db.query<IssueRow>(
      "SELECT * FROM issues WHERE assembly_id = ?",
      [assemblyId],
    );
    for (const row of issueRows) {
      engine.injectIssue({
        id: row.id as IssueId,
        title: row.title,
        description: row.description,
        topicIds: JSON.parse(row.topic_ids) as TopicId[],
        votingEventId: row.voting_event_id as VotingEventId,
        ...(row.choices ? { choices: JSON.parse(row.choices) as string[] } : {}),
      });
    }

    const entry = { engine, provider, store };
    this.engines.set(assemblyId, entry);
    return entry;
  }

  /** Add a participant to an Assembly. */
  async addParticipant(assemblyId: string, name: string): Promise<{ id: string; name: string }> {
    const { provider } = await this.getEngine(assemblyId);
    const result = await provider.invite(name);
    if (!isOk(result)) {
      throw new Error(result.error.message);
    }
    const participant = result.value;

    // Persist to participants table
    this.db.run(
      `INSERT OR IGNORE INTO participants (id, assembly_id, name, registered_at)
       VALUES (?, ?, ?, ?)`,
      [participant.id, assemblyId, participant.name, new Date(participant.registeredAt).toISOString()],
    );

    return { id: participant.id, name: participant.name };
  }

  /** Remove a participant from an Assembly. */
  removeParticipant(assemblyId: string, participantId: string): void {
    const result = this.db.run(
      "DELETE FROM participants WHERE assembly_id = ? AND id = ?",
      [assemblyId, participantId],
    );
    if (result.changes === 0) {
      throw new Error(`Participant "${participantId}" not found in assembly "${assemblyId}"`);
    }
    // Invalidate engine cache since participant state changed
    this.engines.delete(assemblyId);
  }

  /** List participants in an Assembly. */
  listParticipants(assemblyId: string): Array<{ id: string; name: string; registeredAt: string }> {
    return this.db.query<ParticipantRow>(
      "SELECT * FROM participants WHERE assembly_id = ? ORDER BY registered_at ASC",
      [assemblyId],
    ).map((r) => ({
      id: r.id,
      name: r.name,
      registeredAt: r.registered_at,
    }));
  }

  /** Persist issue details after creating a voting event. */
  persistIssues(assemblyId: string, issues: readonly Issue[]): void {
    for (const issue of issues) {
      this.db.run(
        `INSERT OR REPLACE INTO issues (id, assembly_id, title, description, topic_ids, voting_event_id, choices)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          issue.id,
          assemblyId,
          issue.title,
          issue.description,
          JSON.stringify(issue.topicIds),
          issue.votingEventId,
          issue.choices ? JSON.stringify(issue.choices) : null,
        ],
      );
    }
  }

  /** Evict a cached engine (e.g., after config changes). */
  evictEngine(assemblyId: string): void {
    this.engines.delete(assemblyId);
  }

  /** Evict all cached engines. */
  evictAll(): void {
    this.engines.clear();
  }
}

export class AssemblyNotFoundError extends Error {
  constructor(public readonly assemblyId: string) {
    super(`Assembly "${assemblyId}" not found`);
    this.name = "AssemblyNotFoundError";
  }
}

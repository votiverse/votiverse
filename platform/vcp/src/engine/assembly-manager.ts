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
  status: string;
  user_id: string | null;
}

interface UserRow {
  id: string;
  name: string;
  email: string | null;
  created_at: string;
}

export interface UserInfo {
  id: string;
  name: string;
  email: string | null;
  createdAt: string;
}

interface TopicRow {
  id: string;
  assembly_id: string;
  name: string;
  parent_id: string | null;
  sort_order: number;
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
  listParticipants(assemblyId: string): Array<{ id: string; name: string; registeredAt: string; status: string }> {
    return this.db.query<ParticipantRow>(
      "SELECT * FROM participants WHERE assembly_id = ? ORDER BY registered_at ASC",
      [assemblyId],
    ).map((r) => ({
      id: r.id,
      name: r.name,
      registeredAt: r.registered_at,
      status: r.status,
    }));
  }

  /** Update a participant's status. */
  updateParticipantStatus(assemblyId: string, participantId: string, status: string): void {
    const result = this.db.run(
      "UPDATE participants SET status = ? WHERE assembly_id = ? AND id = ?",
      [status, assemblyId, participantId],
    );
    if (result.changes === 0) {
      throw new Error(`Participant "${participantId}" not found in assembly "${assemblyId}"`);
    }
    // Invalidate engine cache since participant state changed
    this.engines.delete(assemblyId);
  }

  /** Get a single participant's data from the DB. */
  getParticipant(assemblyId: string, participantId: string): { id: string; name: string; registeredAt: string; status: string } | undefined {
    const row = this.db.queryOne<ParticipantRow>(
      "SELECT * FROM participants WHERE assembly_id = ? AND id = ?",
      [assemblyId, participantId],
    );
    if (!row) return undefined;
    return {
      id: row.id,
      name: row.name,
      registeredAt: row.registered_at,
      status: row.status,
    };
  }

  /**
   * Resolve an ID that may be either a participant ID or a user ID
   * to the assembly-specific participant ID. Returns the input unchanged
   * if it's already a valid participant ID in the assembly.
   */
  resolveId(assemblyId: string, idOrUserId: string): string {
    // Direct participant lookup
    if (this.getParticipant(assemblyId, idOrUserId)) return idOrUserId;
    // Try as user ID
    const resolved = this.resolveParticipant(assemblyId, idOrUserId);
    if (resolved) return resolved.id;
    // Return as-is (callers handle missing participants)
    return idOrUserId;
  }

  // -----------------------------------------------------------------------
  // User identity (cross-assembly)
  // -----------------------------------------------------------------------

  /** Create a user record. */
  createUser(id: string, name: string, email?: string): UserInfo {
    this.db.run(
      "INSERT INTO users (id, name, email, created_at) VALUES (?, ?, ?, ?)",
      [id, name, email ?? null, new Date().toISOString()],
    );
    return { id, name, email: email ?? null, createdAt: new Date().toISOString() };
  }

  /** Get a user by ID. */
  getUser(userId: string): UserInfo | undefined {
    const row = this.db.queryOne<UserRow>("SELECT * FROM users WHERE id = ?", [userId]);
    if (!row) return undefined;
    return { id: row.id, name: row.name, email: row.email, createdAt: row.created_at };
  }

  /** List all users. */
  listUsers(): UserInfo[] {
    return this.db.query<UserRow>("SELECT * FROM users ORDER BY name ASC").map((r) => ({
      id: r.id,
      name: r.name,
      email: r.email,
      createdAt: r.created_at,
    }));
  }

  /** Link a participant to a user. */
  linkParticipantToUser(assemblyId: string, participantId: string, userId: string): void {
    this.db.run(
      "UPDATE participants SET user_id = ? WHERE assembly_id = ? AND id = ?",
      [userId, assemblyId, participantId],
    );
  }

  /** Resolve a user's participant identity in a specific assembly. */
  resolveParticipant(assemblyId: string, userId: string): { id: string; name: string; registeredAt: string; status: string } | undefined {
    const row = this.db.queryOne<ParticipantRow>(
      "SELECT * FROM participants WHERE assembly_id = ? AND user_id = ?",
      [assemblyId, userId],
    );
    if (!row) return undefined;
    return { id: row.id, name: row.name, registeredAt: row.registered_at, status: row.status };
  }

  /** List all assemblies a user belongs to, with their assembly-specific participant IDs. */
  listUserAssemblies(userId: string): Array<{ assemblyId: string; assemblyName: string; participantId: string }> {
    interface JoinRow { assembly_id: string; assembly_name: string; participant_id: string }
    return this.db.query<JoinRow>(
      `SELECT p.assembly_id, a.name as assembly_name, p.id as participant_id
       FROM participants p JOIN assemblies a ON a.id = p.assembly_id
       WHERE p.user_id = ?
       ORDER BY a.name ASC`,
      [userId],
    ).map((r) => ({
      assemblyId: r.assembly_id,
      assemblyName: r.assembly_name,
      participantId: r.participant_id,
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

  /** Create a topic in an assembly's taxonomy. */
  createTopic(assemblyId: string, topic: { id: string; name: string; parentId: string | null; sortOrder?: number }): void {
    this.db.run(
      `INSERT INTO topics (id, assembly_id, name, parent_id, sort_order) VALUES (?, ?, ?, ?, ?)`,
      [topic.id, assemblyId, topic.name, topic.parentId, topic.sortOrder ?? 0],
    );
  }

  /** List all topics for an assembly, ordered for tree rendering. */
  listTopics(assemblyId: string): Array<{ id: string; name: string; parentId: string | null; sortOrder: number }> {
    return this.db.query<TopicRow>(
      "SELECT * FROM topics WHERE assembly_id = ? ORDER BY sort_order ASC, name ASC",
      [assemblyId],
    ).map((r) => ({
      id: r.id,
      name: r.name,
      parentId: r.parent_id,
      sortOrder: r.sort_order,
    }));
  }

  // -----------------------------------------------------------------------
  // Participation records (materialized read-side projection)
  // -----------------------------------------------------------------------

  /** Check whether participation records have been materialized for an issue. */
  hasParticipation(assemblyId: string, issueId: string): boolean {
    const row = this.db.queryOne<{ cnt: number }>(
      "SELECT COUNT(*) as cnt FROM issue_participation WHERE assembly_id = ? AND issue_id = ?",
      [assemblyId, issueId],
    );
    return (row?.cnt ?? 0) > 0;
  }

  /** Materialize participation records for an issue (idempotent — skips if already materialized). */
  async materializeParticipation(assemblyId: string, issueId: string): Promise<void> {
    if (this.hasParticipation(assemblyId, issueId)) return;

    const { engine } = await this.getEngine(assemblyId);
    const records = await engine.voting.participation(issueId as IssueId);
    const computedAt = new Date().toISOString();

    this.db.transaction(() => {
      for (const record of records) {
        this.db.run(
          `INSERT OR IGNORE INTO issue_participation
           (assembly_id, issue_id, participant_id, status, effective_choice, delegate_id, terminal_voter_id, chain, computed_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            assemblyId,
            record.issueId,
            record.participantId,
            record.status,
            record.effectiveChoice !== null ? JSON.stringify(record.effectiveChoice) : null,
            record.delegateId,
            record.terminalVoterId,
            JSON.stringify(record.chain),
            computedAt,
          ],
        );
      }
    });
  }

  /** Query participation records for an issue, optionally filtered by participant. */
  getParticipation(
    assemblyId: string,
    issueId: string,
    participantId?: string,
  ): Array<{
    participantId: string;
    issueId: string;
    status: string;
    effectiveChoice: unknown;
    delegateId: string | null;
    terminalVoterId: string | null;
    chain: string[];
  }> {
    const sql = participantId
      ? "SELECT * FROM issue_participation WHERE assembly_id = ? AND issue_id = ? AND participant_id = ?"
      : "SELECT * FROM issue_participation WHERE assembly_id = ? AND issue_id = ?";
    const params = participantId
      ? [assemblyId, issueId, participantId]
      : [assemblyId, issueId];

    interface ParticipationRow {
      assembly_id: string;
      issue_id: string;
      participant_id: string;
      status: string;
      effective_choice: string | null;
      delegate_id: string | null;
      terminal_voter_id: string | null;
      chain: string;
      computed_at: string;
    }

    return this.db.query<ParticipationRow>(sql, params).map((row) => ({
      participantId: row.participant_id,
      issueId: row.issue_id,
      status: row.status,
      effectiveChoice: row.effective_choice !== null ? JSON.parse(row.effective_choice) : null,
      delegateId: row.delegate_id,
      terminalVoterId: row.terminal_voter_id,
      chain: JSON.parse(row.chain) as string[],
    }));
  }

  /** Query participation records for a participant across all issues in an assembly. */
  getParticipationByParticipant(
    assemblyId: string,
    participantId: string,
  ): Array<{
    participantId: string;
    issueId: string;
    status: string;
    effectiveChoice: unknown;
    delegateId: string | null;
    terminalVoterId: string | null;
    chain: string[];
  }> {
    interface ParticipationRow {
      assembly_id: string;
      issue_id: string;
      participant_id: string;
      status: string;
      effective_choice: string | null;
      delegate_id: string | null;
      terminal_voter_id: string | null;
      chain: string;
      computed_at: string;
    }

    return this.db.query<ParticipationRow>(
      "SELECT * FROM issue_participation WHERE assembly_id = ? AND participant_id = ?",
      [assemblyId, participantId],
    ).map((row) => ({
      participantId: row.participant_id,
      issueId: row.issue_id,
      status: row.status,
      effectiveChoice: row.effective_choice !== null ? JSON.parse(row.effective_choice) : null,
      delegateId: row.delegate_id,
      terminalVoterId: row.terminal_voter_id,
      chain: JSON.parse(row.chain) as string[],
    }));
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

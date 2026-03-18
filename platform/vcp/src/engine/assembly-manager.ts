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
import { isOk, systemTime } from "@votiverse/core";
import type { TimeProvider } from "@votiverse/core";
import type { DatabaseAdapter } from "../adapters/database/interface.js";
import type { QueueAdapter } from "../adapters/queue/interface.js";
import { SQLiteEventStore } from "./sqlite-event-store.js";

/** Parse a value that may be a JSON string (SQLite) or already-parsed object (PostgreSQL JSONB). */
function parseJson<T>(value: string | T): T {
  return typeof value === "string" ? JSON.parse(value) as T : value;
}

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

  /** Injectable time source. Shared with engine instances. */
  timeProvider: TimeProvider = systemTime;

  constructor(
    private readonly db: DatabaseAdapter,
    private readonly queue: QueueAdapter,
  ) {}

  /** Access the underlying database adapter (for direct queries in routes). */
  getDatabase(): DatabaseAdapter {
    return this.db;
  }

  /** Register a new Assembly. */
  async createAssembly(id: string, params: CreateAssemblyParams): Promise<AssemblyInfo> {
    await this.db.run(
      `INSERT INTO assemblies (id, organization_id, name, config, created_at, status)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id, params.organizationId ?? null, params.name, JSON.stringify(params.config), new Date().toISOString(), "active"],
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
  async listAssemblies(): Promise<AssemblyInfo[]> {
    const rows = await this.db.query<AssemblyRecord>(
      "SELECT * FROM assemblies ORDER BY created_at DESC",
    );
    return rows.map((row) => ({
      id: row.id,
      organizationId: row.organization_id,
      name: row.name,
      config: parseJson<GovernanceConfig>(row.config),
      status: row.status,
      createdAt: row.created_at,
    }));
  }

  /** Get Assembly info without instantiating the engine. */
  async getAssemblyInfo(assemblyId: string): Promise<AssemblyInfo | undefined> {
    const row = await this.db.queryOne<AssemblyRecord>(
      "SELECT * FROM assemblies WHERE id = ?",
      [assemblyId],
    );
    if (!row) return undefined;
    return {
      id: row.id,
      organizationId: row.organization_id,
      name: row.name,
      config: parseJson<GovernanceConfig>(row.config),
      status: row.status,
      createdAt: row.created_at,
    };
  }

  /** Get or create a cached engine instance for an Assembly. */
  async getEngine(assemblyId: string): Promise<{ engine: VotiverseEngine; provider: InvitationProvider; store: SQLiteEventStore }> {
    const cached = this.engines.get(assemblyId);
    if (cached) return cached;

    const info = await this.getAssemblyInfo(assemblyId);
    if (!info) {
      throw new AssemblyNotFoundError(assemblyId);
    }

    const store = new SQLiteEventStore(this.db, assemblyId);
    const provider = new InvitationProvider(store);
    const engine = createEngine({
      config: info.config,
      eventStore: store,
      identityProvider: provider,
      timeProvider: this.timeProvider,
    });

    // Rehydrate from persisted events
    await provider.rehydrate();
    await engine.rehydrate();

    // Inject persisted issue details
    const issueRows = await this.db.query<IssueRow>(
      "SELECT * FROM issues WHERE assembly_id = ?",
      [assemblyId],
    );
    for (const row of issueRows) {
      engine.injectIssue({
        id: row.id as IssueId,
        title: row.title,
        description: row.description,
        topicIds: parseJson<TopicId[]>(row.topic_ids),
        votingEventId: row.voting_event_id as VotingEventId,
        ...(row.choices ? { choices: parseJson<string[]>(row.choices!) } : {}),
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
    await this.db.run(
      `INSERT INTO participants (id, assembly_id, name, registered_at)
       VALUES (?, ?, ?, ?) ON CONFLICT DO NOTHING`,
      [participant.id, assemblyId, participant.name, new Date(participant.registeredAt).toISOString()],
    );
    return { id: participant.id, name: participant.name };
  }

  /** Remove a participant from an Assembly. */
  async removeParticipant(assemblyId: string, participantId: string): Promise<void> {
    const result = await this.db.run(
      "DELETE FROM participants WHERE assembly_id = ? AND id = ?",
      [assemblyId, participantId],
    );
    if (result.changes === 0) {
      throw new Error(`Participant "${participantId}" not found in assembly "${assemblyId}"`);
    }
    this.engines.delete(assemblyId);
  }

  /** List participants in an Assembly. */
  async listParticipants(assemblyId: string): Promise<Array<{ id: string; name: string; registeredAt: string; status: string }>> {
    const rows = await this.db.query<ParticipantRow>(
      "SELECT * FROM participants WHERE assembly_id = ? ORDER BY registered_at ASC",
      [assemblyId],
    );
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      registeredAt: r.registered_at,
      status: r.status,
    }));
  }

  /** Update a participant's status. */
  async updateParticipantStatus(assemblyId: string, participantId: string, status: string): Promise<void> {
    const result = await this.db.run(
      "UPDATE participants SET status = ? WHERE assembly_id = ? AND id = ?",
      [status, assemblyId, participantId],
    );
    if (result.changes === 0) {
      throw new Error(`Participant "${participantId}" not found in assembly "${assemblyId}"`);
    }
    this.engines.delete(assemblyId);
  }

  /** Get a single participant's data from the DB. */
  async getParticipant(assemblyId: string, participantId: string): Promise<{ id: string; name: string; registeredAt: string; status: string } | undefined> {
    const row = await this.db.queryOne<ParticipantRow>(
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

  /** Persist issue details after creating a voting event. */
  async persistIssues(assemblyId: string, issues: readonly Issue[]): Promise<void> {
    for (const issue of issues) {
      await this.db.run(
        `INSERT INTO issues (id, assembly_id, title, description, topic_ids, voting_event_id, choices)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (assembly_id, id) DO UPDATE SET
           title = excluded.title, description = excluded.description,
           topic_ids = excluded.topic_ids, voting_event_id = excluded.voting_event_id,
           choices = excluded.choices`,
        [
          issue.id, assemblyId, issue.title, issue.description,
          JSON.stringify(issue.topicIds), issue.votingEventId,
          issue.choices ? JSON.stringify(issue.choices) : null,
        ],
      );
    }
  }

  /** Create a topic in an assembly's taxonomy. */
  async createTopic(assemblyId: string, topic: { id: string; name: string; parentId: string | null; sortOrder?: number }): Promise<void> {
    await this.db.run(
      `INSERT INTO topics (id, assembly_id, name, parent_id, sort_order) VALUES (?, ?, ?, ?, ?)`,
      [topic.id, assemblyId, topic.name, topic.parentId, topic.sortOrder ?? 0],
    );
  }

  /** List all topics for an assembly, ordered for tree rendering. */
  async listTopics(assemblyId: string): Promise<Array<{ id: string; name: string; parentId: string | null; sortOrder: number }>> {
    const rows = await this.db.query<TopicRow>(
      "SELECT * FROM topics WHERE assembly_id = ? ORDER BY sort_order ASC, name ASC",
      [assemblyId],
    );
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      parentId: r.parent_id,
      sortOrder: r.sort_order,
    }));
  }

  // -----------------------------------------------------------------------
  // Assembly roles (materialized from events)
  // -----------------------------------------------------------------------

  /** Grant a role to a participant, recording both the event and the materialized row. */
  async grantRole(
    assemblyId: string,
    participantId: string,
    role: "owner" | "admin",
    grantedBy: string,
  ): Promise<void> {
    const now = this.timeProvider.now();
    // If granting owner, ensure they're also admin
    if (role === "owner") {
      await this.db.run(
        `INSERT INTO assembly_roles (assembly_id, participant_id, role, granted_by, granted_at)
         VALUES (?, ?, 'admin', ?, ?)
         ON CONFLICT (assembly_id, participant_id, role) DO NOTHING`,
        [assemblyId, participantId, grantedBy, now],
      );
    }
    await this.db.run(
      `INSERT INTO assembly_roles (assembly_id, participant_id, role, granted_by, granted_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (assembly_id, participant_id, role) DO NOTHING`,
      [assemblyId, participantId, role, grantedBy, now],
    );
    // Record the event
    const { engine } = await this.getEngine(assemblyId);
    const store = this.engines.get(assemblyId)!.store;
    const { createEvent } = await import("@votiverse/core");
    const { randomUUID } = await import("node:crypto");
    const event = createEvent("RoleGranted", {
      participantId,
      role,
      grantedBy,
    }, randomUUID() as import("@votiverse/core").EventId, now as import("@votiverse/core").Timestamp);
    await store.append(event);
  }

  /** Revoke a role from a participant. Enforces invariants. */
  async revokeRole(
    assemblyId: string,
    participantId: string,
    role: "owner" | "admin",
    revokedBy: string,
  ): Promise<void> {
    // Cannot remove admin from an owner — must revoke ownership first
    if (role === "admin") {
      const ownerRow = await this.db.queryOne<{ role: string }>(
        `SELECT role FROM assembly_roles WHERE assembly_id = ? AND participant_id = ? AND role = 'owner'`,
        [assemblyId, participantId],
      );
      if (ownerRow) {
        throw new RoleInvariantError("Cannot remove admin role from an owner. Revoke ownership first.");
      }
    }
    // Cannot revoke last owner
    if (role === "owner") {
      const ownerCount = await this.db.queryOne<{ cnt: number }>(
        `SELECT COUNT(*) as cnt FROM assembly_roles WHERE assembly_id = ? AND role = 'owner'`,
        [assemblyId],
      );
      if ((ownerCount?.cnt ?? 0) <= 1) {
        throw new RoleInvariantError("Cannot revoke the last owner. Promote another admin to owner first, or delete the assembly.");
      }
    }
    await this.db.run(
      `DELETE FROM assembly_roles WHERE assembly_id = ? AND participant_id = ? AND role = ?`,
      [assemblyId, participantId, role],
    );
    // Record the event
    const store = this.engines.get(assemblyId)?.store ?? (() => { throw new Error("Engine not loaded"); })();
    const { createEvent } = await import("@votiverse/core");
    const { randomUUID } = await import("node:crypto");
    const now = this.timeProvider.now();
    const event = createEvent("RoleRevoked", {
      participantId,
      role,
      revokedBy,
    }, randomUUID() as import("@votiverse/core").EventId, now as import("@votiverse/core").Timestamp);
    await store.append(event);
  }

  /** List all roles for an assembly. */
  async listRoles(assemblyId: string): Promise<Array<{ participantId: string; role: string; grantedBy: string; grantedAt: number }>> {
    const rows = await this.db.query<{ participant_id: string; role: string; granted_by: string; granted_at: number }>(
      `SELECT participant_id, role, granted_by, granted_at FROM assembly_roles WHERE assembly_id = ? ORDER BY granted_at ASC`,
      [assemblyId],
    );
    return rows.map((r) => ({
      participantId: r.participant_id,
      role: r.role,
      grantedBy: r.granted_by,
      grantedAt: r.granted_at,
    }));
  }

  /** Check if a participant has a specific role in an assembly. */
  async hasRole(assemblyId: string, participantId: string, role: "owner" | "admin"): Promise<boolean> {
    const row = await this.db.queryOne<{ role: string }>(
      `SELECT role FROM assembly_roles WHERE assembly_id = ? AND participant_id = ? AND role = ?`,
      [assemblyId, participantId, role],
    );
    return !!row;
  }

  /** Check if a participant is an admin (owner is always admin). */
  async isAdmin(assemblyId: string, participantId: string): Promise<boolean> {
    const row = await this.db.queryOne<{ role: string }>(
      `SELECT role FROM assembly_roles WHERE assembly_id = ? AND participant_id = ? AND role = 'admin'`,
      [assemblyId, participantId],
    );
    return !!row;
  }

  // -----------------------------------------------------------------------
  // Participation records (materialized read-side projection)
  // -----------------------------------------------------------------------

  /** Check whether participation records have been materialized for an issue. */
  async hasParticipation(assemblyId: string, issueId: string): Promise<boolean> {
    const row = await this.db.queryOne<{ cnt: number }>(
      "SELECT COUNT(*) as cnt FROM issue_participation WHERE assembly_id = ? AND issue_id = ?",
      [assemblyId, issueId],
    );
    return (row?.cnt ?? 0) > 0;
  }

  /** Materialize participation records for an issue (idempotent — skips if already materialized). */
  async materializeParticipation(assemblyId: string, issueId: string): Promise<void> {
    if (await this.hasParticipation(assemblyId, issueId)) return;

    const { engine } = await this.getEngine(assemblyId);
    const records = await engine.voting.participation(issueId as IssueId);
    const computedAt = new Date().toISOString();

    await this.db.transaction(async () => {
      for (const record of records) {
        await this.db.run(
          `INSERT INTO issue_participation
           (assembly_id, issue_id, participant_id, status, effective_choice, delegate_id, terminal_voter_id, chain, computed_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING`,
          [
            assemblyId, record.issueId, record.participantId, record.status,
            record.effectiveChoice !== null ? JSON.stringify(record.effectiveChoice) : null,
            record.delegateId, record.terminalVoterId,
            JSON.stringify(record.chain), computedAt,
          ],
        );
      }
    });
  }

  /** Query participation records for an issue, optionally filtered by participant. */
  async getParticipation(
    assemblyId: string,
    issueId: string,
    participantId?: string,
  ): Promise<Array<{
    participantId: string; issueId: string; status: string;
    effectiveChoice: unknown; delegateId: string | null;
    terminalVoterId: string | null; chain: string[];
  }>> {
    const sql = participantId
      ? "SELECT * FROM issue_participation WHERE assembly_id = ? AND issue_id = ? AND participant_id = ?"
      : "SELECT * FROM issue_participation WHERE assembly_id = ? AND issue_id = ?";
    const params = participantId
      ? [assemblyId, issueId, participantId]
      : [assemblyId, issueId];

    interface ParticipationRow {
      assembly_id: string; issue_id: string; participant_id: string;
      status: string; effective_choice: string | null;
      delegate_id: string | null; terminal_voter_id: string | null;
      chain: string; computed_at: string;
    }

    const rows = await this.db.query<ParticipationRow>(sql, params);
    return rows.map((row) => ({
      participantId: row.participant_id,
      issueId: row.issue_id,
      status: row.status,
      effectiveChoice: row.effective_choice !== null ? parseJson(row.effective_choice) : null,
      delegateId: row.delegate_id,
      terminalVoterId: row.terminal_voter_id,
      chain: parseJson<string[]>(row.chain),
    }));
  }

  /** Query participation records for a participant across all issues in an assembly. */
  async getParticipationByParticipant(
    assemblyId: string,
    participantId: string,
  ): Promise<Array<{
    participantId: string; issueId: string; status: string;
    effectiveChoice: unknown; delegateId: string | null;
    terminalVoterId: string | null; chain: string[];
  }>> {
    interface ParticipationRow {
      assembly_id: string; issue_id: string; participant_id: string;
      status: string; effective_choice: string | null;
      delegate_id: string | null; terminal_voter_id: string | null;
      chain: string; computed_at: string;
    }

    const rows = await this.db.query<ParticipationRow>(
      "SELECT * FROM issue_participation WHERE assembly_id = ? AND participant_id = ?",
      [assemblyId, participantId],
    );
    return rows.map((row) => ({
      participantId: row.participant_id,
      issueId: row.issue_id,
      status: row.status,
      effectiveChoice: row.effective_choice !== null ? parseJson(row.effective_choice) : null,
      delegateId: row.delegate_id,
      terminalVoterId: row.terminal_voter_id,
      chain: parseJson<string[]>(row.chain),
    }));
  }

  // -----------------------------------------------------------------------
  // Materialization — tallies, weights, concentration for closed events
  // -----------------------------------------------------------------------

  /** Check if a tally is already materialized. */
  async hasTally(assemblyId: string, issueId: string): Promise<boolean> {
    const row = await this.db.queryOne(
      "SELECT 1 FROM issue_tallies WHERE assembly_id = ? AND issue_id = ?",
      [assemblyId, issueId],
    );
    return row !== undefined;
  }

  /** Read a materialized tally. Returns null if not yet materialized. */
  async getTally(assemblyId: string, issueId: string): Promise<{
    issueId: string; winner: string | null; counts: Record<string, number>;
    totalVotes: number; quorumMet: boolean; quorumThreshold: number;
    eligibleCount: number; participatingCount: number;
  } | null> {
    interface TallyRow {
      issue_id: string; winner: string | null; counts: string;
      total_votes: number; quorum_met: number; quorum_threshold: number;
      eligible_count: number; participating_count: number;
    }
    const row = await this.db.queryOne<TallyRow>(
      "SELECT * FROM issue_tallies WHERE assembly_id = ? AND issue_id = ?",
      [assemblyId, issueId],
    );
    if (!row) return null;
    return {
      issueId: row.issue_id,
      winner: row.winner,
      counts: parseJson<Record<string, number>>(row.counts),
      totalVotes: row.total_votes,
      quorumMet: row.quorum_met === 1,
      quorumThreshold: row.quorum_threshold,
      eligibleCount: row.eligible_count,
      participatingCount: row.participating_count,
    };
  }

  /** Materialize a tally for a closed issue (idempotent). */
  async materializeTally(assemblyId: string, issueId: string): Promise<void> {
    if (await this.hasTally(assemblyId, issueId)) return;
    const { engine } = await this.getEngine(assemblyId);
    const tally = await engine.voting.tally(issueId as IssueId);
    await this.db.run(
      `INSERT INTO issue_tallies
       (assembly_id, issue_id, winner, counts, total_votes, quorum_met, quorum_threshold, eligible_count, participating_count, computed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING`,
      [
        assemblyId, issueId, tally.winner,
        JSON.stringify(Object.fromEntries(tally.counts)),
        tally.totalVotes, tally.quorumMet ? 1 : 0, tally.quorumThreshold,
        tally.eligibleCount, tally.participatingCount,
        new Date().toISOString(),
      ],
    );
  }

  /** Read materialized weights. Returns null if not yet materialized. */
  async getWeights(assemblyId: string, issueId: string): Promise<{
    issueId: string; weights: Record<string, number>; totalWeight: number;
  } | null> {
    interface WeightRow { issue_id: string; weights: string; total_weight: number }
    const row = await this.db.queryOne<WeightRow>(
      "SELECT * FROM issue_weights WHERE assembly_id = ? AND issue_id = ?",
      [assemblyId, issueId],
    );
    if (!row) return null;
    return {
      issueId: row.issue_id,
      weights: parseJson<Record<string, number>>(row.weights),
      totalWeight: row.total_weight,
    };
  }

  /** Materialize delegation weights for a closed issue (idempotent). */
  async materializeWeights(assemblyId: string, issueId: string): Promise<void> {
    const existing = await this.db.queryOne(
      "SELECT 1 FROM issue_weights WHERE assembly_id = ? AND issue_id = ?",
      [assemblyId, issueId],
    );
    if (existing) return;
    const { engine } = await this.getEngine(assemblyId);
    const weights = await engine.delegation.weights(issueId as IssueId);
    await this.db.run(
      `INSERT INTO issue_weights
       (assembly_id, issue_id, weights, total_weight, computed_at)
       VALUES (?, ?, ?, ?, ?) ON CONFLICT DO NOTHING`,
      [
        assemblyId, issueId,
        JSON.stringify(Object.fromEntries(weights.weights)),
        weights.totalWeight,
        new Date().toISOString(),
      ],
    );
  }

  /** Read materialized concentration metrics. Returns null if not yet materialized. */
  async getConcentration(assemblyId: string, issueId: string): Promise<{
    issueId: string; giniCoefficient: number; maxWeight: number;
    maxWeightHolder: string | null; chainLengthDistribution: Record<number, number>;
    delegatingCount: number; directVoterCount: number;
  } | null> {
    interface ConcRow {
      issue_id: string; gini_coefficient: number; max_weight: number;
      max_weight_holder: string | null; chain_length_distribution: string;
      delegating_count: number; direct_voter_count: number;
    }
    const row = await this.db.queryOne<ConcRow>(
      "SELECT * FROM issue_concentration WHERE assembly_id = ? AND issue_id = ?",
      [assemblyId, issueId],
    );
    if (!row) return null;
    return {
      issueId: row.issue_id,
      giniCoefficient: row.gini_coefficient,
      maxWeight: row.max_weight,
      maxWeightHolder: row.max_weight_holder,
      chainLengthDistribution: parseJson<Record<number, number>>(row.chain_length_distribution),
      delegatingCount: row.delegating_count,
      directVoterCount: row.direct_voter_count,
    };
  }

  /** Materialize concentration metrics for a closed issue (idempotent). */
  async materializeConcentration(assemblyId: string, issueId: string): Promise<void> {
    const existing = await this.db.queryOne(
      "SELECT 1 FROM issue_concentration WHERE assembly_id = ? AND issue_id = ?",
      [assemblyId, issueId],
    );
    if (existing) return;
    const { engine } = await this.getEngine(assemblyId);
    const metrics = await engine.delegation.concentration(issueId as IssueId);
    await this.db.run(
      `INSERT INTO issue_concentration
       (assembly_id, issue_id, gini_coefficient, max_weight, max_weight_holder, chain_length_distribution, delegating_count, direct_voter_count, computed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING`,
      [
        assemblyId, issueId,
        metrics.giniCoefficient, metrics.maxWeight, metrics.maxWeightHolder,
        JSON.stringify(Object.fromEntries(metrics.chainLengthDistribution)),
        metrics.delegatingCount, metrics.directVoterCount,
        new Date().toISOString(),
      ],
    );
  }

  /** Materialize all computed data for a closed event. */
  async materializeClosedEvent(assemblyId: string, eventId: string): Promise<void> {
    const { engine } = await this.getEngine(assemblyId);
    const votingEvent = engine.events.get(eventId as VotingEventId);
    if (!votingEvent) return;
    for (const issueId of votingEvent.issueIds) {
      await this.materializeTally(assemblyId, issueId);
      await this.materializeWeights(assemblyId, issueId);
      await this.materializeConcentration(assemblyId, issueId);
      await this.materializeParticipation(assemblyId, issueId);
    }
  }

  /** Evict a cached engine. */
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

export class RoleInvariantError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RoleInvariantError";
  }
}

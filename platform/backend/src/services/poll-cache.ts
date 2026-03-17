/**
 * PollCacheService — local cache of poll metadata and response tracking.
 *
 * Poll metadata (title, questions, schedule, closesAt) is immutable after creation.
 * hasResponded is a one-way latch: once a participant responds, it never reverts.
 * Both are safe to cache indefinitely.
 */

import type { DatabaseAdapter } from "../adapters/database/interface.js";

export interface CachedPoll {
  id: string;
  assemblyId: string;
  title: string;
  questions: unknown[];
  topicIds: string[];
  schedule: number;
  closesAt: number;
  createdBy: string;
}

interface PollRow {
  id: string;
  assembly_id: string;
  title: string;
  questions: string;
  topic_ids: string;
  schedule: number;
  closes_at: number;
  created_by: string;
}

function rowToPoll(row: PollRow): CachedPoll {
  return {
    id: row.id,
    assemblyId: row.assembly_id,
    title: row.title,
    questions: typeof row.questions === "string" ? JSON.parse(row.questions) : row.questions,
    topicIds: typeof row.topic_ids === "string" ? JSON.parse(row.topic_ids) : row.topic_ids,
    schedule: row.schedule,
    closesAt: row.closes_at,
    createdBy: row.created_by,
  };
}

export class PollCacheService {
  constructor(private readonly db: DatabaseAdapter) {}

  /** Insert or replace a poll in the cache. */
  async upsert(poll: CachedPoll): Promise<void> {
    await this.db.run(
      `INSERT INTO polls_cache (id, assembly_id, title, questions, topic_ids, schedule, closes_at, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (assembly_id, id) DO UPDATE SET
         title = excluded.title,
         questions = excluded.questions,
         topic_ids = excluded.topic_ids,
         schedule = excluded.schedule,
         closes_at = excluded.closes_at,
         created_by = excluded.created_by`,
      [
        poll.id,
        poll.assemblyId,
        poll.title,
        JSON.stringify(poll.questions),
        JSON.stringify(poll.topicIds),
        poll.schedule,
        poll.closesAt,
        poll.createdBy,
      ],
    );
  }

  /** Get all cached polls for an assembly. */
  async listByAssembly(assemblyId: string): Promise<CachedPoll[]> {
    const rows = await this.db.query<PollRow>(
      "SELECT id, assembly_id, title, questions, topic_ids, schedule, closes_at, created_by FROM polls_cache WHERE assembly_id = ?",
      [assemblyId],
    );
    return rows.map(rowToPoll);
  }

  /** Check if an assembly has any cached polls. */
  async hasPolls(assemblyId: string): Promise<boolean> {
    const row = await this.db.queryOne<{ count: number }>(
      "SELECT COUNT(*) as count FROM polls_cache WHERE assembly_id = ?",
      [assemblyId],
    );
    return (row?.count ?? 0) > 0;
  }

  /** Record that a participant has responded to a poll. */
  async recordResponse(assemblyId: string, pollId: string, participantId: string): Promise<void> {
    await this.db.run(
      `INSERT INTO poll_responses (assembly_id, poll_id, participant_id)
       VALUES (?, ?, ?)
       ON CONFLICT (assembly_id, poll_id, participant_id) DO NOTHING`,
      [assemblyId, pollId, participantId],
    );
  }

  /** Check if a participant has responded to a poll. */
  async hasResponded(assemblyId: string, pollId: string, participantId: string): Promise<boolean> {
    const row = await this.db.queryOne<{ count: number }>(
      "SELECT COUNT(*) as count FROM poll_responses WHERE assembly_id = ? AND poll_id = ? AND participant_id = ?",
      [assemblyId, pollId, participantId],
    );
    return (row?.count ?? 0) > 0;
  }

  /** Batch check hasResponded for all polls in an assembly for a participant. */
  async respondedPollIds(assemblyId: string, participantId: string): Promise<Set<string>> {
    const rows = await this.db.query<{ poll_id: string }>(
      "SELECT poll_id FROM poll_responses WHERE assembly_id = ? AND participant_id = ?",
      [assemblyId, participantId],
    );
    return new Set(rows.map((r) => r.poll_id));
  }
}

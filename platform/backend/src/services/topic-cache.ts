/**
 * TopicCacheService — local cache of topic data to avoid VCP round-trips.
 *
 * Topics are immutable after creation, so the cache never goes stale.
 */

import type { DatabaseAdapter } from "../adapters/database/interface.js";

export interface CachedTopic {
  id: string;
  assemblyId: string;
  name: string;
  parentId: string | null;
  sortOrder: number;
}

interface TopicRow {
  id: string;
  assembly_id: string;
  name: string;
  parent_id: string | null;
  sort_order: number;
}

function rowToTopic(row: TopicRow): CachedTopic {
  return {
    id: row.id,
    assemblyId: row.assembly_id,
    name: row.name,
    parentId: row.parent_id,
    sortOrder: row.sort_order,
  };
}

export class TopicCacheService {
  constructor(private readonly db: DatabaseAdapter) {}

  /** Insert or replace a topic in the cache. */
  async upsert(topic: CachedTopic): Promise<void> {
    await this.db.run(
      `INSERT INTO topics_cache (id, assembly_id, name, parent_id, sort_order)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (assembly_id, id) DO UPDATE SET
         name = excluded.name,
         parent_id = excluded.parent_id,
         sort_order = excluded.sort_order`,
      [topic.id, topic.assemblyId, topic.name, topic.parentId, topic.sortOrder],
    );
  }

  /** Bulk upsert topics for an assembly. */
  async upsertMany(topics: CachedTopic[]): Promise<void> {
    for (const topic of topics) {
      await this.upsert(topic);
    }
  }

  /** Get all topics for an assembly. */
  async listByAssembly(assemblyId: string): Promise<CachedTopic[]> {
    const rows = await this.db.query<TopicRow>(
      "SELECT id, assembly_id, name, parent_id, sort_order FROM topics_cache WHERE assembly_id = ? ORDER BY sort_order ASC, name ASC",
      [assemblyId],
    );
    return rows.map(rowToTopic);
  }

  /** Check if an assembly has any cached topics. */
  async hasTopics(assemblyId: string): Promise<boolean> {
    const row = await this.db.queryOne<{ count: number }>(
      "SELECT COUNT(*) as count FROM topics_cache WHERE assembly_id = ?",
      [assemblyId],
    );
    return (row?.count ?? 0) > 0;
  }
}

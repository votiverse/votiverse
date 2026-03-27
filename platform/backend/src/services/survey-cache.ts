/**
 * SurveyCacheService — local cache of survey metadata and response tracking.
 *
 * Survey metadata (title, questions, schedule, closesAt) is immutable after creation.
 * hasResponded is a one-way latch: once a participant responds, it never reverts.
 * Both are safe to cache indefinitely.
 */

import type { DatabaseAdapter } from "../adapters/database/interface.js";
import { parseJsonColumn } from "../adapters/database/interface.js";

export interface CachedSurvey {
  id: string;
  assemblyId: string;
  title: string;
  questions: unknown[];
  topicIds: string[];
  schedule: number;
  closesAt: number;
  createdBy: string;
}

interface SurveyRow {
  id: string;
  assembly_id: string;
  title: string;
  questions: string;
  topic_ids: string;
  schedule: number;
  closes_at: number;
  created_by: string;
}

function rowToSurvey(row: SurveyRow): CachedSurvey {
  return {
    id: row.id,
    assemblyId: row.assembly_id,
    title: row.title,
    questions: parseJsonColumn<unknown[]>(row.questions),
    topicIds: parseJsonColumn<string[]>(row.topic_ids),
    schedule: row.schedule,
    closesAt: row.closes_at,
    createdBy: row.created_by,
  };
}

export class SurveyCacheService {
  constructor(private readonly db: DatabaseAdapter) {}

  /** Insert or replace a survey in the cache. */
  async upsert(survey: CachedSurvey): Promise<void> {
    await this.db.run(
      `INSERT INTO surveys_cache (id, assembly_id, title, questions, topic_ids, schedule, closes_at, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (assembly_id, id) DO UPDATE SET
         title = excluded.title,
         questions = excluded.questions,
         topic_ids = excluded.topic_ids,
         schedule = excluded.schedule,
         closes_at = excluded.closes_at,
         created_by = excluded.created_by`,
      [
        survey.id,
        survey.assemblyId,
        survey.title,
        JSON.stringify(survey.questions),
        JSON.stringify(survey.topicIds),
        survey.schedule,
        survey.closesAt,
        survey.createdBy,
      ],
    );
  }

  /** Get all cached surveys for an assembly. */
  async listByAssembly(assemblyId: string): Promise<CachedSurvey[]> {
    const rows = await this.db.query<SurveyRow>(
      "SELECT id, assembly_id, title, questions, topic_ids, schedule, closes_at, created_by FROM surveys_cache WHERE assembly_id = ?",
      [assemblyId],
    );
    return rows.map(rowToSurvey);
  }

  /** Check if an assembly has any cached surveys. */
  async hasSurveys(assemblyId: string): Promise<boolean> {
    const row = await this.db.queryOne<{ count: number }>(
      "SELECT COUNT(*) as count FROM surveys_cache WHERE assembly_id = ?",
      [assemblyId],
    );
    return (row?.count ?? 0) > 0;
  }

  /** Record that a participant has responded to a survey. */
  async recordResponse(assemblyId: string, surveyId: string, participantId: string): Promise<void> {
    await this.db.run(
      `INSERT INTO survey_responses (assembly_id, survey_id, participant_id)
       VALUES (?, ?, ?)
       ON CONFLICT (assembly_id, survey_id, participant_id) DO NOTHING`,
      [assemblyId, surveyId, participantId],
    );
  }

  /** Check if a participant has responded to a survey. */
  async hasResponded(assemblyId: string, surveyId: string, participantId: string): Promise<boolean> {
    const row = await this.db.queryOne<{ count: number }>(
      "SELECT COUNT(*) as count FROM survey_responses WHERE assembly_id = ? AND survey_id = ? AND participant_id = ?",
      [assemblyId, surveyId, participantId],
    );
    return (row?.count ?? 0) > 0;
  }

  /** Batch check hasResponded for all surveys in an assembly for a participant. */
  async respondedSurveyIds(assemblyId: string, participantId: string): Promise<Set<string>> {
    const rows = await this.db.query<{ survey_id: string }>(
      "SELECT survey_id FROM survey_responses WHERE assembly_id = ? AND participant_id = ?",
      [assemblyId, participantId],
    );
    return new Set(rows.map((r) => r.survey_id));
  }

  /** Check if we've ever synced hasResponded from VCP for this participant in this assembly. */
  async hasCheckedParticipant(assemblyId: string, participantId: string): Promise<boolean> {
    const row = await this.db.queryOne<{ count: number }>(
      "SELECT COUNT(*) as count FROM survey_response_checks WHERE assembly_id = ? AND participant_id = ?",
      [assemblyId, participantId],
    );
    return (row?.count ?? 0) > 0;
  }

  /** Mark that we've synced hasResponded from VCP for this participant in this assembly. */
  async markParticipantChecked(assemblyId: string, participantId: string): Promise<void> {
    await this.db.run(
      `INSERT INTO survey_response_checks (assembly_id, participant_id)
       VALUES (?, ?)
       ON CONFLICT (assembly_id, participant_id) DO NOTHING`,
      [assemblyId, participantId],
    );
  }
}

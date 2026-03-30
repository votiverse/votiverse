/**
 * Survey routes.
 */

import { Hono } from "hono";
import type { TopicId, SurveyId, ParticipantId } from "@votiverse/core";
import type { CreateSurveyParams, SubmitResponseParams } from "@votiverse/survey";
import type { AssemblyManager } from "../../engine/assembly-manager.js";
import { getParticipantId, requireParticipant, requireScope } from "../middleware/auth.js";
import { parsePagination, paginate } from "../middleware/pagination.js";

export function surveyRoutes(manager: AssemblyManager) {
  const app = new Hono();

  /** GET /assemblies/:id/surveys — list all surveys. Uses authenticated participant for hasResponded. */
  app.get("/assemblies/:id/surveys", async (c) => {
    const assemblyId = c.req.param("id");
    const participantId = getParticipantId(c) as ParticipantId | undefined;

    const { engine } = await manager.getEngine(assemblyId);
    const surveys = await engine.surveys.list();

    const items = await Promise.all(
      surveys.map(async (survey) => {
        const item: Record<string, unknown> = {
          id: survey.id,
          title: survey.title,
          questions: survey.questions,
          topicIds: survey.topicScope,
          schedule: survey.schedule,
          closesAt: survey.closesAt,
          createdBy: survey.createdBy,
        };
        if (participantId) {
          item.hasResponded = await engine.surveys.hasResponded(
            survey.id,
            participantId,
          );
        }
        return item;
      }),
    );

    const { data, pagination } = paginate(items, parsePagination(c));
    return c.json({ surveys: data, pagination });
  });

  /** POST /assemblies/:id/surveys — create survey. */
  app.post("/assemblies/:id/surveys", async (c) => {
    const scopeError = requireScope(c, "operational");
    if (scopeError) return scopeError;

    const assemblyId = c.req.param("id");
    const body = await c.req.json<CreateSurveyParams>();

    const { engine } = await manager.getEngine(assemblyId);
    const survey = await engine.surveys.create(body);

    return c.json({
      id: survey.id,
      title: survey.title,
      questions: survey.questions,
      topicIds: survey.topicScope,
      schedule: survey.schedule,
      closesAt: survey.closesAt,
      createdBy: survey.createdBy,
    }, 201);
  });

  /** POST /assemblies/:id/surveys/:pid/respond — submit response. Sovereignty enforced. */
  app.post(
    "/assemblies/:id/surveys/:pid/respond",
    requireParticipant(manager),
    async (c) => {
      const assemblyId = c.req.param("id");
      const pid = c.req.param("pid");
      const body = await c.req.json<SubmitResponseParams>();
      const authenticatedPid = c.get("participantId") as string;

      const { engine } = await manager.getEngine(assemblyId);
      await engine.surveys.respond({
        ...body,
        surveyId: pid as SurveyId,
        participantId: authenticatedPid as ParticipantId,
      });

      return c.json({ status: "ok" });
    },
  );

  /** GET /assemblies/:id/surveys/:pid/results — survey results. */
  app.get("/assemblies/:id/surveys/:pid/results", async (c) => {
    const assemblyId = c.req.param("id");
    const pid = c.req.param("pid");
    const eligibleCount = parseInt(c.req.query("eligibleCount") ?? "0", 10);

    const { engine } = await manager.getEngine(assemblyId);
    const results = await engine.surveys.results(pid as SurveyId, eligibleCount);

    // Convert Map → plain object for JSON serialization (Maps serialize as {})
    return c.json({
      ...results,
      questionResults: results.questionResults.map((qr) => ({
        ...qr,
        distribution: Object.fromEntries(qr.distribution),
      })),
    });
  });

  /** GET /assemblies/:id/trends/:topic — trend data. */
  app.get("/assemblies/:id/trends/:topic", async (c) => {
    const assemblyId = c.req.param("id");
    const topicId = c.req.param("topic");
    const eligibleCount = parseInt(c.req.query("eligibleCount") ?? "0", 10);

    const { engine } = await manager.getEngine(assemblyId);
    const trends = await engine.surveys.trends(topicId as TopicId, eligibleCount);

    return c.json(trends);
  });

  return app;
}

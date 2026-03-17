/**
 * Polling routes.
 */

import { Hono } from "hono";
import type { TopicId, PollId, ParticipantId } from "@votiverse/core";
import type { CreatePollParams, SubmitResponseParams } from "@votiverse/polling";
import type { AssemblyManager } from "../../engine/assembly-manager.js";
import { requireParticipant, requireScope } from "../middleware/auth.js";
import { parsePagination, paginate } from "../middleware/pagination.js";

export function pollRoutes(manager: AssemblyManager) {
  const app = new Hono();

  /** GET /assemblies/:id/polls — list all polls. Optional ?participantId= to include hasResponded. */
  app.get("/assemblies/:id/polls", async (c) => {
    const assemblyId = c.req.param("id");
    const participantId = c.req.query("participantId") as ParticipantId | undefined;

    const { engine } = await manager.getEngine(assemblyId);
    const polls = await engine.polls.list();

    const items = await Promise.all(
      polls.map(async (poll) => {
        const item: Record<string, unknown> = {
          id: poll.id,
          title: poll.title,
          questions: poll.questions,
          topicIds: poll.topicScope,
          schedule: poll.schedule,
          closesAt: poll.closesAt,
          createdBy: poll.createdBy,
        };
        if (participantId) {
          item.hasResponded = await engine.polls.hasResponded(
            poll.id,
            participantId,
          );
        }
        return item;
      }),
    );

    const { data, pagination } = paginate(items, parsePagination(c));
    return c.json({ polls: data, pagination });
  });

  /** POST /assemblies/:id/polls — create poll. */
  app.post("/assemblies/:id/polls", async (c) => {
    const scopeError = requireScope(c, "operational");
    if (scopeError) return scopeError;

    const assemblyId = c.req.param("id");
    const body = await c.req.json<CreatePollParams>();

    const { engine } = await manager.getEngine(assemblyId);
    const poll = await engine.polls.create(body);

    return c.json({
      id: poll.id,
      title: poll.title,
      questions: poll.questions,
      topicIds: poll.topicScope,
      schedule: poll.schedule,
      closesAt: poll.closesAt,
      createdBy: poll.createdBy,
    }, 201);
  });

  /** POST /assemblies/:id/polls/:pid/respond — submit response. Sovereignty enforced. */
  app.post(
    "/assemblies/:id/polls/:pid/respond",
    requireParticipant(manager),
    async (c) => {
      const assemblyId = c.req.param("id");
      const pid = c.req.param("pid");
      const body = await c.req.json<SubmitResponseParams>();
      const authenticatedPid = c.get("participantId") as string;

      const { engine } = await manager.getEngine(assemblyId);
      await engine.polls.respond({
        ...body,
        pollId: pid as PollId,
        participantId: authenticatedPid as ParticipantId,
      });

      return c.json({ status: "ok" });
    },
  );

  /** GET /assemblies/:id/polls/:pid/results — poll results. */
  app.get("/assemblies/:id/polls/:pid/results", async (c) => {
    const assemblyId = c.req.param("id");
    const pid = c.req.param("pid");
    const eligibleCount = parseInt(c.req.query("eligibleCount") ?? "0", 10);

    const { engine } = await manager.getEngine(assemblyId);
    const results = await engine.polls.results(pid as PollId, eligibleCount);

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
    const trends = await engine.polls.trends(topicId as TopicId, eligibleCount);

    return c.json(trends);
  });

  return app;
}

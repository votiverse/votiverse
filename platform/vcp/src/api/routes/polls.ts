/**
 * Polling routes.
 */

import { Hono } from "hono";
import type { TopicId, PollId } from "@votiverse/core";
import type { CreatePollParams, SubmitResponseParams } from "@votiverse/polling";
import type { AssemblyManager } from "../../engine/assembly-manager.js";

export function pollRoutes(manager: AssemblyManager) {
  const app = new Hono();

  /** GET /assemblies/:id/polls — list all polls. */
  app.get("/assemblies/:id/polls", async (c) => {
    const assemblyId = c.req.param("id");

    const { engine } = await manager.getEngine(assemblyId);
    const polls = await engine.polls.list();

    return c.json({
      polls: polls.map((poll) => ({
        id: poll.id,
        title: poll.title,
        status: poll.status,
        questions: poll.questions,
        topicIds: poll.topicScope,
        schedule: poll.schedule,
        closesAt: poll.closesAt,
        createdBy: poll.createdBy,
      })),
    });
  });

  /** POST /assemblies/:id/polls — create poll. */
  app.post("/assemblies/:id/polls", async (c) => {
    const assemblyId = c.req.param("id");
    const body = await c.req.json<CreatePollParams>();

    const { engine } = await manager.getEngine(assemblyId);
    const poll = await engine.polls.create(body);

    return c.json({
      id: poll.id,
      title: poll.title,
      status: poll.status,
      questions: poll.questions,
      topicIds: poll.topicScope,
      schedule: poll.schedule,
      closesAt: poll.closesAt,
      createdBy: poll.createdBy,
    }, 201);
  });

  /** POST /assemblies/:id/polls/:pid/respond — submit response. */
  app.post("/assemblies/:id/polls/:pid/respond", async (c) => {
    const assemblyId = c.req.param("id");
    const pid = c.req.param("pid");
    const body = await c.req.json<SubmitResponseParams>();

    const { engine } = await manager.getEngine(assemblyId);
    await engine.polls.respond({ ...body, pollId: pid as PollId });

    return c.json({ status: "ok" });
  });

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

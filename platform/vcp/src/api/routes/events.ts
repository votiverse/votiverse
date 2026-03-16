/**
 * Voting event routes.
 */

import { Hono } from "hono";
import type { ParticipantId, TopicId, IssueId } from "@votiverse/core";
import { timestamp } from "@votiverse/core";
import type { AssemblyManager } from "../../engine/assembly-manager.js";

interface CreateEventBody {
  title: string;
  description: string;
  issues: Array<{
    title: string;
    description: string;
    topicIds: string[];
    choices?: string[];
  }>;
  eligibleParticipantIds: string[];
  timeline: {
    deliberationStart: string | number;
    votingStart: string | number;
    votingEnd: string | number;
  };
}

function toTimestamp(value: string | number): ReturnType<typeof timestamp> {
  if (typeof value === "number") return timestamp(value);
  return timestamp(new Date(value).getTime());
}

export function eventRoutes(manager: AssemblyManager) {
  const app = new Hono();

  /** POST /assemblies/:id/events — create voting event. */
  app.post("/assemblies/:id/events", async (c) => {
    const assemblyId = c.req.param("id");
    const body = await c.req.json<CreateEventBody>();

    if (!body.title || !body.issues || !body.timeline) {
      return c.json(
        { error: { code: "VALIDATION_ERROR", message: "title, issues, and timeline are required" } },
        400,
      );
    }

    const { engine } = await manager.getEngine(assemblyId);

    const votingEvent = await engine.events.create({
      title: body.title,
      description: body.description ?? "",
      issues: body.issues.map((i) => ({
        title: i.title,
        description: i.description ?? "",
        topicIds: (i.topicIds ?? []) as TopicId[],
        ...(i.choices ? { choices: i.choices } : {}),
      })),
      eligibleParticipantIds: body.eligibleParticipantIds as ParticipantId[],
      timeline: {
        deliberationStart: toTimestamp(body.timeline.deliberationStart),
        votingStart: toTimestamp(body.timeline.votingStart),
        votingEnd: toTimestamp(body.timeline.votingEnd),
      },
    });

    // Persist issue details
    const issues = votingEvent.issueIds.map((id) => engine.events.getIssue(id as IssueId)!);
    await manager.persistIssues(assemblyId, issues);

    return c.json({
      id: votingEvent.id,
      title: votingEvent.title,
      description: votingEvent.description,
      issueIds: votingEvent.issueIds,
      issues: issues.map((i) => ({
        id: i.id,
        title: i.title,
        description: i.description,
        topicIds: i.topicIds,
        ...(i.choices ? { choices: i.choices } : {}),
      })),
      eligibleParticipantIds: votingEvent.eligibleParticipantIds,
      timeline: {
        deliberationStart: new Date(votingEvent.timeline.deliberationStart).toISOString(),
        votingStart: new Date(votingEvent.timeline.votingStart).toISOString(),
        votingEnd: new Date(votingEvent.timeline.votingEnd).toISOString(),
      },
      createdAt: new Date(votingEvent.createdAt).toISOString(),
    }, 201);
  });

  /** GET /assemblies/:id/events/:eid — get event status. */
  app.get("/assemblies/:id/events/:eid", async (c) => {
    const assemblyId = c.req.param("id");
    const eid = c.req.param("eid");

    const { engine } = await manager.getEngine(assemblyId);
    const votingEvent = engine.events.get(eid as import("@votiverse/core").VotingEventId);

    if (!votingEvent) {
      return c.json(
        { error: { code: "NOT_FOUND", message: `Voting event "${eid}" not found` } },
        404,
      );
    }

    const now = Date.now();
    let status: string;
    if (now < votingEvent.timeline.deliberationStart) {
      status = "upcoming";
    } else if (now < votingEvent.timeline.votingStart) {
      status = "deliberation";
    } else if (now < votingEvent.timeline.votingEnd) {
      status = "voting";
    } else {
      status = "closed";
    }

    const issues = votingEvent.issueIds.map((id) => {
      const issue = engine.events.getIssue(id as IssueId);
      if (!issue) return { id };
      return {
        id: issue.id,
        title: issue.title,
        description: issue.description,
        topicIds: issue.topicIds,
        ...(issue.choices ? { choices: issue.choices } : {}),
      };
    });

    return c.json({
      id: votingEvent.id,
      title: votingEvent.title,
      description: votingEvent.description,
      status,
      issues,
      eligibleParticipantIds: votingEvent.eligibleParticipantIds,
      timeline: {
        deliberationStart: new Date(votingEvent.timeline.deliberationStart).toISOString(),
        votingStart: new Date(votingEvent.timeline.votingStart).toISOString(),
        votingEnd: new Date(votingEvent.timeline.votingEnd).toISOString(),
      },
      createdAt: new Date(votingEvent.createdAt).toISOString(),
    });
  });

  /** GET /assemblies/:id/events — list events. */
  app.get("/assemblies/:id/events", async (c) => {
    const assemblyId = c.req.param("id");
    const { engine } = await manager.getEngine(assemblyId);
    const events = engine.events.list();

    return c.json({
      events: events.map((e) => ({
        id: e.id,
        title: e.title,
        description: e.description,
        issueIds: e.issueIds,
        createdAt: new Date(e.createdAt).toISOString(),
      })),
    });
  });

  return app;
}

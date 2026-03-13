import { describe, it, expect, beforeEach } from "vitest";
import {
  InMemoryEventStore,
} from "@votiverse/core";
import type {
  ParticipantId,
  ProposalId,
  PredictionId,
  Timestamp,
} from "@votiverse/core";
import { getPreset } from "@votiverse/config";
import { PredictionService } from "../../src/prediction-service.js";
import type { PredictionClaim } from "../../src/types.js";

const ts = (n: number) => n as Timestamp;

describe("PredictionService", () => {
  let store: InMemoryEventStore;
  let service: PredictionService;

  beforeEach(() => {
    store = new InMemoryEventStore();
    service = new PredictionService(store, getPreset("LIQUID_ACCOUNTABLE"));
  });

  const claim: PredictionClaim = {
    variable: "youth sports participation",
    baselineValue: 500,
    timeframe: { start: ts(1000), deadline: ts(50000) },
    methodology: "annual survey",
    pattern: { type: "absolute-change", expected: 200 },
  };

  describe("commit()", () => {
    it("creates a prediction with commitment hash", async () => {
      const prediction = await service.commit({
        proposalId: "prop-1" as ProposalId,
        participantId: "p-1" as ParticipantId,
        claim,
      });

      expect(prediction.id).toBeTruthy();
      expect(prediction.commitmentHash).toMatch(/^[0-9a-f]{64}$/);
      expect(prediction.claim).toEqual(claim);
    });

    it("records a PredictionCommitted event", async () => {
      await service.commit({
        proposalId: "prop-1" as ProposalId,
        participantId: "p-1" as ParticipantId,
        claim,
      });

      const events = await store.getAll();
      expect(events).toHaveLength(1);
      expect(events[0]!.type).toBe("PredictionCommitted");
    });

    it("throws when predictions are disabled", async () => {
      const disabled = new PredictionService(store, getPreset("TOWN_HALL"));
      await expect(
        disabled.commit({
          proposalId: "prop-1" as ProposalId,
          participantId: "p-1" as ParticipantId,
          claim,
        }),
      ).rejects.toThrow("disabled");
    });

    it("validates claim has non-empty variable", async () => {
      await expect(
        service.commit({
          proposalId: "prop-1" as ProposalId,
          participantId: "p-1" as ParticipantId,
          claim: { ...claim, variable: "" },
        }),
      ).rejects.toThrow("variable");
    });

    it("validates timeframe", async () => {
      await expect(
        service.commit({
          proposalId: "prop-1" as ProposalId,
          participantId: "p-1" as ParticipantId,
          claim: {
            ...claim,
            timeframe: { start: ts(50000), deadline: ts(1000) },
          },
        }),
      ).rejects.toThrow("Deadline");
    });
  });

  describe("recordOutcome()", () => {
    it("records an outcome for a prediction", async () => {
      const prediction = await service.commit({
        proposalId: "prop-1" as ProposalId,
        participantId: "p-1" as ParticipantId,
        claim,
      });

      const outcome = await service.recordOutcome({
        predictionId: prediction.id,
        source: { type: "official", provider: "stats bureau" },
        measuredValue: 680,
        notes: "Annual survey results",
      });

      expect(outcome.measuredValue).toBe(680);
      expect(outcome.source.type).toBe("official");
    });

    it("throws for non-existent prediction", async () => {
      await expect(
        service.recordOutcome({
          predictionId: "nonexistent" as PredictionId,
          source: { type: "official", provider: "test" },
          measuredValue: 100,
        }),
      ).rejects.toThrow("not found");
    });

    it("allows multiple outcomes for the same prediction", async () => {
      const prediction = await service.commit({
        proposalId: "prop-1" as ProposalId,
        participantId: "p-1" as ParticipantId,
        claim,
      });

      await service.recordOutcome({
        predictionId: prediction.id,
        source: { type: "official", provider: "test" },
        measuredValue: 600,
      });
      await service.recordOutcome({
        predictionId: prediction.id,
        source: { type: "official", provider: "test" },
        measuredValue: 680,
      });

      const outcomes = await service.getOutcomes(prediction.id);
      expect(outcomes).toHaveLength(2);
    });
  });

  describe("evaluateFromTrend()", () => {
    it("creates an outcome record from trend data", async () => {
      const prediction = await service.commit({
        proposalId: "prop-1" as ProposalId,
        participantId: "p-1" as ParticipantId,
        claim,
      });

      const outcome = await service.evaluateFromTrend(
        prediction.id,
        0.75, // positive trend
        "poll-123",
        "Derived from Q3 education poll",
      );

      expect(outcome.source.type).toBe("poll-derived");
      expect(outcome.notes).toBe("Derived from Q3 education poll");
    });

    it("maps positive trend to positive outcome for absolute-change", async () => {
      const prediction = await service.commit({
        proposalId: "prop-1" as ProposalId,
        participantId: "p-1" as ParticipantId,
        claim: {
          ...claim,
          baselineValue: 500,
          pattern: { type: "absolute-change", expected: 200 },
        },
      });

      const outcome = await service.evaluateFromTrend(
        prediction.id,
        1.0, // maximum positive trend
        "poll-1",
      );

      // trend 1.0 → baseline + expected * 1.0 = 500 + 200 = 700
      expect(outcome.measuredValue).toBe(700);
    });

    it("throws for non-existent prediction", async () => {
      await expect(
        service.evaluateFromTrend(
          "nonexistent" as PredictionId,
          0.5,
          "poll-1",
        ),
      ).rejects.toThrow("not found");
    });
  });

  describe("evaluate()", () => {
    it("evaluates a prediction with outcomes", async () => {
      const prediction = await service.commit({
        proposalId: "prop-1" as ProposalId,
        participantId: "p-1" as ParticipantId,
        claim: {
          ...claim,
          timeframe: { start: ts(1000), deadline: ts(2000) },
        },
      });

      await service.recordOutcome({
        predictionId: prediction.id,
        source: { type: "official", provider: "test" },
        measuredValue: 700,
      });

      const evaluation = await service.evaluate(prediction.id);
      expect(evaluation.accuracy).toBeCloseTo(1.0);
      expect(evaluation.status).toBe("met");
    });
  });

  describe("trackRecord()", () => {
    it("computes track record for a participant", async () => {
      const participantId = "p-1" as ParticipantId;

      // Commit two predictions with past deadlines
      const p1 = await service.commit({
        proposalId: "prop-1" as ProposalId,
        participantId,
        claim: {
          ...claim,
          timeframe: { start: ts(1000), deadline: ts(2000) },
        },
      });

      const p2 = await service.commit({
        proposalId: "prop-2" as ProposalId,
        participantId,
        claim: {
          ...claim,
          variable: "costs",
          timeframe: { start: ts(1000), deadline: ts(2000) },
          pattern: { type: "binary", expectedOutcome: true },
        },
      });

      // Record outcomes
      await service.recordOutcome({
        predictionId: p1.id,
        source: { type: "official", provider: "test" },
        measuredValue: 700, // perfectly met (+200)
      });
      await service.recordOutcome({
        predictionId: p2.id,
        source: { type: "official", provider: "test" },
        measuredValue: false, // not met
      });

      const record = await service.trackRecord(participantId);
      expect(record.totalPredictions).toBe(2);
      expect(record.evaluatedPredictions).toBe(2);
      expect(record.averageAccuracy).toBeCloseTo(0.5); // (1.0 + 0.0) / 2
    });
  });

  describe("getPrediction()", () => {
    it("retrieves a committed prediction", async () => {
      const committed = await service.commit({
        proposalId: "prop-1" as ProposalId,
        participantId: "p-1" as ParticipantId,
        claim,
      });

      const retrieved = await service.getPrediction(committed.id);
      expect(retrieved).toBeDefined();
      expect(retrieved!.commitmentHash).toBe(committed.commitmentHash);
    });

    it("returns undefined for non-existent ID", async () => {
      const result = await service.getPrediction("nope" as PredictionId);
      expect(result).toBeUndefined();
    });
  });
});

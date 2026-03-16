/**
 * API client — all requests go through the client backend.
 *
 * The backend handles VCP communication, participant identity resolution,
 * and API key management. The client just sends the user's access token.
 */

import type {
  Assembly,
  Participant,
  VotingEvent,
  Topic,
  Delegation,
  DelegationChain,
  MyWeight,
  Tally,
  WeightDist,
  ConcentrationMetrics,
  VotingHistory,
  ParticipationRecord,
  DelegateProfile,
  Poll,
  PollResults,
} from "./types.js";
import { getAccessToken, refreshSession } from "./auth.js";

const BASE_URL = import.meta.env.VITE_API_BASE_URL || "/api";

class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  const token = getAccessToken();
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const init: RequestInit = { method, headers };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
  }

  let res = await fetch(`${BASE_URL}${path}`, init);

  // Auto-refresh on 401
  if (res.status === 401 && token) {
    const newToken = await refreshSession();
    if (newToken) {
      headers["Authorization"] = `Bearer ${newToken}`;
      res = await fetch(`${BASE_URL}${path}`, { method, headers, body: init.body });
    }
  }

  if (res.status === 204) return undefined as T;

  if (!res.ok) {
    let code = "UNKNOWN";
    let message = res.statusText;
    try {
      const data = await res.json();
      const err = data?.error ?? {};
      code = err.code ?? code;
      message = err.message ?? message;
    } catch {
      try {
        message = await res.text();
      } catch { /* ignore */ }
    }
    throw new ApiError(res.status, code, message);
  }

  return (await res.json()) as T;
}

// ---- Assemblies ----

export async function listAssemblies(): Promise<Assembly[]> {
  const data = await request<{ assemblies: Assembly[] }>("GET", "/assemblies");
  return data.assemblies;
}

export function createAssembly(params: {
  name: string;
  organizationId?: string;
  preset?: string;
}): Promise<Assembly> {
  return request("POST", "/assemblies", params);
}

export function getAssembly(id: string): Promise<Assembly> {
  return request("GET", `/assemblies/${id}`);
}

// ---- Participants ----

export function listParticipants(assemblyId: string): Promise<{ participants: Participant[] }> {
  return request("GET", `/assemblies/${assemblyId}/participants`);
}

export function addParticipant(assemblyId: string, name: string): Promise<Participant> {
  return request("POST", `/assemblies/${assemblyId}/participants`, { name });
}

export function removeParticipant(assemblyId: string, pid: string): Promise<void> {
  return request("DELETE", `/assemblies/${assemblyId}/participants/${pid}`);
}

// ---- Voting Events ----

export function listEvents(assemblyId: string): Promise<{ events: VotingEvent[] }> {
  return request("GET", `/assemblies/${assemblyId}/events`);
}

export function createEvent(
  assemblyId: string,
  params: {
    title: string;
    description: string;
    issues: Array<{ title: string; description: string; topicIds: string[] }>;
    eligibleParticipantIds: string[];
    timeline: { deliberationStart: string; votingStart: string; votingEnd: string };
  },
): Promise<VotingEvent> {
  return request("POST", `/assemblies/${assemblyId}/events`, params);
}

export function getEvent(assemblyId: string, eventId: string): Promise<VotingEvent> {
  return request("GET", `/assemblies/${assemblyId}/events/${eventId}`);
}

// ---- Topics ----

export function listTopics(assemblyId: string): Promise<{ topics: Topic[] }> {
  return request("GET", `/assemblies/${assemblyId}/topics`);
}

// ---- Delegations ----

export function listDelegations(
  assemblyId: string,
  sourceId?: string,
): Promise<{ delegations: Delegation[] }> {
  const qs = sourceId ? `?sourceId=${sourceId}` : "";
  return request("GET", `/assemblies/${assemblyId}/delegations${qs}`);
}

export function createDelegation(
  assemblyId: string,
  params: { targetId: string; topicScope?: string[] },
): Promise<Delegation> {
  return request("POST", `/assemblies/${assemblyId}/delegations`, params);
}

export function revokeDelegation(assemblyId: string, delegationId: string): Promise<void> {
  return request("DELETE", `/assemblies/${assemblyId}/delegations/${delegationId}`);
}

export function getMyWeight(
  assemblyId: string,
  issueId: string,
): Promise<MyWeight> {
  return request("GET", `/assemblies/${assemblyId}/delegations/my-weight?issueId=${issueId}`);
}

export function resolveChain(
  assemblyId: string,
  participantId: string,
  issueId: string,
): Promise<DelegationChain> {
  return request(
    "GET",
    `/assemblies/${assemblyId}/delegations/chain?participantId=${participantId}&issueId=${issueId}`,
  );
}

// ---- Voting ----

export function castVote(
  assemblyId: string,
  params: { participantId: string; issueId: string; choice: string },
): Promise<{ status: string }> {
  return request("POST", `/assemblies/${assemblyId}/votes`, params);
}

export function getTally(
  assemblyId: string,
  eventId: string,
): Promise<{ eventId: string; tallies: Tally[] }> {
  return request("GET", `/assemblies/${assemblyId}/events/${eventId}/tally`);
}

export function getWeights(
  assemblyId: string,
  eventId: string,
): Promise<{ eventId: string; weights: WeightDist[] }> {
  return request("GET", `/assemblies/${assemblyId}/events/${eventId}/weights`);
}

export function getParticipation(
  assemblyId: string,
  eventId: string,
  participantId?: string,
): Promise<{ eventId: string; participation: ParticipationRecord[] }> {
  const qs = participantId ? `?participantId=${participantId}` : "";
  return request("GET", `/assemblies/${assemblyId}/events/${eventId}/participation${qs}`);
}

// ---- Awareness ----

export function getConcentration(
  assemblyId: string,
  issueId: string,
): Promise<ConcentrationMetrics> {
  return request("GET", `/assemblies/${assemblyId}/awareness/concentration?issueId=${issueId}`);
}

export function getVotingHistory(
  assemblyId: string,
  participantId: string,
): Promise<VotingHistory> {
  return request("GET", `/assemblies/${assemblyId}/awareness/history/${participantId}`);
}

export function getDelegateProfile(
  assemblyId: string,
  participantId: string,
): Promise<DelegateProfile> {
  return request("GET", `/assemblies/${assemblyId}/awareness/profile/${participantId}`);
}

// ---- Polls ----

export function listPolls(
  assemblyId: string,
  participantId?: string,
): Promise<{ polls: Poll[] }> {
  const qs = participantId ? `?participantId=${participantId}` : "";
  return request("GET", `/assemblies/${assemblyId}/polls${qs}`);
}

export function createPoll(
  assemblyId: string,
  params: unknown,
): Promise<Poll> {
  return request("POST", `/assemblies/${assemblyId}/polls`, params);
}

export function submitPollResponse(
  assemblyId: string,
  pollId: string,
  params: { participantId: string; answers: Array<{ questionId: string; value: unknown }> },
): Promise<{ status: string }> {
  return request("POST", `/assemblies/${assemblyId}/polls/${pollId}/respond`, {
    ...params,
    pollId,
  });
}

export function getPollResults(
  assemblyId: string,
  pollId: string,
  eligibleCount?: number,
): Promise<PollResults> {
  const qs = eligibleCount ? `?eligibleCount=${eligibleCount}` : "";
  return request("GET", `/assemblies/${assemblyId}/polls/${pollId}/results${qs}`);
}

// ---- Predictions ----

export function listPredictions(
  assemblyId: string,
  participantId: string,
): Promise<{ predictions: import("./types.js").Prediction[] }> {
  return request("GET", `/assemblies/${assemblyId}/predictions?participantId=${participantId}`);
}

export function getTrackRecord(
  assemblyId: string,
  participantId: string,
): Promise<import("./types.js").TrackRecord> {
  return request("GET", `/assemblies/${assemblyId}/track-record/${participantId}`);
}

export function evaluatePrediction(
  assemblyId: string,
  predictionId: string,
): Promise<import("./types.js").PredictionEvaluation> {
  return request("GET", `/assemblies/${assemblyId}/predictions/${predictionId}/eval`);
}

export { ApiError };

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
  Survey,
  SurveyResults,
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
  config?: unknown;
  admissionMode?: string;
}): Promise<Assembly> {
  return request("POST", "/assemblies", params);
}

export function getAssembly(id: string): Promise<Assembly> {
  return request("GET", `/assemblies/${id}`);
}

export function getAssemblyProfile(id: string): Promise<import("./types.js").AssemblyProfile> {
  return request("GET", `/assemblies/${id}/profile`);
}

export function createInviteLink(assemblyId: string, options?: { maxUses?: number; expiresAt?: string }): Promise<{ id: string; token: string }> {
  return request("POST", `/assemblies/${assemblyId}/invitations`, { type: "link", ...options });
}

export function createDirectInvite(assemblyId: string, inviteeHandle: string): Promise<{ id: string }> {
  return request("POST", `/assemblies/${assemblyId}/invitations`, { type: "direct", inviteeHandle });
}

export function listMyInvitations(): Promise<{ invitations: Array<{ id: string; assemblyId: string; assemblyName: string | null; invitedBy: string; createdAt: string }> }> {
  return request("GET", "/me/invitations");
}

export function acceptInvitation(invitationId: string): Promise<{ assemblyId: string }> {
  return request("POST", `/me/invitations/${invitationId}/accept`);
}

export function declineInvitation(invitationId: string): Promise<void> {
  return request("POST", `/me/invitations/${invitationId}/decline`);
}

export interface BulkInvitePreview {
  valid: Array<{ handle: string; status: "found" | "not_found"; alreadyMember: boolean }>;
  errors: Array<{ row: number; value: string; reason: string }>;
  summary: { total: number; canInvite: number; alreadyMembers: number; unknownHandles: number; invalidRows: number };
}

export interface BulkInviteResult {
  created: number;
  skipped: number;
  results: Array<{ handle: string; status: "created" | "skipped"; reason?: string }>;
}

export function previewBulkInvites(assemblyId: string, csv: string): Promise<BulkInvitePreview> {
  return request("POST", `/assemblies/${assemblyId}/invitations/preview`, { csv });
}

export function createBulkInvites(assemblyId: string, handles: string[]): Promise<BulkInviteResult> {
  return request("POST", `/assemblies/${assemblyId}/invitations/bulk`, { handles });
}

// ---- Assembly Settings ----

export function getAssemblySettings(assemblyId: string): Promise<{ admissionMode: string }> {
  return request("GET", `/assemblies/${assemblyId}/settings`);
}

export function updateAssemblySettings(assemblyId: string, settings: { admissionMode: string }): Promise<{ admissionMode: string }> {
  return request("PUT", `/assemblies/${assemblyId}/settings`, settings);
}

// ---- Join Requests ----

import type { JoinRequest } from "./types.js";

export function listJoinRequests(assemblyId: string): Promise<{ joinRequests: JoinRequest[] }> {
  return request("GET", `/assemblies/${assemblyId}/join-requests`);
}

export function approveJoinRequest(assemblyId: string, requestId: string): Promise<{ status: string }> {
  return request("POST", `/assemblies/${assemblyId}/join-requests/${requestId}/approve`);
}

export function rejectJoinRequest(assemblyId: string, requestId: string): Promise<{ status: string }> {
  return request("POST", `/assemblies/${assemblyId}/join-requests/${requestId}/reject`);
}

export function listMyJoinRequests(): Promise<{ joinRequests: JoinRequest[] }> {
  return request("GET", "/me/join-requests");
}

export function updateProfile(updates: { handle?: string; name?: string; bio?: string; avatarUrl?: string | null }): Promise<{ handle: string; name: string; bio: string; avatarUrl: string | null }> {
  return request("PUT", "/me/profile", updates);
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
    issues: Array<{ title: string; description: string; topicId: string | null }>;
    eligibleParticipantIds: string[];
    /** Start date — system computes full timeline from assembly config. */
    startDate?: string | number;
    /** Explicit timeline (backward compat). */
    timeline?: { deliberationStart: string; votingStart: string; votingEnd: string };
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
  params: { targetId: string; topicScope?: string[]; issueScope?: string },
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

// ---- Surveys ----

export function listSurveys(
  assemblyId: string,
  participantId?: string,
): Promise<{ surveys: Survey[] }> {
  const qs = participantId ? `?participantId=${participantId}` : "";
  return request("GET", `/assemblies/${assemblyId}/surveys${qs}`);
}

export function createSurvey(
  assemblyId: string,
  params: unknown,
): Promise<Survey> {
  return request("POST", `/assemblies/${assemblyId}/surveys`, params);
}

export function submitSurveyResponse(
  assemblyId: string,
  surveyId: string,
  params: { participantId: string; answers: Array<{ questionId: string; value: unknown }> },
): Promise<{ status: string }> {
  return request("POST", `/assemblies/${assemblyId}/surveys/${surveyId}/respond`, {
    ...params,
    pollId: surveyId,
  });
}

export function getSurveyResults(
  assemblyId: string,
  surveyId: string,
  eligibleCount?: number,
): Promise<SurveyResults> {
  const qs = eligibleCount ? `?eligibleCount=${eligibleCount}` : "";
  return request("GET", `/assemblies/${assemblyId}/surveys/${surveyId}/results${qs}`);
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

// ---- Notification Preferences ----

export function getNotificationPreferences(): Promise<{
  preferences: import("./types.js").NotificationPreferences;
}> {
  return request("GET", "/me/notification-preferences");
}

export function setNotificationPreference(
  key: string,
  value: string,
): Promise<{ preferences: import("./types.js").NotificationPreferences }> {
  return request("PUT", "/me/notification-preferences", { key, value });
}

// ---- Notification Feed ----

import type { Notification } from "./types.js";

export function listNotifications(options?: {
  limit?: number;
  offset?: number;
  assemblyId?: string;
  unreadOnly?: boolean;
}): Promise<{ notifications: Notification[]; unreadCount: number; total: number }> {
  const params = new URLSearchParams();
  if (options?.limit) params.set("limit", String(options.limit));
  if (options?.offset) params.set("offset", String(options.offset));
  if (options?.assemblyId) params.set("assemblyId", options.assemblyId);
  if (options?.unreadOnly) params.set("unreadOnly", "true");
  const qs = params.toString();
  return request("GET", `/me/notifications/feed${qs ? `?${qs}` : ""}`);
}

export function getUnreadNotificationCount(): Promise<{ unreadCount: number }> {
  return request("GET", "/me/notifications/unread-count");
}

export function markNotificationRead(notificationId: string): Promise<void> {
  return request("POST", `/me/notifications/${notificationId}/read`);
}

export function markAllNotificationsRead(assemblyId?: string): Promise<void> {
  const qs = assemblyId ? `?assemblyId=${assemblyId}` : "";
  return request("POST", `/me/notifications/read-all${qs}`);
}

// ---- Proposals ----

export function listProposalDrafts(
  assemblyId: string,
): Promise<{ drafts: import("./types.js").ProposalDraft[] }> {
  return request("GET", `/assemblies/${assemblyId}/proposals/drafts`);
}

export function createProposalDraft(
  assemblyId: string,
  params: { issueId: string; choiceKey?: string; title: string; markdown?: string },
): Promise<import("./types.js").ProposalDraft> {
  return request("POST", `/assemblies/${assemblyId}/proposals/drafts`, params);
}

export function updateProposalDraft(
  assemblyId: string,
  draftId: string,
  params: { title?: string; markdown?: string; choiceKey?: string },
): Promise<import("./types.js").ProposalDraft> {
  return request("PUT", `/assemblies/${assemblyId}/proposals/drafts/${draftId}`, params);
}

export function deleteProposalDraft(assemblyId: string, draftId: string): Promise<void> {
  return request("DELETE", `/assemblies/${assemblyId}/proposals/drafts/${draftId}`);
}

export function submitProposalDraft(
  assemblyId: string,
  draftId: string,
): Promise<import("./types.js").Proposal> {
  return request("POST", `/assemblies/${assemblyId}/proposals/drafts/${draftId}/submit`);
}

export function getProposal(
  assemblyId: string,
  proposalId: string,
): Promise<import("./types.js").Proposal> {
  return request("GET", `/assemblies/${assemblyId}/proposals/${proposalId}`);
}

export function listProposals(
  assemblyId: string,
  issueId?: string,
): Promise<{ proposals: import("./types.js").Proposal[] }> {
  const qs = issueId ? `?issueId=${issueId}` : "";
  return request("GET", `/assemblies/${assemblyId}/proposals${qs}`);
}

export function evaluateProposal(
  assemblyId: string,
  proposalId: string,
  evaluation: "endorse" | "dispute",
): Promise<{ status: string }> {
  return request("POST", `/assemblies/${assemblyId}/proposals/${proposalId}/evaluate`, { evaluation });
}

export function featureProposal(
  assemblyId: string,
  proposalId: string,
): Promise<{ status: string }> {
  return request("POST", `/assemblies/${assemblyId}/proposals/${proposalId}/feature`);
}

export function unfeatureProposal(
  assemblyId: string,
  proposalId: string,
): Promise<{ status: string }> {
  return request("POST", `/assemblies/${assemblyId}/proposals/${proposalId}/unfeature`);
}

export function getBookletProposals(
  assemblyId: string,
  issueId: string,
): Promise<import("./types.js").BookletData> {
  return request("GET", `/assemblies/${assemblyId}/proposals/booklet?issueId=${issueId}`);
}

export function getRecommendation(
  assemblyId: string,
  eventId: string,
  issueId: string,
): Promise<{ recommendation: import("./types.js").BookletRecommendation | null }> {
  return request("GET", `/assemblies/${assemblyId}/events/${eventId}/issues/${issueId}/recommendation`);
}

export function setRecommendation(
  assemblyId: string,
  eventId: string,
  issueId: string,
  markdown: string,
): Promise<{ status: string; contentHash: string }> {
  return request("POST", `/assemblies/${assemblyId}/events/${eventId}/issues/${issueId}/recommendation`, { markdown });
}

export function deleteRecommendation(
  assemblyId: string,
  eventId: string,
  issueId: string,
): Promise<{ status: string }> {
  return request("DELETE", `/assemblies/${assemblyId}/events/${eventId}/issues/${issueId}/recommendation`);
}

// ---- Candidacies ----

export function declareCandidacy(
  assemblyId: string,
  params: { topicScope: string[]; voteTransparencyOptIn: boolean; markdown: string },
): Promise<import("./types.js").Candidacy> {
  return request("POST", `/assemblies/${assemblyId}/candidacies`, params);
}

export function getCandidacy(
  assemblyId: string,
  candidacyId: string,
): Promise<import("./types.js").Candidacy> {
  return request("GET", `/assemblies/${assemblyId}/candidacies/${candidacyId}`);
}

export function listCandidacies(
  assemblyId: string,
  status?: string,
): Promise<{ candidacies: import("./types.js").Candidacy[] }> {
  const qs = status ? `?status=${status}` : "";
  return request("GET", `/assemblies/${assemblyId}/candidacies${qs}`);
}

// ---- Community Notes ----

export function createNote(
  assemblyId: string,
  params: { markdown: string; targetType: string; targetId: string; targetVersionNumber?: number },
): Promise<import("./types.js").CommunityNote> {
  return request("POST", `/assemblies/${assemblyId}/notes`, params);
}

export function getNote(
  assemblyId: string,
  noteId: string,
): Promise<import("./types.js").CommunityNote> {
  return request("GET", `/assemblies/${assemblyId}/notes/${noteId}`);
}

export function listNotes(
  assemblyId: string,
  targetType?: string,
  targetId?: string,
): Promise<{ notes: import("./types.js").CommunityNote[] }> {
  const params = new URLSearchParams();
  if (targetType) params.set("targetType", targetType);
  if (targetId) params.set("targetId", targetId);
  const qs = params.toString() ? `?${params}` : "";
  return request("GET", `/assemblies/${assemblyId}/notes${qs}`);
}

export function evaluateNote(
  assemblyId: string,
  noteId: string,
  evaluation: "endorse" | "dispute",
): Promise<{ status: string }> {
  return request("POST", `/assemblies/${assemblyId}/notes/${noteId}/evaluate`, { evaluation });
}

export function withdrawNote(
  assemblyId: string,
  noteId: string,
): Promise<{ status: string }> {
  return request("POST", `/assemblies/${assemblyId}/notes/${noteId}/withdraw`);
}

export { ApiError };

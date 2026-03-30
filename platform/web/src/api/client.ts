/**
 * API client — all requests go through the client backend.
 *
 * The backend handles VCP communication, participant identity resolution,
 * and API key management. The client just sends the user's access token.
 */

import type {
  Group,
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
import { isTauri } from "../lib/tauri.js";

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

  // Mobile (Tauri): use Authorization header from localStorage
  // Web browser: rely on httpOnly cookies (sent automatically)
  if (isTauri) {
    const token = getAccessToken();
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
  }

  const init: RequestInit = { method, headers, credentials: "include" };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
  }

  let res = await fetch(`${BASE_URL}${path}`, init);

  // Auto-refresh on 401
  if (res.status === 401) {
    const newToken = await refreshSession();
    if (newToken) {
      if (isTauri && newToken !== "refreshed") {
        headers["Authorization"] = `Bearer ${newToken}`;
      }
      res = await fetch(`${BASE_URL}${path}`, { method, headers, credentials: "include", body: init.body });
    } else {
      // Refresh failed — session is dead. Notify the app to clear auth state.
      window.dispatchEvent(new CustomEvent("votiverse:auth-expired"));
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

// ---- Groups ----

export async function listGroups(): Promise<Group[]> {
  const data = await request<{ groups: Group[] }>("GET", "/groups");
  return data.groups;
}

export function createGroup(params: {
  name: string;
  preset?: string;
  config?: unknown;
  admissionMode?: string;
  websiteUrl?: string;
  capabilities?: string[];
}): Promise<Group> {
  return request("POST", "/groups", params);
}

export function getGroup(id: string): Promise<Group> {
  return request("GET", `/groups/${id}`);
}

export function getGroupProfile(id: string): Promise<import("./types.js").GroupProfile> {
  return request("GET", `/groups/${id}/profile`);
}

export function createInviteLink(groupId: string, options?: { maxUses?: number; expiresAt?: string }): Promise<{ id: string; token: string }> {
  return request("POST", `/groups/${groupId}/invitations`, { type: "link", ...options });
}

export function createDirectInvite(groupId: string, inviteeHandle: string): Promise<{ id: string }> {
  return request("POST", `/groups/${groupId}/invitations`, { type: "direct", inviteeHandle });
}

export function listMyInvitations(): Promise<{ invitations: Array<{ id: string; groupId: string; groupName: string | null; invitedBy: string; createdAt: string }> }> {
  return request("GET", "/me/invitations");
}

export function acceptInvitation(invitationId: string): Promise<{ groupId: string }> {
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

export function previewBulkInvites(groupId: string, csv: string): Promise<BulkInvitePreview> {
  return request("POST", `/groups/${groupId}/invitations/preview`, { csv });
}

export function createBulkInvites(groupId: string, handles: string[]): Promise<BulkInviteResult> {
  return request("POST", `/groups/${groupId}/invitations/bulk`, { handles });
}

// ---- Group Settings ----

export function getGroupSettings(groupId: string): Promise<{ admissionMode: string; websiteUrl: string | null; voteCreation: string }> {
  return request("GET", `/groups/${groupId}/settings`);
}

export function updateGroupSettings(groupId: string, settings: { admissionMode?: string; websiteUrl?: string; voteCreation?: string }): Promise<{ admissionMode: string; websiteUrl: string | null; voteCreation: string }> {
  return request("PUT", `/groups/${groupId}/settings`, settings);
}

// ---- Join Requests ----

import type { JoinRequest } from "./types.js";

export function listJoinRequests(groupId: string): Promise<{ joinRequests: JoinRequest[] }> {
  return request("GET", `/groups/${groupId}/join-requests`);
}

export function approveJoinRequest(groupId: string, requestId: string): Promise<{ status: string }> {
  return request("POST", `/groups/${groupId}/join-requests/${requestId}/approve`);
}

export function rejectJoinRequest(groupId: string, requestId: string): Promise<{ status: string }> {
  return request("POST", `/groups/${groupId}/join-requests/${requestId}/reject`);
}

export function listMyJoinRequests(): Promise<{ joinRequests: JoinRequest[] }> {
  return request("GET", "/me/join-requests");
}

export function updateProfile(updates: { handle?: string; name?: string; bio?: string; avatarUrl?: string | null; locale?: string }): Promise<{ handle: string; name: string; bio: string; avatarUrl: string | null; locale: string }> {
  return request("PUT", "/me/profile", updates);
}

export function updateMemberProfile(groupId: string, updates: { title?: string | null; avatarUrl?: string | null; bannerUrl?: string | null }): Promise<{ ok: true }> {
  return request("PUT", `/me/groups/${groupId}/profile`, updates);
}

// ---- Participants ----

export function listParticipants(groupId: string): Promise<{ participants: Participant[] }> {
  return request("GET", `/groups/${groupId}/participants`);
}

export function addParticipant(groupId: string, name: string): Promise<Participant> {
  return request("POST", `/groups/${groupId}/participants`, { name });
}

export function removeParticipant(groupId: string, pid: string): Promise<void> {
  return request("DELETE", `/groups/${groupId}/participants/${pid}`);
}

// ---- Voting Events ----

export function listEvents(groupId: string): Promise<{ events: VotingEvent[] }> {
  return request("GET", `/groups/${groupId}/events`);
}

export function createEvent(
  groupId: string,
  params: {
    title: string;
    description: string;
    issues: Array<{ title: string; description: string; topicId: string | null; choices?: string[] }>;
    eligibleParticipantIds: string[];
    /** Start date — system computes full timeline from group config. */
    startDate?: string | number;
    /** Explicit timeline (backward compat). */
    timeline?: { deliberationStart: string; votingStart: string; votingEnd: string };
  },
): Promise<VotingEvent> {
  return request("POST", `/groups/${groupId}/events`, params);
}

export function getEvent(groupId: string, eventId: string): Promise<VotingEvent> {
  return request("GET", `/groups/${groupId}/events/${eventId}`);
}

// ---- Topics ----

export function listTopics(groupId: string): Promise<{ topics: Topic[] }> {
  return request("GET", `/groups/${groupId}/topics`);
}

export function createTopic(
  groupId: string,
  params: { name: string; parentId?: string | null },
): Promise<Topic> {
  return request("POST", `/groups/${groupId}/topics`, params);
}

export function getTopicIssues(groupId: string, topicId: string): Promise<{
  issues: import("./types.js").TopicIssueItem[];
  pagination: import("./types.js").PaginationMeta;
}> {
  return request("GET", `/groups/${groupId}/topics/${topicId}/issues`);
}

export function getTopicDelegations(groupId: string, topicId: string): Promise<{
  delegations: import("./types.js").TopicDelegationItem[];
  pagination: import("./types.js").PaginationMeta;
}> {
  return request("GET", `/groups/${groupId}/topics/${topicId}/delegations`);
}

// ---- Delegations ----

export function listDelegations(
  groupId: string,
  sourceId?: string,
): Promise<{ delegations: Delegation[] }> {
  const qs = sourceId ? `?sourceId=${sourceId}` : "";
  return request("GET", `/groups/${groupId}/delegations${qs}`);
}

export function createDelegation(
  groupId: string,
  params: { targetId: string; topicScope?: string[]; issueScope?: string; retractVoteOnIssue?: string },
): Promise<Delegation> {
  return request("POST", `/groups/${groupId}/delegations`, params);
}

export function revokeDelegation(groupId: string, delegationId: string): Promise<void> {
  return request("DELETE", `/groups/${groupId}/delegations/${delegationId}`);
}

export function getMyWeight(
  groupId: string,
  issueId: string,
): Promise<MyWeight> {
  return request("GET", `/groups/${groupId}/delegations/my-weight?issueId=${issueId}`);
}

export function resolveChain(
  groupId: string,
  participantId: string,
  issueId: string,
): Promise<DelegationChain> {
  return request(
    "GET",
    `/groups/${groupId}/delegations/chain?participantId=${participantId}&issueId=${issueId}`,
  );
}

// ---- Voting ----

export function castVote(
  groupId: string,
  params: { participantId: string; issueId: string; choice: string },
): Promise<{ status: string }> {
  return request("POST", `/groups/${groupId}/votes`, params);
}

export function retractVote(
  groupId: string,
  issueId: string,
): Promise<{ status: string }> {
  return request("DELETE", `/groups/${groupId}/votes/${issueId}`);
}

export function getTally(
  groupId: string,
  eventId: string,
): Promise<{ eventId: string; tallies: Tally[] }> {
  return request("GET", `/groups/${groupId}/events/${eventId}/tally`);
}

export function getWeights(
  groupId: string,
  eventId: string,
): Promise<{ eventId: string; weights: WeightDist[] }> {
  return request("GET", `/groups/${groupId}/events/${eventId}/weights`);
}

export function getParticipation(
  groupId: string,
  eventId: string,
  participantId?: string,
): Promise<{ eventId: string; participation: ParticipationRecord[] }> {
  const qs = participantId ? `?participantId=${participantId}` : "";
  return request("GET", `/groups/${groupId}/events/${eventId}/participation${qs}`);
}

// ---- Awareness ----

export function getConcentration(
  groupId: string,
  issueId: string,
): Promise<ConcentrationMetrics> {
  return request("GET", `/groups/${groupId}/awareness/concentration?issueId=${issueId}`);
}

export function getVotingHistory(
  groupId: string,
  participantId: string,
): Promise<VotingHistory> {
  return request("GET", `/groups/${groupId}/awareness/history/${participantId}`);
}

export function getDelegateProfile(
  groupId: string,
  participantId: string,
): Promise<DelegateProfile> {
  return request("GET", `/groups/${groupId}/awareness/profile/${participantId}`);
}

// ---- Surveys ----

export function listSurveys(
  groupId: string,
  participantId?: string,
): Promise<{ surveys: Survey[] }> {
  const qs = participantId ? `?participantId=${participantId}` : "";
  return request("GET", `/groups/${groupId}/surveys${qs}`);
}

export function createSurvey(
  groupId: string,
  params: unknown,
): Promise<Survey> {
  return request("POST", `/groups/${groupId}/surveys`, params);
}

export function submitSurveyResponse(
  groupId: string,
  surveyId: string,
  params: { participantId: string; answers: Array<{ questionId: string; value: unknown }> },
): Promise<{ status: string }> {
  return request("POST", `/groups/${groupId}/surveys/${surveyId}/respond`, {
    ...params,
    pollId: surveyId,
  });
}

export function dismissSurvey(
  groupId: string,
  surveyId: string,
): Promise<{ status: string }> {
  return request("POST", `/groups/${groupId}/surveys/${surveyId}/dismiss`);
}

export function getSurveyResults(
  groupId: string,
  surveyId: string,
  eligibleCount?: number,
): Promise<SurveyResults> {
  const qs = eligibleCount ? `?eligibleCount=${eligibleCount}` : "";
  return request("GET", `/groups/${groupId}/surveys/${surveyId}/results${qs}`);
}

// ---- Predictions ----

export function listPredictions(
  groupId: string,
  participantId: string,
): Promise<{ predictions: import("./types.js").Prediction[] }> {
  return request("GET", `/groups/${groupId}/predictions?participantId=${participantId}`);
}

export function getTrackRecord(
  groupId: string,
  participantId: string,
): Promise<import("./types.js").TrackRecord> {
  return request("GET", `/groups/${groupId}/track-record/${participantId}`);
}

export function evaluatePrediction(
  groupId: string,
  predictionId: string,
): Promise<import("./types.js").PredictionEvaluation> {
  return request("GET", `/groups/${groupId}/predictions/${predictionId}/eval`);
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
  groupId?: string;
  unreadOnly?: boolean;
}): Promise<{ notifications: Notification[]; unreadCount: number; total: number }> {
  const params = new URLSearchParams();
  if (options?.limit) params.set("limit", String(options.limit));
  if (options?.offset) params.set("offset", String(options.offset));
  if (options?.groupId) params.set("groupId", options.groupId);
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

export function markAllNotificationsRead(groupId?: string): Promise<void> {
  const qs = groupId ? `?groupId=${groupId}` : "";
  return request("POST", `/me/notifications/read-all${qs}`);
}

// ---- Proposals ----

export function listProposalDrafts(
  groupId: string,
): Promise<{ drafts: import("./types.js").ProposalDraft[] }> {
  return request("GET", `/groups/${groupId}/proposals/drafts`);
}

export function createProposalDraft(
  groupId: string,
  params: { issueId: string; choiceKey?: string; title: string; markdown?: string },
): Promise<import("./types.js").ProposalDraft> {
  return request("POST", `/groups/${groupId}/proposals/drafts`, params);
}

export function updateProposalDraft(
  groupId: string,
  draftId: string,
  params: { title?: string; markdown?: string; choiceKey?: string },
): Promise<import("./types.js").ProposalDraft> {
  return request("PUT", `/groups/${groupId}/proposals/drafts/${draftId}`, params);
}

export function deleteProposalDraft(groupId: string, draftId: string): Promise<void> {
  return request("DELETE", `/groups/${groupId}/proposals/drafts/${draftId}`);
}

export function submitProposalDraft(
  groupId: string,
  draftId: string,
): Promise<import("./types.js").Proposal> {
  return request("POST", `/groups/${groupId}/proposals/drafts/${draftId}/submit`);
}

export function getProposal(
  groupId: string,
  proposalId: string,
): Promise<import("./types.js").Proposal> {
  return request("GET", `/groups/${groupId}/proposals/${proposalId}`);
}

export function listProposals(
  groupId: string,
  issueId?: string,
): Promise<{ proposals: import("./types.js").Proposal[] }> {
  const qs = issueId ? `?issueId=${issueId}` : "";
  return request("GET", `/groups/${groupId}/proposals${qs}`);
}

export function createProposalVersion(
  groupId: string,
  proposalId: string,
  params: { markdown: string; assets?: string[]; changeSummary?: string },
): Promise<{ currentVersion: number; contentHash: string }> {
  return request("POST", `/groups/${groupId}/proposals/${proposalId}/version`, params);
}

export function featureProposal(
  groupId: string,
  proposalId: string,
): Promise<{ status: string }> {
  return request("POST", `/groups/${groupId}/proposals/${proposalId}/feature`);
}

export function unfeatureProposal(
  groupId: string,
  proposalId: string,
): Promise<{ status: string }> {
  return request("POST", `/groups/${groupId}/proposals/${proposalId}/unfeature`);
}

export function getBookletProposals(
  groupId: string,
  issueId: string,
): Promise<import("./types.js").BookletData> {
  return request("GET", `/groups/${groupId}/proposals/booklet?issueId=${issueId}`);
}

export function getRecommendation(
  groupId: string,
  eventId: string,
  issueId: string,
): Promise<{ recommendation: import("./types.js").BookletRecommendation | null }> {
  return request("GET", `/groups/${groupId}/events/${eventId}/issues/${issueId}/recommendation`);
}

export function setRecommendation(
  groupId: string,
  eventId: string,
  issueId: string,
  markdown: string,
): Promise<{ status: string; contentHash: string }> {
  return request("POST", `/groups/${groupId}/events/${eventId}/issues/${issueId}/recommendation`, { markdown });
}

export function deleteRecommendation(
  groupId: string,
  eventId: string,
  issueId: string,
): Promise<{ status: string }> {
  return request("DELETE", `/groups/${groupId}/events/${eventId}/issues/${issueId}/recommendation`);
}

// ---- Candidacies ----

export function declareCandidacy(
  groupId: string,
  params: { topicScope: string[]; voteTransparencyOptIn: boolean; markdown: string; websiteUrl?: string },
): Promise<import("./types.js").Candidacy> {
  return request("POST", `/groups/${groupId}/candidacies`, params);
}

export function getCandidacy(
  groupId: string,
  candidacyId: string,
): Promise<import("./types.js").Candidacy> {
  return request("GET", `/groups/${groupId}/candidacies/${candidacyId}`);
}

export function listCandidacies(
  groupId: string,
  status?: string,
): Promise<{ candidacies: import("./types.js").Candidacy[] }> {
  const qs = status ? `?status=${status}` : "";
  return request("GET", `/groups/${groupId}/candidacies${qs}`);
}

export function createCandidacyVersion(
  groupId: string,
  candidacyId: string,
  params: { markdown: string; topicScope?: string[]; voteTransparencyOptIn?: boolean; websiteUrl?: string },
): Promise<{ currentVersion: number; contentHash: string }> {
  return request("POST", `/groups/${groupId}/candidacies/${candidacyId}/version`, params);
}

export function withdrawCandidacy(
  groupId: string,
  candidacyId: string,
): Promise<{ status: string }> {
  return request("POST", `/groups/${groupId}/candidacies/${candidacyId}/withdraw`, {});
}

// ---- Entity Endorsements ----

export function upsertEndorsement(
  groupId: string,
  params: { targetType: "candidacy" | "proposal"; targetId: string; value: "endorse" | "dispute" },
): Promise<{ targetType: string; targetId: string; value: string }> {
  return request("PUT", `/groups/${groupId}/endorsements`, params);
}

export function retractEndorsement(
  groupId: string,
  params: { targetType: "candidacy" | "proposal"; targetId: string },
): Promise<{ ok: true }> {
  return request("DELETE", `/groups/${groupId}/endorsements`, params);
}

export function getEndorsements(
  groupId: string,
  targetType: "candidacy" | "proposal",
  targetIds: string[],
): Promise<{ endorsements: Record<string, import("./types.js").EndorsementCounts> }> {
  return request("GET", `/groups/${groupId}/endorsements?targetType=${targetType}&targetIds=${targetIds.join(",")}`);
}

// ---- Community Notes ----

export function createNote(
  groupId: string,
  params: { markdown: string; targetType: string; targetId: string; targetVersionNumber?: number },
): Promise<import("./types.js").CommunityNote> {
  return request("POST", `/groups/${groupId}/notes`, params);
}

export function getNote(
  groupId: string,
  noteId: string,
): Promise<import("./types.js").CommunityNote> {
  return request("GET", `/groups/${groupId}/notes/${noteId}`);
}

export function listNotes(
  groupId: string,
  targetType?: string,
  targetId?: string,
): Promise<{ notes: import("./types.js").CommunityNote[] }> {
  const params = new URLSearchParams();
  if (targetType) params.set("targetType", targetType);
  if (targetId) params.set("targetId", targetId);
  const qs = params.toString() ? `?${params}` : "";
  return request("GET", `/groups/${groupId}/notes${qs}`);
}

export function evaluateNote(
  groupId: string,
  noteId: string,
  evaluation: "endorse" | "dispute",
): Promise<{ status: string }> {
  return request("POST", `/groups/${groupId}/notes/${noteId}/evaluate`, { evaluation });
}

export function withdrawNote(
  groupId: string,
  noteId: string,
): Promise<{ status: string }> {
  return request("POST", `/groups/${groupId}/notes/${noteId}/withdraw`);
}

// ---- Push Notification Device Tokens ----

export function registerDevice(
  platform: "ios" | "android",
  token: string,
): Promise<{ deviceId: string }> {
  return request("POST", "/me/devices", { platform, token });
}

export function listDevices(): Promise<{
  devices: Array<{ id: string; platform: string; token_preview: string; created_at: string; updated_at: string }>;
}> {
  return request("GET", "/me/devices");
}

export function unregisterDevice(deviceId: string): Promise<void> {
  return request("DELETE", `/me/devices/${deviceId}`);
}

// ---- Scoring ----

export function listScoringEvents(
  groupId: string,
): Promise<{ scoringEvents: import("./types.js").ScoringEvent[] }> {
  return request("GET", `/groups/${groupId}/scoring`);
}

export function getScoringEvent(
  groupId: string,
  scoringEventId: string,
): Promise<import("./types.js").ScoringEvent> {
  return request("GET", `/groups/${groupId}/scoring/${scoringEventId}`);
}

export function createScoringEvent(
  groupId: string,
  params: {
    title: string;
    description: string;
    entries: Array<{ title: string; description?: string }>;
    rubric: { categories: Array<{ id: string; name: string; weight: number; dimensions: Array<{ id: string; name: string; scale: { min: number; max: number; step: number }; weight: number }> }>; evaluatorAggregation?: string; dimensionAggregation?: string };
    panelMemberIds?: string[] | null;
    timeline: { opensAt: number; closesAt: number };
    settings: { allowRevision: boolean; secretScores: boolean; normalizeScores: boolean };
    startAsDraft?: boolean;
  },
): Promise<import("./types.js").ScoringEvent> {
  return request("POST", `/groups/${groupId}/scoring`, params);
}

export function submitScorecard(
  groupId: string,
  scoringEventId: string,
  params: { entryId: string; scores: Array<{ dimensionId: string; score: number }> },
): Promise<import("./types.js").Scorecard> {
  return request("POST", `/groups/${groupId}/scoring/${scoringEventId}/scorecards`, params);
}

export function reviseScorecard(
  groupId: string,
  scoringEventId: string,
  scorecardId: string,
  params: { entryId: string; scores: Array<{ dimensionId: string; score: number }> },
): Promise<import("./types.js").Scorecard> {
  return request("PUT", `/groups/${groupId}/scoring/${scoringEventId}/scorecards/${scorecardId}`, params);
}

export function listScorecards(
  groupId: string,
  scoringEventId: string,
): Promise<{ scorecards: import("./types.js").Scorecard[] }> {
  return request("GET", `/groups/${groupId}/scoring/${scoringEventId}/scorecards`);
}

export function getScoringResults(
  groupId: string,
  scoringEventId: string,
): Promise<import("./types.js").ScoringResult> {
  return request("GET", `/groups/${groupId}/scoring/${scoringEventId}/results`);
}

export function closeScoringEvent(
  groupId: string,
  scoringEventId: string,
): Promise<{ status: string }> {
  return request("POST", `/groups/${groupId}/scoring/${scoringEventId}/close`);
}

export function openScoringEvent(
  groupId: string,
  scoringEventId: string,
): Promise<{ status: string }> {
  return request("POST", `/groups/${groupId}/scoring/${scoringEventId}/open`);
}

export function extendScoringDeadline(
  groupId: string,
  scoringEventId: string,
  closesAt: string,
): Promise<{ closesAt: string; originalClosesAt: string | null }> {
  return request("POST", `/groups/${groupId}/scoring/${scoringEventId}/extend`, { closesAt });
}

export function updateScoringDraft(
  groupId: string,
  scoringEventId: string,
  params: Record<string, unknown>,
): Promise<import("./types.js").ScoringEvent> {
  return request("PUT", `/groups/${groupId}/scoring/${scoringEventId}`, params);
}

export { ApiError };

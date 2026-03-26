import { useState, useMemo, useEffect, useRef } from "react";
import { useParams, Link } from "react-router";
import { useTranslation, Trans } from "react-i18next";
import { useApi } from "../hooks/use-api.js";
import { useIdentity } from "../hooks/use-identity.js";
import { useAssembly } from "../hooks/use-assembly.js";
import { useIssueStatus, invalidateHistoryCache } from "../hooks/use-issue-status.js";
import { useAttention } from "../hooks/use-attention.js";
import * as api from "../api/client.js";
import type { Tally, WeightDist, ParticipationRecord, Proposal, Candidacy } from "../api/types.js";
import { Lock } from "lucide-react";
import { VotingBooklet } from "../components/voting-booklet.js";
import { deriveEventStatus } from "../lib/status.js";
import { formatDateTime } from "../lib/format.js";
import { Card, CardHeader, CardBody, Button, Spinner, ErrorBox, Badge, Tooltip } from "../components/ui.js";
import { Avatar } from "../components/avatar.js";
import { QuickDelegateForm, QuickDelegateTrigger } from "../components/quick-delegate-form.js";

/** Neutral color rotation for tally bars — no choice is visually privileged. */
const TALLY_COLORS = [
  "bg-tally-1",
  "bg-tally-2",
  "bg-tally-3",
  "bg-tally-4",
  "bg-rose-500",
  "bg-cyan-500",
  "bg-orange-500",
  "bg-indigo-500",
];

interface DelegationConfig {
  enabled: boolean;
  topicScoped: boolean;
}

export function EventDetail() {
  const { t } = useTranslation("governance");
  const { assemblyId, eventId } = useParams();
  const { getParticipantId } = useIdentity();
  const participantId = assemblyId ? getParticipantId(assemblyId) : null;
  const { assembly } = useAssembly(assemblyId);
  const { data: event, loading, error, refetch } = useApi(
    () => api.getEvent(assemblyId!, eventId!),
    [assemblyId, eventId],
  );
  const { data: tallyData, refetch: refetchTally } = useApi(
    () => api.getTally(assemblyId!, eventId!),
    [assemblyId, eventId],
  );
  const { data: weightsData } = useApi(
    () => api.getWeights(assemblyId!, eventId!).catch((err) => {
      // 403 is expected for secret ballots or sealed results — suppress
      if (err instanceof api.ApiError && err.status === 403) return { eventId: eventId!, weights: [] };
      throw err;
    }),
    [assemblyId, eventId],
  );
  const { data: participantsData } = useApi(
    () => api.listParticipants(assemblyId!),
    [assemblyId],
  );
  const { data: topicsData } = useApi(
    () => api.listTopics(assemblyId!),
    [assemblyId],
  );

  const delegationCandidacy = assembly?.config.delegation.candidacy ?? false;
  const { data: candidaciesData } = useApi(
    () => delegationCandidacy ? api.listCandidacies(assemblyId!, "active") : Promise.resolve({ candidacies: [] }),
    [assemblyId, delegationCandidacy],
  );

  // Fetch all proposals in the assembly (one call, grouped per issue client-side)
  const { data: proposalsData } = useApi(
    () => api.listProposals(assemblyId!),
    [assemblyId],
  );

  const proposalsByIssue = useMemo(() => {
    const map = new Map<string, Proposal[]>();
    for (const p of proposalsData?.proposals ?? []) {
      if (p.status === "withdrawn") continue;
      const list = map.get(p.issueId) ?? [];
      list.push(p);
      map.set(p.issueId, list);
    }
    return map;
  }, [proposalsData]);

  const status = event?.timeline ? deriveEventStatus(event.timeline) : "upcoming";

  // Fetch participation records for closed events (O(1) lookup for what happened with your vote)
  const { data: participationData } = useApi(
    () =>
      status === "closed" && participantId
        ? api.getParticipation(assemblyId!, eventId!, participantId)
        : Promise.resolve(null),
    [assemblyId, eventId, participantId, status],
  );

  // Build a map from issueId → ParticipationRecord (must be before early returns — rules of hooks)
  const participationByIssue = useMemo(() => {
    const map = new Map<string, ParticipationRecord>();
    if (participationData?.participation) {
      for (const rec of participationData.participation) {
        map.set(rec.issueId, rec);
      }
    }
    return map;
  }, [participationData]);

  // Extract config from assembly (must be before early returns — rules of hooks)
  const delegationConfig: DelegationConfig = useMemo(() => ({
    enabled: (assembly?.config.delegation.candidacy || assembly?.config.delegation.transferable) ?? false,
    topicScoped: (assembly?.config.delegation.candidacy || assembly?.config.delegation.transferable) ?? false,
  }), [assembly]);

  const resultsVisibility = assembly?.config.ballot.secret ? "sealed" : (assembly?.config.ballot.liveResults ? "live" : "sealed");
  const allowVoteChange = assembly?.config.ballot.allowVoteChange ?? true;
  const attention = useAttention();

  // Fetch voting history at event level — used for issue sorting and summary
  const { data: historyData, refetch: refetchHistory } = useApi(
    () => participantId ? api.getVotingHistory(assemblyId!, participantId) : Promise.resolve(null),
    [assemblyId, participantId],
  );

  // Set of issue IDs the user has voted on (used for sorting + summary)
  const votedIssueIds = useMemo(
    () => new Set(historyData?.history.map((h) => h.issueId) ?? []),
    [historyData],
  );

  const topicNameMap = useMemo(() => new Map((topicsData?.topics ?? []).map((t) => [t.id, t.name])), [topicsData]);

  // Stable sort: capture initial voted IDs so cards don't reshuffle while voting.
  // Must be before early returns to satisfy React hooks rules.
  const [initialVotedIds] = useState(() => new Set<string>());
  // Update initial set once history loads (only on first load)
  if (initialVotedIds.size === 0 && votedIssueIds.size > 0) {
    for (const id of votedIssueIds) initialVotedIds.add(id);
  }
  const sortedIssues = useMemo(() => {
    const issues = event?.issues ?? [];
    return [...issues.map((issue, idx) => ({ issue, idx }))].sort((a, b) => {
      const aVoted = initialVotedIds.has(a.issue.id) ? 1 : 0;
      const bVoted = initialVotedIds.has(b.issue.id) ? 1 : 0;
      return aVoted - bVoted;
    });
  }, [event?.issues, initialVotedIds]);

  if (loading) return <Spinner />;
  if (error || !event) return <ErrorBox message={error ?? t("eventDetail.voteNotFound")} onRetry={refetch} />;

  const issues = event.issues ?? [];
  const participants = participantsData?.participants ?? [];
  const nameMap = new Map(participants.map((p) => [p.id, p.name]));
  const candidates = candidaciesData?.candidacies ?? [];
  // After voting: only refresh vote-related data (tally + history).
  // The event itself hasn't changed, and optimistic UI handles the immediate
  // visual update — avoid refetching the full event to prevent layout shifts.
  const onVoteChange = () => {
    invalidateHistoryCache();
    refetchTally();
    refetchHistory();
    // Refresh sidebar attention counts in the background (doesn't affect this page)
    attention.refresh();
  };

  return (
    <div className="max-w-5xl mx-auto">
      {/* Event header */}
      <div className="mb-6">
        <div className="flex items-center justify-between gap-3 mb-1">
          <div className="flex items-center gap-3 flex-wrap min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold font-display text-text-primary">{event.title}</h1>
            <EventStatusBadge status={status} />
            {resultsVisibility === "sealed" && status !== "closed" && (
              <Tooltip text={t("eventDetail.resultsSealedUntilEnd")}>
                <Lock size={14} className="text-text-tertiary" />
              </Tooltip>
            )}
          </div>
          {participantId && issues.length > 0 && (
            <VoteProgress
              votedCount={issues.filter((i) => votedIssueIds.has(i.id)).length}
              totalCount={issues.length}
            />
          )}
        </div>
        {event.description && <p className="text-sm text-text-muted">{event.description}</p>}
      </div>

      {/* Timeline bar */}
      <EventTimeline
        timeline={event.timeline}
        status={status}
      />

      {/* Issue cards — sorted: un-voted first, voted last */}
      <div className="space-y-4 sm:space-y-6">
        {sortedIssues.map(({ issue, idx }) => {
          const tally = tallyData?.tallies?.[idx];
          const weightDist = weightsData?.weights?.[idx];
          return (
            <IssueVotingCard
              key={issue.id}
              assemblyId={assemblyId!}
              eventId={eventId!}
              issueId={issue.id}
              title={issue.title}
              description={issue.description}
              choices={issue.choices}
              topicId={issue.topicId}
              cancelled={issue.cancelled ?? false}
              tally={tally ?? null}
              weightDist={weightDist ?? null}
              nameMap={nameMap}
              eventStatus={status}
              participation={participationByIssue.get(issue.id) ?? null}
              delegationConfig={delegationConfig}
              resultsVisibility={resultsVisibility}
              allowVoteChange={allowVoteChange}
              proposals={proposalsByIssue.get(issue.id) ?? []}
              participants={participants}
              topics={topicsData?.topics ?? []}
              candidates={delegationCandidacy ? candidates : undefined}
              topicNameMap={topicNameMap}
              isCreator={participantId === event?.createdBy}
              onVoted={onVoteChange}
            />
          );
        })}
      </div>
    </div>
  );
}

function EventStatusBadge({ status }: { status: string }) {
  const { t } = useTranslation("governance");
  const map: Record<string, { color: "green" | "blue" | "yellow" | "gray"; label: string }> = {
    voting: { color: "green", label: t("eventDetail.statusVoting") },
    deliberation: { color: "blue", label: t("eventDetail.statusDiscussion") },
    upcoming: { color: "yellow", label: t("eventDetail.statusUpcoming") },
    closed: { color: "gray", label: t("eventDetail.statusEnded") },
  };
  const entry = map[status] ?? { color: "gray" as const, label: status };
  return <Badge color={entry.color}>{entry.label}</Badge>;
}

function EventTimeline({ timeline, status }: {
  timeline: { deliberationStart: string; votingStart: string; votingEnd: string };
  status: string;
}) {
  const { t } = useTranslation("governance");
  const phases = [
    { key: "deliberation", label: t("eventDetail.phaseDiscussion"), date: timeline.deliberationStart },
    { key: "voting", label: t("eventDetail.phaseVoting"), date: timeline.votingStart },
    { key: "closed", label: t("eventDetail.phaseEnded"), date: timeline.votingEnd },
  ];

  const activeIdx = status === "deliberation" ? 0 : status === "voting" ? 1 : status === "closed" ? 2 : -1;

  return (
    <div className="mb-6">
      <div className="flex items-center gap-0">
        {phases.map((phase, idx) => (
          <div key={phase.key} className="flex-1 flex flex-col items-center">
            <div className="flex items-center w-full">
              {idx > 0 && (
                <div className={`flex-1 h-0.5 ${idx <= activeIdx ? "bg-accent" : "bg-skeleton"}`} />
              )}
              <div className={`w-3 h-3 rounded-full shrink-0 ${
                idx < activeIdx ? "bg-accent" :
                idx === activeIdx ? "bg-accent ring-4 ring-accent/20" :
                "bg-skeleton"
              }`} />
              {idx < phases.length - 1 && (
                <div className={`flex-1 h-0.5 ${idx < activeIdx ? "bg-accent" : "bg-skeleton"}`} />
              )}
            </div>
            <span className={`text-xs mt-1.5 ${idx === activeIdx ? "text-accent-text font-medium" : "text-text-secondary"}`}>
              {phase.label}
            </span>
            <span className="text-[10px] text-text-muted">
              {formatDateTime(phase.date)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function VoteProgress({ votedCount, totalCount }: {
  votedCount: number;
  totalCount: number;
}) {
  const { t } = useTranslation("governance");
  const allDone = votedCount === totalCount;
  return (
    <span className={`text-xs font-medium shrink-0 ${allDone ? "text-success-text" : "text-warning-text"}`}>
      {t("eventDetail.votedSummary", { voted: votedCount, total: totalCount })}
    </span>
  );
}

// ---------------------------------------------------------------------------
// TopicEyebrow — renders "Parent › Child" as a subdued pretitle element
// ---------------------------------------------------------------------------

function TopicEyebrow({
  topicId,
  topicMap,
  assemblyId,
  className = "",
}: {
  topicId: string;
  topicMap: Map<string, { id: string; name: string; parentId: string | null }>;
  assemblyId?: string;
  className?: string;
}) {
  const topic = topicMap.get(topicId);
  if (!topic) return null;
  const parent = topic.parentId ? topicMap.get(topic.parentId) : null;

  const label = (tid: string, name: string) =>
    assemblyId ? (
      <Link to={`/assembly/${assemblyId}/topics/${tid}`} className="hover:text-text-secondary transition-colors">
        {name}
      </Link>
    ) : (
      <>{name}</>
    );

  return (
    <span className={`text-xs font-medium tracking-wide uppercase text-text-tertiary ${className}`}>
      {parent ? (
        <>
          {label(parent.id, parent.name)}
          <span className="mx-1 text-text-tertiary">›</span>
          {label(topic.id, topic.name)}
        </>
      ) : (
        label(topic.id, topic.name)
      )}
    </span>
  );
}

// ---------------------------------------------------------------------------
// IssueVotingCard — one card per issue
// ---------------------------------------------------------------------------

function IssueVotingCard({
  assemblyId,
  eventId,
  issueId,
  title,
  description,
  choices,
  topicId,
  cancelled,
  tally,
  weightDist,
  nameMap,
  eventStatus,
  participation,
  delegationConfig,
  resultsVisibility,
  allowVoteChange,
  proposals,
  participants,
  topics,
  candidates,
  topicNameMap,
  isCreator,
  onVoted,
}: {
  assemblyId: string;
  eventId: string;
  issueId: string;
  title: string;
  description: string;
  choices?: string[];
  topicId?: string | null;
  cancelled?: boolean;
  tally: Tally | null;
  weightDist: WeightDist | null;
  nameMap: Map<string, string>;
  eventStatus: string;
  participation: ParticipationRecord | null;
  delegationConfig: DelegationConfig;
  resultsVisibility: string;
  allowVoteChange: boolean;
  proposals: Proposal[];
  participants: Array<{ id: string; name: string }>;
  topics: Array<{ id: string; name: string; parentId: string | null; sortOrder: number }>;
  candidates?: Candidacy[];
  topicNameMap?: Map<string, string>;
  isCreator: boolean;
  onVoted: () => void;
}) {
  const { t } = useTranslation("governance");
  const { getParticipantId } = useIdentity();
  const participantId = getParticipantId(assemblyId);
  const issueStatus = useIssueStatus(assemblyId, participantId, issueId);
  const [voting, setVoting] = useState(false);
  const [voteError, setVoteError] = useState<string | null>(null);
  // Optimistic vote choice — shown immediately after voting, before refetch completes
  const [optimisticChoice, setOptimisticChoice] = useState<string | null>(null);
  // Optimistic retraction — clears voted state immediately
  const [optimisticRetracted, setOptimisticRetracted] = useState(false);
  // null = derive from issueStatus; boolean = user override (e.g. "Change vote" click)
  const [expandedOverride, setExpandedOverride] = useState<boolean | null>(null);
  const [bookletOpen, setBookletOpen] = useState(false);

  // Clear optimistic state once the real data catches up
  const optimisticRef = useRef(optimisticChoice);
  optimisticRef.current = optimisticChoice;
  useEffect(() => {
    if (optimisticRef.current && issueStatus.myVoteChoice === optimisticRef.current) {
      setOptimisticChoice(null);
    }
    if (optimisticRetracted && !issueStatus.hasVoted) {
      setOptimisticRetracted(false);
    }
  }, [issueStatus.myVoteChoice, issueStatus.hasVoted, optimisticRetracted]);

  const effectiveHasVoted = optimisticRetracted ? false : (issueStatus.hasVoted || optimisticChoice !== null);
  const effectiveChoice = optimisticRetracted ? null : (optimisticChoice ?? issueStatus.myVoteChoice);
  const expanded = expandedOverride ?? !effectiveHasVoted;

  const votingOpen = eventStatus === "voting";

  const handleVote = async (choice: string) => {
    if (!participantId) return;
    setVoting(true);
    setVoteError(null);
    try {
      await api.castVote(assemblyId, { participantId, issueId, choice });
      setOptimisticChoice(choice);
      setOptimisticRetracted(false);
      setExpandedOverride(false);
      issueStatus.refetch();
      onVoted();
    } catch (err: unknown) {
      setVoteError(err instanceof Error ? err.message : "Vote failed");
    } finally {
      setVoting(false);
    }
  };

  const handleRetract = async () => {
    if (!participantId) return;
    setVoting(true);
    setVoteError(null);
    try {
      await api.retractVote(assemblyId, issueId);
      setOptimisticChoice(null);
      setOptimisticRetracted(true);
      setExpandedOverride(null);
      issueStatus.refetch();
      onVoted();
    } catch (err: unknown) {
      setVoteError(err instanceof Error ? err.message : "Retraction failed");
    } finally {
      setVoting(false);
    }
  };

  // Build delegation chain display
  const chainNames = useMemo(() => {
    if (issueStatus.delegateChain.length <= 1) return [];
    return issueStatus.delegateChain
      .slice(1)
      .map((id) => nameMap.get(id) ?? id.slice(0, 8));
  }, [issueStatus.delegateChain, nameMap]);

  // Determine if the "needs your vote" indicator should show
  const needsVote = votingOpen && !!participantId && !effectiveHasVoted && !issueStatus.isDelegated && !issueStatus.loading;

  const topicMap = useMemo(() => new Map(topics.map((t) => [t.id, t])), [topics]);

  if (cancelled) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between opacity-50">
            {topicId && (
              <TopicEyebrow topicId={topicId} topicMap={topicMap} assemblyId={assemblyId} className="line-through" />
            )}
            <Badge color="red">{t("eventDetail.cancelled")}</Badge>
          </div>
          <h2 className="font-medium text-text-primary mt-1 line-through opacity-50">{title}</h2>
          <p className="text-sm text-text-tertiary mt-0.5">{description}</p>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        {/* Eyebrow row — topic label left, status indicators right */}
        {(topicId || needsVote || (tally?.winner && eventStatus === "closed")) && (
          <div className="flex items-center justify-between mb-1">
            {topicId ? (
              <TopicEyebrow topicId={topicId} topicMap={topicMap} assemblyId={assemblyId} />
            ) : (
              <span />
            )}
            <div className="flex items-center gap-2 shrink-0">
              {needsVote && (
                <span className="flex items-center gap-1.5 text-xs text-warning-text font-medium whitespace-nowrap">
                  <span className="w-2 h-2 rounded-full bg-warning shrink-0" />
                  {t("eventDetail.needsYourVote")}
                </span>
              )}
              {tally?.winner && eventStatus === "closed" && (
                <Badge color="green">
                  {t("eventDetail.resultLabel", { result: tally.winner === "for" ? t("eventDetail.resultApproved") : tally.winner === "against" ? t("eventDetail.resultNotApproved") : tally.winner })}
                </Badge>
              )}
            </div>
          </div>
        )}
        {/* Title row */}
        <div className="flex items-center gap-2">
          <h2 className="font-medium text-text-primary truncate">{title}</h2>
          {choices && choices.length > 0 && (
            <Badge color="blue">{t("eventDetail.nCandidates", { count: choices.length })}</Badge>
          )}
        </div>
        {/* Description + inline arguments link */}
        {description && (
          <p className="text-sm text-text-muted mt-0.5">
            {description}
            {proposals.length > 0 && eventStatus !== "deliberation" && (
              <>
                {" "}
                <button
                  onClick={() => setBookletOpen(true)}
                  className="text-accent-text hover:underline whitespace-nowrap"
                >
                  {t("eventDetail.readArguments")} →
                </button>
              </>
            )}
          </p>
        )}
        {/* Arguments link when no description */}
        {!description && proposals.length > 0 && eventStatus !== "deliberation" && (
          <button
            onClick={() => setBookletOpen(true)}
            className="text-sm text-accent-text hover:underline mt-0.5"
          >
            {t("eventDetail.readArguments")} →
          </button>
        )}
      </CardHeader>
      <CardBody className="space-y-4">
        {/* Closed event: historical participation record */}
        {eventStatus === "closed" && participantId && (
          <ClosedEventParticipation participation={participation} nameMap={nameMap} />
        )}

        {/* Open voting: unified voting section (delegation card + vote buttons) */}
        {votingOpen && participantId && !issueStatus.loading && (
          <VotingSection
            assemblyId={assemblyId}
            issueId={issueId}
            choices={choices}
            issueStatus={issueStatus}
            delegationConfig={delegationConfig}
            chainNames={chainNames}
            terminalVoterName={issueStatus.terminalVoterId ? (nameMap.get(issueStatus.terminalVoterId) ?? null) : null}
            issueTopicIds={topicId ? [topicId] : []}
            participants={participants}
            topics={topics}
            candidates={candidates}
            topicNameMap={topicNameMap}
            participantId={participantId!}
            voting={voting}
            voteError={voteError}
            expanded={expanded}
            effectiveHasVoted={effectiveHasVoted}
            effectiveChoice={effectiveChoice}
            allowVoteChange={allowVoteChange}
            onSetExpanded={setExpandedOverride}
            onVote={handleVote}
            onRetract={handleRetract}
            onDelegationCreated={() => { issueStatus.refetch(); onVoted(); }}
          />
        )}


        {/* No identity selected */}
        {!participantId && votingOpen && (
          <p className="text-sm text-text-tertiary">{t("eventDetail.selectIdentityToVote")}</p>
        )}

        {/* Results section (sealed, live toggle, or final results) */}
        <ResultsSection
          tally={tally}
          weightDist={weightDist}
          choices={choices}
          nameMap={nameMap}
          eventStatus={eventStatus}
          resultsVisibility={resultsVisibility}
        />

        {/* Action buttons — proposals (deliberation only) */}
        {eventStatus === "deliberation" && (
          <div className="flex items-center gap-2 flex-wrap pt-2">
            <Link
              to={`/assembly/${assemblyId}/proposals?issueId=${issueId}`}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-accent-text bg-accent-subtle border border-accent-muted rounded-lg hover:bg-accent-muted transition-colors"
            >
              {t("eventDetail.writeProposal")}
            </Link>
            {proposals.length > 0 && (
              <Link
                to={`/assembly/${assemblyId}/proposals?issueId=${issueId}`}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-text-secondary border border-border-default rounded-lg hover:bg-interactive-hover transition-colors"
              >
                {t("eventDetail.viewAllProposals")}
                <Badge color="gray">{proposals.length}</Badge>
              </Link>
            )}
          </div>
        )}
      </CardBody>

      {/* Voting booklet modal */}
      {bookletOpen && (
        <VotingBooklet
          assemblyId={assemblyId}
          eventId={eventId}
          issueId={issueId}
          issueTitle={title}
          issueDescription={description}
          choices={choices}
          proposals={proposals}
          eventPhase={eventStatus === "deliberation" ? "deliberation" : eventStatus === "voting" ? "voting" : "closed"}
          isCreator={isCreator}
          onClose={() => setBookletOpen(false)}
        />
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// VotingSection — delegation card + direct vote buttons
// ---------------------------------------------------------------------------

function VotingSection({
  assemblyId,
  issueId,
  choices,
  issueStatus,
  delegationConfig,
  chainNames,
  terminalVoterName,
  issueTopicIds,
  participants,
  topics,
  candidates,
  topicNameMap,
  participantId,
  voting,
  voteError,
  expanded,
  effectiveHasVoted,
  effectiveChoice,
  allowVoteChange,
  onSetExpanded,
  onVote,
  onRetract,
  onDelegationCreated,
}: {
  assemblyId: string;
  issueId: string;
  choices?: string[];
  issueStatus: ReturnType<typeof useIssueStatus>;
  delegationConfig: DelegationConfig;
  chainNames: string[];
  terminalVoterName: string | null;
  issueTopicIds: string[];
  participants: Array<{ id: string; name: string }>;
  topics: Array<{ id: string; name: string; parentId: string | null; sortOrder: number }>;
  candidates?: Candidacy[];
  topicNameMap?: Map<string, string>;
  participantId: string;
  voting: boolean;
  voteError: string | null;
  expanded: boolean;
  effectiveHasVoted: boolean;
  effectiveChoice: string | null;
  allowVoteChange: boolean;
  onSetExpanded: (v: boolean | null) => void;
  onVote: (choice: string) => void;
  onRetract: () => void;
  onDelegationCreated: () => void;
}) {
  const { t } = useTranslation("governance");
  const isMultiOption = choices && choices.length > 0;

  // Voted state (not changing): show selected choice with change option
  if (effectiveHasVoted && !expanded) {
    return (
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-success-text shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="text-sm text-text-primary">
            <Trans i18nKey="eventDetail.youVoted" ns="governance" values={{ choice: effectiveChoice }} components={{ bold: <span className="font-semibold" /> }} />
          </span>
        </div>
        {allowVoteChange && (
          <div className="flex items-center gap-3">
            <button
              onClick={() => onSetExpanded(true)}
              className="text-xs text-text-muted hover:text-text-secondary underline"
            >
              {t("eventDetail.changeVote")}
            </button>
            {delegationConfig.enabled && (
              <button
                onClick={onRetract}
                disabled={voting}
                className="text-xs text-text-muted hover:text-text-secondary underline disabled:opacity-50"
              >
                {t("eventDetail.letDelegateDecide")}
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  const [showDelegateForm, setShowDelegateForm] = useState(false);

  // Voting state: show vote buttons OR delegation form (mutually exclusive per v13 design)
  return (
    <div className="space-y-3">
      {showDelegateForm ? (
        /* Delegation form replaces voting buttons */
        <QuickDelegateForm
          assemblyId={assemblyId}
          participantId={participantId}
          participants={participants}
          preselectedTopicIds={issueTopicIds}
          topics={topics}
          isTopicScoped={delegationConfig.topicScoped}
          issueId={issueId}
          candidates={candidates}
          topicNameMap={topicNameMap}
          onCreated={() => { setShowDelegateForm(false); onDelegationCreated(); }}
          onClose={() => setShowDelegateForm(false)}
        />
      ) : (
        <>
          {/* Vote buttons — full width, prominent */}
          <div>
            {effectiveHasVoted && (
              <span className="text-xs text-text-muted mb-2 block">{t("eventDetail.changeYourVote")}</span>
            )}
            {issueStatus.isDelegated && !effectiveHasVoted && (
              <span className="text-xs text-text-muted mb-2 block">{t("eventDetail.orVoteDirectly")}</span>
            )}

            {isMultiOption ? (
              <div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {choices.map((choice) => (
                    <button
                      key={choice}
                      onClick={() => onVote(choice)}
                      disabled={voting}
                      className="w-full px-4 py-3 text-sm font-semibold text-text-primary bg-surface-raised border border-border-default rounded-xl hover:bg-interactive-hover active:scale-[0.97] transition-all disabled:opacity-50"
                    >
                      {choice}
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => onVote("abstain")}
                  disabled={voting}
                  className="mt-2 text-sm text-text-muted hover:text-text-secondary underline disabled:opacity-50 min-h-[36px] flex items-center"
                >
                  {t("eventDetail.voteAbstain")}
                </button>
              </div>
            ) : (
              <div className="flex flex-col sm:flex-row gap-2">
                <button
                  onClick={() => onVote("for")}
                  disabled={voting}
                  className="flex-1 px-4 py-3 text-sm font-semibold text-text-primary bg-surface-raised border border-border-default rounded-xl hover:bg-interactive-hover active:scale-[0.97] transition-all disabled:opacity-50"
                >
                  {t("eventDetail.voteFor")}
                </button>
                <button
                  onClick={() => onVote("against")}
                  disabled={voting}
                  className="flex-1 px-4 py-3 text-sm font-semibold text-text-primary bg-surface-raised border border-border-default rounded-xl hover:bg-interactive-hover active:scale-[0.97] transition-all disabled:opacity-50"
                >
                  {t("eventDetail.voteAgainst")}
                </button>
                <button
                  onClick={() => onVote("abstain")}
                  disabled={voting}
                  className="flex-1 px-4 py-3 text-sm font-semibold text-text-muted bg-surface-raised border border-border-default rounded-xl hover:bg-interactive-hover active:scale-[0.97] transition-all disabled:opacity-50"
                >
                  {t("eventDetail.voteAbstain")}
                </button>
              </div>
            )}

            {voteError && <p className="text-sm text-error-text mt-2">{voteError}</p>}

            {/* Cancel button when changing an existing vote */}
            {effectiveHasVoted && (
              <button
                onClick={() => onSetExpanded(false)}
                className="text-xs text-text-muted hover:text-text-secondary underline mt-2"
              >
                {t("common:cancel")}
              </button>
            )}

            {/* "Trust someone else" trigger — centered below vote buttons */}
            {delegationConfig.enabled && !issueStatus.isDelegated && (
              <QuickDelegateTrigger onClick={() => setShowDelegateForm(true)} />
            )}
          </div>

          {/* Delegation info (already delegated state) */}
          <DelegationCard
            assemblyId={assemblyId}
            issueId={issueId}
            delegationConfig={delegationConfig}
            isDelegated={issueStatus.isDelegated}
            hasVoted={issueStatus.hasVoted}
            chainNames={chainNames}
            terminalVoterName={terminalVoterName}
            issueTopicIds={issueTopicIds}
            participants={participants}
            topics={topics}
            candidates={candidates}
            topicNameMap={topicNameMap}
            participantId={participantId}
            onDelegationCreated={onDelegationCreated}
          />
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// DelegationCard — shown at the top of VotingSection
// ---------------------------------------------------------------------------

function DelegationCard({
  assemblyId,
  issueId,
  delegationConfig,
  isDelegated,
  hasVoted,
  chainNames,
  terminalVoterName,
  issueTopicIds,
  participants,
  topics,
  candidates,
  topicNameMap,
  participantId,
  onDelegationCreated,
}: {
  assemblyId: string;
  issueId: string;
  delegationConfig: DelegationConfig;
  isDelegated: boolean;
  hasVoted: boolean;
  chainNames: string[];
  terminalVoterName: string | null;
  issueTopicIds: string[];
  participants: Array<{ id: string; name: string }>;
  topics: Array<{ id: string; name: string; parentId: string | null; sortOrder: number }>;
  candidates?: Candidacy[];
  topicNameMap?: Map<string, string>;
  participantId: string;
  onDelegationCreated: () => void;
}) {
  const { t } = useTranslation("governance");
  const [showForm, setShowForm] = useState(false);

  // State 1: Active delegation (and no direct vote override)
  if (isDelegated && !hasVoted) {
    const delegateName = terminalVoterName ?? chainNames[chainNames.length - 1];
    const chainDisplay = chainNames.join(" \u2192 ");
    return (
      <div className="flex items-center justify-between flex-wrap gap-2 px-3 py-2.5 rounded-lg bg-info-subtle border border-info-border">
        <div className="flex items-center gap-2 min-w-0">
          <svg className="w-4 h-4 text-info-text shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {delegateName && <Avatar name={delegateName} size="xs" />}
          <span className="text-sm text-info-text truncate">
            {t("eventDetail.delegatedTo", { name: delegateName })}
            {chainNames.length > 1 && (
              <span className="text-info-text ml-1">{t("eventDetail.delegatedVia", { chain: chainDisplay })}</span>
            )}
          </span>
        </div>
        <Link
          to={`/assembly/${assemblyId}/delegations`}
          className="text-xs text-info-text hover:text-info-text underline min-h-[32px] flex items-center shrink-0"
        >
          {t("eventDetail.manageDelegation")}
        </Link>
      </div>
    );
  }

  // State 2: Delegation enabled but not set up — trigger is now in VotingSection
  // (the "Trust someone else with this vote" button below vote buttons)
  if (delegationConfig.enabled) {
    return null;
  }

  // State 3: Delegation not available for this assembly
  return (
    <Tooltip text="This group's governance rules don't include delegation">
      <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-surface border border-border-subtle w-full opacity-60">
        <svg className="w-4 h-4 text-text-tertiary shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
        </svg>
        <span className="text-xs text-text-tertiary">{t("eventDetail.delegationNotAvailable")}</span>
      </div>
    </Tooltip>
  );
}

// ---------------------------------------------------------------------------
// ResultsSection — sealed, live toggle, or final results
// ---------------------------------------------------------------------------

function ResultsSection({
  tally,
  weightDist,
  choices,
  nameMap,
  eventStatus,
  resultsVisibility,
}: {
  tally: Tally | null;
  weightDist: WeightDist | null;
  choices?: string[];
  nameMap: Map<string, string>;
  eventStatus: string;
  resultsVisibility: string;
}) {
  const { t } = useTranslation("governance");
  const [showLiveResults, setShowLiveResults] = useState(false);
  const [showLiveWeights, setShowLiveWeights] = useState(false);
  const [showWeights, setShowWeights] = useState(false);

  const totalVotes = tally?.totalVotes ?? 0;
  const votingOpen = eventStatus === "voting";
  const isSealed = tally?.sealed === true;
  const isLive = resultsVisibility === "live" && votingOpen && !isSealed;

  // Sealed results — indicator is shown in the event header, nothing per-issue
  if (isSealed) {
    return null;
  }

  // Live results during open voting — behind a click
  if (isLive) {
    const hasWeights = weightDist && Object.keys(weightDist.weights).length > 0;

    return (
      <div className="space-y-2">
        {!showLiveResults && totalVotes > 0 && (
          <button
            onClick={() => setShowLiveResults(true)}
            className="text-sm text-text-muted hover:text-text-secondary flex items-center gap-1.5"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
            {t("eventDetail.viewLiveResults")}
          </button>
        )}

        {showLiveResults && tally && totalVotes > 0 && (
          <div className="rounded-lg border border-warning-border bg-warning-subtle p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 text-warning" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
                </svg>
                <span className="text-sm font-medium text-warning-text">{t("eventDetail.liveResults")}</span>
                <Badge color="yellow">{t("eventDetail.votingOpen")}</Badge>
              </div>
              <button
                onClick={() => { setShowLiveResults(false); setShowLiveWeights(false); }}
                className="text-xs text-warning-text hover:text-warning-text underline"
              >
                {t("common:hide")}
              </button>
            </div>
            <TallyBars tally={tally} choices={choices} totalVotes={totalVotes} />

            {/* Optional weight breakdown inside the results panel */}
            {hasWeights && (
              <div className="mt-3 pt-3 border-t border-warning-border">
                {!showLiveWeights ? (
                  <button
                    onClick={() => setShowLiveWeights(true)}
                    className="text-xs text-warning-text hover:text-warning-text flex items-center gap-1"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                    </svg>
                    {t("eventDetail.showBreakdown")}
                  </button>
                ) : (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-medium text-warning-text">{t("eventDetail.liveBreakdown")}</span>
                      <button
                        onClick={() => setShowLiveWeights(false)}
                        className="text-xs text-warning-text hover:text-warning-text underline"
                      >
                        {t("common:hide")}
                      </button>
                    </div>
                    <WeightBreakdown weightDist={weightDist} nameMap={nameMap} />
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {totalVotes === 0 && (
          <p className="text-sm text-text-tertiary">{t("eventDetail.noVotesCast")}</p>
        )}
      </div>
    );
  }

  // Final results (closed events) or non-live open voting — show automatically
  return (
    <div className="space-y-3">
      {tally && totalVotes > 0 && (
        <div>
          <h3 className="text-sm font-medium text-text-secondary mb-2">{t("eventDetail.results")}</h3>
          <TallyBars tally={tally} choices={choices} totalVotes={totalVotes} />
        </div>
      )}

      {/* Weight breakdown — collapsible */}
      {weightDist && Object.keys(weightDist.weights).length > 0 && (
        <div>
          <button
            onClick={() => setShowWeights(!showWeights)}
            className="text-sm font-medium text-text-muted hover:text-text-secondary flex items-center gap-1"
          >
            <svg className={`w-4 h-4 transition-transform ${showWeights ? "rotate-90" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
            {t("eventDetail.voteBreakdown")}
          </button>
          {showWeights && <WeightBreakdown weightDist={weightDist} nameMap={nameMap} />}
        </div>
      )}

      {tally && totalVotes === 0 && (
        <p className="text-sm text-text-tertiary">No votes cast yet.</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// TallyBars — vote count bars (reused for live and final)
// ---------------------------------------------------------------------------

function TallyBars({
  tally,
  choices,
  totalVotes,
}: {
  tally: Tally;
  choices?: string[];
  totalVotes: number;
}) {
  const { t } = useTranslation("governance");
  return (
    <div>
      <div className="space-y-3">
        {Object.entries(
            choices && choices.length > 0
              ? { ...Object.fromEntries(choices.map((c) => [c, 0])), ...tally.counts }
              : tally.counts,
          )
          .sort(([, a], [, b]) => b - a)
          .map(([choice, count], idx) => {
            const pct = totalVotes > 0 ? (count / totalVotes) * 100 : 0;
            const barColor = TALLY_COLORS[idx % TALLY_COLORS.length];
            return (
              <div key={choice}>
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="font-medium text-text-primary capitalize">{choice}</span>
                  <span className="text-text-muted">
                    {t("eventDetail.vote", { count })} ({pct.toFixed(0)}%)
                  </span>
                </div>
                <div className="w-full bg-surface-sunken rounded-full h-4 sm:h-3">
                  <div
                    className={`h-4 sm:h-3 rounded-full transition-all ${barColor}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
      </div>
      <div className="flex flex-col sm:flex-row sm:gap-4 mt-3 text-xs text-text-tertiary gap-0.5">
        <span>{t("eventDetail.votesTotal", { count: tally.totalVotes })}</span>
        <span>{t("eventDetail.membersVotedOf", { participating: tally.participatingCount, eligible: tally.eligibleCount })}</span>
        <span>
          {tally.quorumMet
            ? t("eventDetail.quorumMet")
            : t("eventDetail.quorumNotMet", { threshold: (tally.quorumThreshold * 100).toFixed(0) })}
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// WeightBreakdown — per-participant weight grid (reused for live and final)
// ---------------------------------------------------------------------------

function WeightBreakdown({
  weightDist,
  nameMap,
}: {
  weightDist: WeightDist;
  nameMap: Map<string, string>;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 mt-2">
      {Object.entries(weightDist.weights)
        .sort(([, a], [, b]) => b - a)
        .map(([pid, weight]) => (
          <div key={pid} className="flex items-center justify-between text-sm bg-surface rounded-md px-3 py-2.5 min-h-[44px] sm:min-h-0 sm:py-2">
            <span className="flex items-center gap-2 text-text-secondary">
              <Avatar name={nameMap.get(pid) ?? pid} size="xs" />
              {nameMap.get(pid) ?? pid.slice(0, 8)}
            </span>
            <span className="font-semibold text-text-primary">
              {weight === 1 ? "1" : weight.toFixed(0)}
              {weight > 1 && (
                <span className="text-xs text-text-tertiary ml-1">
                  (1+{(weight - 1).toFixed(0)})
                </span>
              )}
            </span>
          </div>
        ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ClosedEventParticipation — historical record for closed events (unchanged)
// ---------------------------------------------------------------------------

/** Shows what happened with your vote on a closed event, using materialized participation records. */
function ClosedEventParticipation({
  participation,
  nameMap,
}: {
  participation: ParticipationRecord | null;
  nameMap: Map<string, string>;
}) {
  const { t } = useTranslation("governance");
  // No participation data yet (still loading, or no identity)
  if (!participation) {
    return (
      <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-surface border border-border-default">
        <div className="w-2 h-2 rounded-full bg-text-tertiary" />
        <span className="text-sm text-text-muted">{t("eventDetail.votingClosed")}</span>
      </div>
    );
  }

  // Voted directly — your own direct vote is always visible to you
  if (participation.status === "direct") {
    return (
      <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-success-subtle border border-success-border">
        <svg className="w-4 h-4 text-success shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <span className="text-sm text-success-text">
          <Trans i18nKey="eventDetail.youVotedDirectly" ns="governance" values={{ choice: participation.effectiveChoice ?? "\u2014" }} components={{ bold: <span className="font-semibold" /> }} />
        </span>
      </div>
    );
  }

  // Delegated — show chain. effectiveChoice may be null under secret ballot.
  if (participation.status === "delegated") {
    const chainDisplay = participation.chain
      .slice(1) // skip self
      .map((id) => nameMap.get(id) ?? id.slice(0, 8))
      .join(" → ");
    const terminalName = participation.terminalVoterId
      ? (nameMap.get(participation.terminalVoterId) ?? participation.terminalVoterId.slice(0, 8))
      : null;
    const choiceHidden = participation.effectiveChoice === null;

    return (
      <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-info-subtle border border-info-border">
        <svg className="w-4 h-4 text-info-text shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
        </svg>
        <span className="text-sm text-info-text">
          {choiceHidden ? (
            <>
              {t("eventDetail.yourVoteCastVia", { name: terminalName ?? "" })}
              {chainDisplay && (
                <span className="text-info-text ml-1">({chainDisplay})</span>
              )}
              <span className="text-info-text ml-1">{t("eventDetail.secretBallot")}</span>
            </>
          ) : (
            <>
              {t("eventDetail.yourVoteCountedAs", { choice: participation.effectiveChoice, name: terminalName ?? "" })}
              {chainDisplay && (
                <span className="text-info-text ml-1">({chainDisplay})</span>
              )}
            </>
          )}
        </span>
      </div>
    );
  }

  // Absent — did not participate
  return (
    <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-surface border border-border-default">
      <svg className="w-4 h-4 text-text-tertiary shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
      </svg>
      <span className="text-sm text-text-muted">{t("eventDetail.didNotParticipate")}</span>
    </div>
  );
}

/**
 * Hook + utility for resolving which topics the current user has delegated.
 *
 * Delegation scope resolution (highest precedence first):
 * 1. Child topic — delegation scoped to "Youth" covers Youth only
 * 2. Root topic — delegation scoped to "Programs" covers Programs + Youth + Adult
 * 3. Global — delegation with empty topicScope covers all topics
 *
 * More specific scopes override less specific ones.
 */

import { useMemo } from "react";
import { useParams } from "react-router";
import { useApi } from "./use-api.js";
import { useIdentity } from "./use-identity.js";
import * as api from "../api/client.js";
import type { Delegation, Topic } from "../api/types.js";

export interface TopicDelegationStatus {
  /** The participant ID of the delegate. */
  delegateId: string;
  /** Display name of the delegate. */
  delegateName: string;
  /** How this topic is covered. */
  reason: "direct" | "inherited" | "global";
  /** Display name for the reason: e.g. "Delegated to Sam" or "Via Programs → Sam". */
  label: string;
}

/**
 * Resolve delegation status for a single topic.
 * Returns null if the topic is not delegated.
 */
export function resolveTopicDelegation(
  topicId: string,
  topics: Topic[],
  myDelegations: Delegation[],
  participantNames: Map<string, string>,
): TopicDelegationStatus | null {
  if (myDelegations.length === 0) return null;

  const topic = topics.find((t) => t.id === topicId);
  if (!topic) return null;

  const nameOf = (id: string) => participantNames.get(id) ?? "someone";

  // 1. Direct match — delegation scoped to this exact topic
  const direct = myDelegations.find(
    (d) => d.topicScope.length > 0 && d.topicScope.includes(topicId),
  );
  if (direct) {
    return {
      delegateId: direct.targetId,
      delegateName: nameOf(direct.targetId),
      reason: "direct",
      label: `Delegated to ${nameOf(direct.targetId)}`,
    };
  }

  // 2. Inherited from parent — if this is a child topic, check if the parent is delegated
  if (topic.parentId) {
    const parentMatch = myDelegations.find(
      (d) => d.topicScope.length > 0 && d.topicScope.includes(topic.parentId!),
    );
    if (parentMatch) {
      const parentTopic = topics.find((t) => t.id === topic.parentId);
      const parentName = parentTopic?.name ?? "parent";
      return {
        delegateId: parentMatch.targetId,
        delegateName: nameOf(parentMatch.targetId),
        reason: "inherited",
        label: `Via ${parentName} → ${nameOf(parentMatch.targetId)}`,
      };
    }
  }

  // 3. Global delegation (empty topicScope AND no issueScope — issue-scoped delegations are not global)
  const global = myDelegations.find((d) => d.topicScope.length === 0 && !d.issueScope);
  if (global) {
    return {
      delegateId: global.targetId,
      delegateName: nameOf(global.targetId),
      reason: "global",
      label: `Global delegation → ${nameOf(global.targetId)}`,
    };
  }

  return null;
}

/**
 * Resolve delegation status for a root topic, considering its children too.
 * A root topic is "covered" if it itself is delegated, or if there's a global delegation.
 * Individual children may have different delegates (more specific overrides).
 */
export function resolveRootTopicDelegation(
  rootTopicId: string,
  topics: Topic[],
  myDelegations: Delegation[],
  participantNames: Map<string, string>,
): TopicDelegationStatus | null {
  return resolveTopicDelegation(rootTopicId, topics, myDelegations, participantNames);
}

/**
 * Hook that fetches the current user's outgoing delegations for the current group.
 * Also fetches participant names for delegate display.
 */
export function useMyDelegations() {
  const { groupId } = useParams();
  const { getParticipantId } = useIdentity();
  const myParticipantId = groupId ? getParticipantId(groupId) : null;

  const { data: delegationsData } = useApi(
    () => myParticipantId ? api.listDelegations(groupId!, myParticipantId) : Promise.resolve({ delegations: [] }),
    [groupId, myParticipantId],
  );

  const { data: participantsData } = useApi(
    () => groupId ? api.listParticipants(groupId) : Promise.resolve({ participants: [] }),
    [groupId],
  );

  const myDelegations = delegationsData?.delegations ?? [];
  const participantNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of participantsData?.participants ?? []) {
      map.set(p.id, p.name);
    }
    return map;
  }, [participantsData]);

  return { myDelegations, participantNames };
}

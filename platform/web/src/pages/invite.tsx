/**
 * Invite landing page — public group preview for invite links.
 *
 * Shows group name, governance rules, leadership, and member count.
 * Allows joining if authenticated, or redirects to signup first.
 */

import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router";
import { useIdentity } from "../hooks/use-identity.js";
import { Card, CardBody, Button, Spinner, ErrorBox, Badge } from "../components/ui.js";
import { Avatar } from "../components/avatar.js";
import { presetLabel } from "../lib/presets.js";
import type { GovernanceConfig } from "../api/types.js";

const BASE_URL = import.meta.env.VITE_API_BASE_URL || "/api";

interface GroupPreview {
  invitation: { id: string; type: string; assemblyId: string };
  group: {
    id: string;
    name: string;
    config: GovernanceConfig;
    owners: Array<{ participantId: string; name: string | null }>;
    admins: Array<{ participantId: string; name: string | null }>;
    memberCount: number;
  };
}

/** Generate plain-language rules from config (same logic as assembly-dashboard). */
function summarizeRules(config: GovernanceConfig): string[] {
  const rules: string[] = [];

  if (config.delegation.delegationMode === "none") {
    rules.push("Every member votes directly on every question");
  } else if (config.delegation.delegationMode === "candidacy") {
    rules.push("Members can delegate their vote to trusted candidates" + (config.delegation.topicScoped ? " by topic" : ""));
  } else {
    rules.push("Members can delegate their vote to any other member" + (config.delegation.topicScoped ? " by topic" : ""));
  }

  const tl = config.timeline;
  if (tl) {
    const parts = [`${tl.deliberationDays} day${tl.deliberationDays !== 1 ? "s" : ""} for deliberation`];
    if (tl.curationDays > 0) parts.push(`${tl.curationDays} day${tl.curationDays !== 1 ? "s" : ""} for curation`);
    parts.push(`${tl.votingDays} day${tl.votingDays !== 1 ? "s" : ""} to vote`);
    rules.push(parts.join(", then "));
  }

  if (config.ballot.secrecy === "secret") {
    rules.push("Ballots are secret; results revealed after voting ends");
  }
  if (config.ballot.allowVoteChange) {
    rules.push("You can change your vote before voting closes");
  }
  if (config.features.communityNotes) {
    rules.push("Community notes help verify claims in proposals");
  }
  if (config.features.surveys) {
    rules.push("Surveys capture member observations for accountability");
  }

  return rules;
}

export function InvitePage() {
  const { token } = useParams();
  const navigate = useNavigate();
  const { storeUserId } = useIdentity();
  const [preview, setPreview] = useState<GroupPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const res = await fetch(`${BASE_URL}/invite/${token}`);
        if (!res.ok) {
          const data = await res.json().catch(() => ({})) as { error?: { message?: string } };
          setError(data?.error?.message ?? "Invitation not found");
          return;
        }
        setPreview(await res.json() as GroupPreview);
      } catch {
        setError("Failed to load invitation");
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  const handleJoin = async () => {
    if (!storeUserId || !token) return;
    setJoining(true);
    setJoinError(null);
    try {
      const accessToken = localStorage.getItem("votiverse_access_token");
      const res = await fetch(`${BASE_URL}/invite/${token}/accept`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: { message?: string } };
        setJoinError(data?.error?.message ?? "Failed to join");
        return;
      }
      const data = await res.json() as { assemblyId: string };
      navigate(`/assembly/${data.assemblyId}`);
    } catch {
      setJoinError("Failed to join group");
    } finally {
      setJoining(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-lg mx-auto py-16 text-center">
        <Spinner />
      </div>
    );
  }

  if (error || !preview) {
    return (
      <div className="max-w-lg mx-auto py-16">
        <ErrorBox message={error ?? "Invitation not found"} />
      </div>
    );
  }

  const { group } = preview;
  const rules = summarizeRules(group.config);
  const isLoggedIn = !!storeUserId;

  return (
    <div className="max-w-lg mx-auto py-8 sm:py-16">
      {/* Group identity */}
      <div className="text-center mb-6">
        <div className="w-16 h-16 bg-brand rounded-xl flex items-center justify-center mx-auto mb-4">
          <span className="text-white font-bold text-3xl">{group.name.charAt(0).toUpperCase()}</span>
        </div>
        <h1 className="text-xl sm:text-2xl font-semibold text-gray-900">
          {group.name}
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          You've been invited to join this group
        </p>
      </div>

      {/* Governance rules */}
      <Card className="mb-4">
        <CardBody>
          <div className="flex items-center gap-2 mb-3">
            <h2 className="text-sm font-semibold text-gray-700">Governance Rules</h2>
            <Badge color="gray">{presetLabel(group.config.name)}</Badge>
          </div>
          <ul className="space-y-1.5">
            {rules.map((rule, i) => (
              <li key={i} className="text-sm text-gray-600 flex items-start gap-2">
                <span className="text-gray-400 mt-0.5 shrink-0">-</span>
                <span>{rule}</span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-gray-400 mt-3">
            These rules are permanent and apply to all votes in this group.
          </p>
        </CardBody>
      </Card>

      {/* Leadership */}
      {(group.owners.length > 0 || group.admins.length > 0) && (
        <Card className="mb-4">
          <CardBody>
            <h2 className="text-sm font-semibold text-gray-700 mb-2">Leadership</h2>
            <div className="flex flex-wrap gap-3">
              {group.owners.map((o) => (
                <div key={o.participantId} className="flex items-center gap-1.5">
                  <Avatar name={o.name ?? "?"} size="xs" />
                  <span className="text-sm text-gray-700">{o.name ?? "Owner"}</span>
                  <Badge color="blue">Owner</Badge>
                </div>
              ))}
              {group.admins.map((a) => (
                <div key={a.participantId} className="flex items-center gap-1.5">
                  <Avatar name={a.name ?? "?"} size="xs" />
                  <span className="text-sm text-gray-700">{a.name ?? "Admin"}</span>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>
      )}

      {/* Member count */}
      <p className="text-sm text-gray-500 text-center mb-6">
        {group.memberCount} member{group.memberCount !== 1 ? "s" : ""}
      </p>

      {/* Action */}
      {joinError && <ErrorBox message={joinError} />}

      {isLoggedIn ? (
        <Button onClick={handleJoin} disabled={joining} className="w-full">
          {joining ? "Joining..." : "Join this group"}
        </Button>
      ) : (
        <div className="space-y-3">
          <Button onClick={() => navigate(`/?redirect=/invite/${token}`)} className="w-full">
            Log in to join
          </Button>
          <p className="text-xs text-gray-400 text-center">
            Don't have an account? You'll be able to create one.
          </p>
        </div>
      )}
    </div>
  );
}

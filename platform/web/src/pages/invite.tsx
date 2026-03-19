/**
 * Invite landing page — public group preview for invite links.
 *
 * Shows group name, governance rules, leadership, member count, and admission mode.
 * In approval mode, the join button creates a request instead of instant membership.
 */

import { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router";
import { useIdentity } from "../hooks/use-identity.js";
import { Card, CardBody, Button, Spinner, ErrorBox, Badge } from "../components/ui.js";
import { Avatar } from "../components/avatar.js";
import { presetLabel, summarizeRules, describeAdmissionMode } from "../lib/presets.js";
import type { GovernanceConfig } from "../api/types.js";

const BASE_URL = import.meta.env.VITE_API_BASE_URL || "/api";

interface GroupPreview {
  invitation: { id: string; type: string; assemblyId: string };
  group: {
    id: string;
    name: string;
    config: GovernanceConfig;
    admissionMode?: string;
    owners: Array<{ participantId: string; name: string | null }>;
    admins: Array<{ participantId: string; name: string | null }>;
    memberCount: number;
  };
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
  const [requestSent, setRequestSent] = useState(false);

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
      const data = await res.json() as { status: string; assemblyId: string };

      if (data.status === "pending") {
        // Approval mode — request created, not joined yet
        setRequestSent(true);
      } else {
        // Open mode — instant join
        navigate(`/assembly/${data.assemblyId}`);
      }
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
  const admissionMode = group.admissionMode ?? "approval";
  const isApprovalMode = admissionMode === "approval";

  // Request submitted — show confirmation
  if (requestSent) {
    return (
      <div className="max-w-lg mx-auto py-8 sm:py-16 text-center">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h1 className="text-xl font-semibold text-gray-900 mb-2">Request submitted</h1>
        <p className="text-sm text-gray-500 mb-6">
          Your request to join <span className="font-medium">{group.name}</span> has been sent.
          An admin will review it shortly.
        </p>
        <Link to="/dashboard" className="text-sm text-brand hover:text-brand-light">
          Back to dashboard
        </Link>
      </div>
    );
  }

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
            <li className="text-sm text-gray-600 flex items-start gap-2">
              <span className="text-gray-400 mt-0.5 shrink-0">-</span>
              <span>{describeAdmissionMode(admissionMode)}</span>
            </li>
          </ul>
          <p className="text-xs text-gray-400 mt-3">
            Governance rules are permanent and apply to all votes in this group.
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
        <div className="space-y-2">
          <Button onClick={handleJoin} disabled={joining} className="w-full">
            {joining
              ? (isApprovalMode ? "Requesting..." : "Joining...")
              : (isApprovalMode ? "Request to join" : "Join this group")}
          </Button>
          {isApprovalMode && (
            <p className="text-xs text-gray-400 text-center">
              An admin will review your request before you can participate.
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <Button onClick={() => navigate(`/?redirect=/invite/${token}`)} className="w-full">
            Log in to {isApprovalMode ? "request to join" : "join"}
          </Button>
          <p className="text-xs text-gray-400 text-center">
            Don't have an account? You'll be able to create one.
          </p>
        </div>
      )}
    </div>
  );
}

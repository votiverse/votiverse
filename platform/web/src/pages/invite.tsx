/**
 * Invite landing page — public group preview for invite links.
 *
 * Shows group name, governance rules, leadership, member count, and admission mode.
 * In approval mode, the join button creates a request instead of instant membership.
 */

import { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router";
import { useTranslation, Trans } from "react-i18next";
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
  const { t } = useTranslation("onboarding");
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
          setError(data?.error?.message ?? t("invite.notFound"));
          return;
        }
        setPreview(await res.json() as GroupPreview);
      } catch {
        setError(t("invite.loadFailed"));
      } finally {
        setLoading(false);
      }
    })();
  }, [token, t]);

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
        setJoinError(data?.error?.message ?? t("invite.joinFailed"));
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
      setJoinError(t("invite.joinFailed"));
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
        <ErrorBox message={error ?? t("invite.notFound")} />
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
        <h1 className="text-xl font-semibold text-gray-900 mb-2">{t("invite.requestSubmitted")}</h1>
        <p className="text-sm text-gray-500 mb-6">
          <Trans
            i18nKey="invite.requestSentMessage"
            ns="onboarding"
            values={{ name: group.name }}
            components={{ bold: <span className="font-medium" /> }}
          />
        </p>
        <Link to="/dashboard" className="text-sm text-brand hover:text-brand-light">
          {t("invite.backToDashboard")}
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
          {t("invite.youveBeenInvited")}
        </p>
      </div>

      {/* Governance rules */}
      <Card className="mb-4">
        <CardBody>
          <div className="flex items-center gap-2 mb-3">
            <h2 className="text-sm font-semibold text-gray-700">{t("invite.governanceRules")}</h2>
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
            {t("invite.governancePermanent")}
          </p>
        </CardBody>
      </Card>

      {/* Leadership */}
      {(group.owners.length > 0 || group.admins.length > 0) && (
        <Card className="mb-4">
          <CardBody>
            <h2 className="text-sm font-semibold text-gray-700 mb-2">{t("invite.leadership")}</h2>
            <div className="flex flex-wrap gap-3">
              {group.owners.map((o) => (
                <div key={o.participantId} className="flex items-center gap-1.5">
                  <Avatar name={o.name ?? "?"} size="xs" />
                  <span className="text-sm text-gray-700">{o.name ?? t("invite.owner")}</span>
                  <Badge color="blue">{t("invite.owner")}</Badge>
                </div>
              ))}
              {group.admins.map((a) => (
                <div key={a.participantId} className="flex items-center gap-1.5">
                  <Avatar name={a.name ?? "?"} size="xs" />
                  <span className="text-sm text-gray-700">{a.name ?? t("invite.admin")}</span>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>
      )}

      {/* Member count */}
      <p className="text-sm text-gray-500 text-center mb-6">
        {t("invite.memberCount", { count: group.memberCount })}
      </p>

      {/* Action */}
      {joinError && <ErrorBox message={joinError} />}

      {isLoggedIn ? (
        <div className="space-y-2">
          <Button onClick={handleJoin} disabled={joining} className="w-full">
            {joining
              ? (isApprovalMode ? t("invite.requesting") : t("invite.joining"))
              : (isApprovalMode ? t("invite.requestToJoin") : t("invite.joinGroup"))}
          </Button>
          {isApprovalMode && (
            <p className="text-xs text-gray-400 text-center">
              {t("invite.approvalHint")}
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <Button onClick={() => navigate(`/login?redirect=/invite/${token}`)} className="w-full">
            {isApprovalMode ? t("invite.loginToRequest") : t("invite.loginToJoin")}
          </Button>
          <p className="text-xs text-gray-400 text-center">
            {t("invite.noAccount")}
          </p>
        </div>
      )}
    </div>
  );
}

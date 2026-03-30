import { useState } from "react";
import { useParams } from "react-router";
import { useTranslation } from "react-i18next";
import { formatDate } from "../lib/format.js";
import { useApi } from "../hooks/use-api.js";
import * as api from "../api/client.js";
import { Card, CardBody, Button, Input, Label, Select, Spinner, ErrorBox, EmptyState, Badge } from "../components/ui.js";
import { Avatar } from "../components/avatar.js";
import { BulkInvite } from "../components/bulk-invite.js";
import type { AdmissionMode } from "../api/types.js";

export function Members() {
  const { t } = useTranslation("governance");
  const { groupId } = useParams();
  const { data, loading, error, refetch } = useApi(() => api.listParticipants(groupId!), [groupId]);
  const { data: settingsData, refetch: refetchSettings } = useApi(() => api.getGroupSettings(groupId!), [groupId]);
  const [showSettings, setShowSettings] = useState(false);
  const { data: joinRequestsData, refetch: refetchJoinRequests } = useApi(() => api.listJoinRequests(groupId!).catch(() => ({ joinRequests: [] })), [groupId]);
  const [adding, setAdding] = useState(false);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [inviteExpiresAt, setInviteExpiresAt] = useState<string | null>(null);
  const [inviteCopied, setInviteCopied] = useState(false);
  const [showDirectInvite, setShowDirectInvite] = useState(false);
  const [showBulkInvite, setShowBulkInvite] = useState(false);

  const admissionMode = (settingsData?.admissionMode ?? "approval") as AdmissionMode;
  const pendingRequests = joinRequestsData?.joinRequests ?? [];

  const handleGenerateInvite = async () => {
    try {
      const result = await api.createInviteLink(groupId!) as { token: string; expiresAt?: string };
      const link = `${window.location.origin}/invite/${result.token}`;
      setInviteLink(link);
      setInviteExpiresAt(result.expiresAt ?? null);
      await navigator.clipboard.writeText(link);
      setInviteCopied(true);
      setTimeout(() => setInviteCopied(false), 3000);
    } catch {
      // silently fail — the button text indicates the action
    }
  };

  if (loading) return <Spinner />;
  if (error) return <ErrorBox message={error} onRetry={refetch} />;

  const participants = data?.participants ?? [];

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <h1 className="text-xl sm:text-2xl font-bold font-display text-text-primary">{t("members.title")}</h1>
        <div className="flex gap-2">
          {admissionMode !== "invite-only" && (
            <Button variant="secondary" onClick={handleGenerateInvite}>
              {inviteCopied ? t("members.inviteLinkCopied") : t("members.inviteLink")}
            </Button>
          )}
          <Button variant="secondary" onClick={() => setShowDirectInvite(!showDirectInvite)}>
            {t("members.inviteByHandle")}
          </Button>
          {admissionMode !== "invite-only" && (
            <Button variant="secondary" onClick={() => setShowBulkInvite(!showBulkInvite)}>
              {t("members.bulkInvite")}
            </Button>
          )}
          <Button onClick={() => setAdding(true)}>{t("members.addMember")}</Button>
        </div>
      </div>

      {/* Admission mode indicator + settings */}
      <div className="flex items-center gap-3 mb-4 text-sm">
        <span className="text-text-muted">
          {t("members.admissionLabel")} <span className="font-medium text-text-secondary">
            {admissionMode === "approval" ? t("members.admissionApproval") : admissionMode === "open" ? t("members.admissionOpen") : t("members.admissionInviteOnly")}
          </span>
        </span>
        <button
          onClick={() => setShowSettings(!showSettings)}
          className="text-accent-text hover:text-accent-text text-xs font-medium"
        >
          {showSettings ? t("members.hideSettings") : t("members.changeSettings")}
        </button>
      </div>

      {showSettings && (
        <GroupSettings
          groupId={groupId!}
          currentMode={admissionMode}
          currentWebsiteUrl={settingsData?.websiteUrl ?? null}
          currentVoteCreation={(settingsData?.voteCreation as "admin" | "members") ?? "admin"}
          onChanged={() => { refetchSettings(); setShowSettings(false); }}
        />
      )}

      {inviteLink && (
        <Card className="mb-4 border-accent-muted bg-accent-subtle">
          <CardBody>
            <p className="text-sm text-text-secondary mb-2">{t("members.shareLink")}</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs bg-surface-raised px-3 py-2 rounded border border-border-default text-text-secondary truncate">{inviteLink}</code>
              <Button
                variant="secondary"
                onClick={async () => {
                  await navigator.clipboard.writeText(inviteLink);
                  setInviteCopied(true);
                  setTimeout(() => setInviteCopied(false), 3000);
                }}
              >
                {inviteCopied ? t("members.copied") : t("members.copy")}
              </Button>
            </div>
            {admissionMode === "open" ? (
              <div className="bg-warning-subtle border border-warning-border rounded-md p-2 mt-2">
                <p className="text-xs text-warning-text">
                  <span className="font-medium">Sybil risk:</span> This link lets anyone join and vote immediately. A bad actor could create multiple accounts to multiply their voting power. Share only with people you trust.
                </p>
              </div>
            ) : (
              <p className="text-xs text-text-tertiary mt-2">
                {t("members.approvalNeeded")}
              </p>
            )}
            {inviteExpiresAt && (
              <p className="text-xs text-text-tertiary mt-1">
                {t("members.linkExpires", { date: formatDate(inviteExpiresAt) })}
              </p>
            )}
          </CardBody>
        </Card>
      )}

      {showDirectInvite && (
        <DirectInviteForm
          groupId={groupId!}
          onClose={() => setShowDirectInvite(false)}
        />
      )}

      {showBulkInvite && (
        <BulkInvite
          groupId={groupId!}
          onClose={() => setShowBulkInvite(false)}
        />
      )}

      {/* Pending join requests (approval mode) */}
      {pendingRequests.length > 0 && (
        <Card className="mb-4 border-info-border">
          <CardBody>
            <div className="flex items-center gap-2 mb-3">
              <h3 className="text-sm font-semibold text-text-primary">{t("members.pendingJoinRequests")}</h3>
              <Badge color="blue">{pendingRequests.length}</Badge>
            </div>
            <div className="space-y-2">
              {pendingRequests.map((req) => (
                <PendingRequestRow
                  key={req.id}
                  request={req}
                  groupId={groupId!}
                  onAction={() => { void refetchJoinRequests(); void refetch(); }}
                />
              ))}
            </div>
          </CardBody>
        </Card>
      )}

      {adding && (
        <AddMemberForm
          groupId={groupId!}
          onClose={() => setAdding(false)}
          onAdded={refetch}
        />
      )}

      {participants.length === 0 ? (
        <EmptyState title={t("members.noMembers")} description={t("members.noMembersDesc")} />
      ) : (
        <Card>
          <div className="divide-y divide-border-subtle">
            {participants.map((p) => (
              <div key={p.id} className="px-4 py-3 sm:px-6 sm:py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2 min-h-[56px]">
                <div className="flex items-center gap-3 min-w-0">
                  <Avatar name={p.name} size="md" />
                  <div className="min-w-0">
                    <div className="font-medium text-text-primary">{p.name}</div>
                    {p.registeredAt && (
                      <div className="text-xs text-text-tertiary mt-0.5">
                        {t("members.joined", { date: formatDate(p.registeredAt) })}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3 sm:gap-2 shrink-0">
                  {p.status && (
                    <Badge color={p.status === "active" ? "green" : "gray"}>
                      {p.status}
                    </Badge>
                  )}
                  <RemoveButton groupId={groupId!} participantId={p.id} onRemoved={refetch} />
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

function AddMemberForm({ groupId, onClose, onAdded }: { groupId: string; onClose: () => void; onAdded: () => void }) {
  const { t } = useTranslation("governance");
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.addParticipant(groupId, name.trim());
      setName("");
      onAdded();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t("members.addError"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card className="mb-4 sm:mb-6">
      <CardBody>
        <form onSubmit={handleSubmit} className="space-y-4">
          <h3 className="font-medium text-text-primary">{t("members.addMemberTitle")}</h3>
          {error && <ErrorBox message={error} />}
          <div>
            <Label>{t("members.nameLabel")}</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("members.namePlaceholder")} autoFocus />
          </div>
          <div className="flex gap-2 justify-end">
            <Button type="button" variant="secondary" onClick={onClose}>{t("common:cancel")}</Button>
            <Button type="submit" disabled={submitting || !name.trim()}>
              {submitting ? t("members.adding") : t("members.add")}
            </Button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}

function DirectInviteForm({ groupId, onClose }: { groupId: string; onClose: () => void }) {
  const { t } = useTranslation("governance");
  const [handle, setHandle] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const h = handle.trim().replace(/^@/, "");
    if (!h) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.createDirectInvite(groupId, h);
      setSent(true);
      setTimeout(() => { setSent(false); setHandle(""); }, 2000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t("members.sendError"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card className="mb-4">
      <CardBody>
        <form onSubmit={handleSubmit} className="space-y-3">
          <h3 className="font-medium text-text-primary text-sm">{t("members.directInviteTitle")}</h3>
          {error && <ErrorBox message={error} />}
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary text-sm">@</span>
              <Input
                value={handle}
                onChange={(e) => setHandle(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                placeholder="username"
                className="pl-7"
                autoFocus
              />
            </div>
            <Button type="submit" disabled={submitting || !handle.trim()}>
              {sent ? t("members.sent") : submitting ? t("members.sending") : t("members.sendInvite")}
            </Button>
            <Button type="button" variant="secondary" onClick={onClose}>{t("common:cancel")}</Button>
          </div>
          <p className="text-xs text-text-tertiary">{t("members.directInviteNote")}</p>
        </form>
      </CardBody>
    </Card>
  );
}

function PendingRequestRow({ request, groupId, onAction }: { request: { id: string; userName: string; userHandle: string | null; createdAt: string }; groupId: string; onAction: () => void }) {
  const { t } = useTranslation("governance");
  const [acting, setActing] = useState(false);

  const handleApprove = async () => {
    setActing(true);
    try {
      await api.approveJoinRequest(groupId, request.id);
      onAction();
    } catch { /* ignore */ }
    finally { setActing(false); }
  };

  const handleReject = async () => {
    setActing(true);
    try {
      await api.rejectJoinRequest(groupId, request.id);
      onAction();
    } catch { /* ignore */ }
    finally { setActing(false); }
  };

  return (
    <div className="flex items-center justify-between py-2 px-3 rounded-md bg-surface">
      <div className="flex items-center gap-2 min-w-0">
        <Avatar name={request.userName} size="sm" />
        <div className="min-w-0">
          <span className="text-sm font-medium text-text-primary">{request.userName}</span>
          {request.userHandle && (
            <span className="text-xs text-text-tertiary ml-1">@{request.userHandle}</span>
          )}
          <div className="text-xs text-text-tertiary">
            {t("members.requested", { date: formatDate(request.createdAt) })}
          </div>
        </div>
      </div>
      <div className="flex gap-1 shrink-0">
        <Button size="sm" onClick={handleApprove} disabled={acting}>{t("members.approve")}</Button>
        <Button size="sm" variant="ghost" onClick={handleReject} disabled={acting}>{t("members.reject")}</Button>
      </div>
    </div>
  );
}

function GroupSettings({ groupId, currentMode, currentWebsiteUrl, currentVoteCreation, onChanged }: { groupId: string; currentMode: AdmissionMode; currentWebsiteUrl: string | null; currentVoteCreation: "admin" | "members"; onChanged: () => void }) {
  const { t } = useTranslation("governance");
  const [mode, setMode] = useState(currentMode);
  const [websiteUrl, setWebsiteUrl] = useState(currentWebsiteUrl ?? "");
  const [voteCreation, setVoteCreation] = useState(currentVoteCreation);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    const modeChanged = mode !== currentMode;
    const urlChanged = (websiteUrl.trim() || null) !== currentWebsiteUrl;
    const voteCreationChanged = voteCreation !== currentVoteCreation;
    if (!modeChanged && !urlChanged && !voteCreationChanged) { onChanged(); return; }
    setSaving(true);
    setError(null);
    try {
      const updates: Parameters<typeof api.updateGroupSettings>[1] = {};
      if (modeChanged) updates.admissionMode = mode;
      if (urlChanged) updates.websiteUrl = websiteUrl.trim();
      if (voteCreationChanged) updates.voteCreation = voteCreation;
      await api.updateGroupSettings(groupId, updates);
      onChanged();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t("members.updateError"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="mb-4">
      <CardBody>
        <h3 className="text-sm font-semibold text-text-primary mb-3">{t("members.groupSettings")}</h3>
        {error && <ErrorBox message={error} />}
        <div className="space-y-3">
          <div>
            <Label>{t("members.whoCanJoinLabel")}</Label>
            <Select value={mode} onChange={(e) => setMode(e.target.value as AdmissionMode)}>
              <option value="approval">{t("members.admissionApprovalOption")}</option>
              <option value="open">{t("members.admissionOpenOption")}</option>
              <option value="invite-only">{t("members.admissionInviteOnlyOption")}</option>
            </Select>
          </div>
          {mode === "open" && mode !== currentMode && (
            <p className="text-xs text-warning-text bg-warning-subtle border border-warning-border rounded px-2 py-1.5">
              {t("members.sybilWarning")}
            </p>
          )}
          {mode === "invite-only" && mode !== currentMode && (
            <p className="text-xs text-text-muted">
              {t("members.inviteOnlyWarning")}
            </p>
          )}
          <div>
            <Label>{t("members.websiteLabel")}</Label>
            <Input
              type="url"
              value={websiteUrl}
              onChange={(e) => setWebsiteUrl(e.target.value)}
              placeholder="https://..."
            />
            {!websiteUrl && (
              <p className="text-xs text-text-tertiary mt-1">
                {t("members.websiteHelper")}{" "}
                <a href="https://uniweb.app/templates?category=organization" target="_blank" rel="noopener noreferrer" className="text-accent-text hover:underline">
                  {t("members.browseTemplates")} →
                </a>
              </p>
            )}
          </div>
          <div>
            <Label>{t("members.voteCreationLabel")}</Label>
            <Select value={voteCreation} onChange={(e) => setVoteCreation(e.target.value as "admin" | "members")}>
              <option value="admin">{t("members.voteCreationAdmin")}</option>
              <option value="members">{t("members.voteCreationMembers")}</option>
            </Select>
            <p className="text-xs text-text-tertiary mt-1">{t("members.voteCreationHint")}</p>
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="secondary" onClick={onChanged}>{t("common:cancel")}</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? t("members.saving") : t("common:save")}
            </Button>
          </div>
        </div>
      </CardBody>
    </Card>
  );
}

function RemoveButton({ groupId, participantId, onRemoved }: { groupId: string; participantId: string; onRemoved: () => void }) {
  const { t } = useTranslation("governance");
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRemove = async () => {
    setError(null);
    try {
      await api.removeParticipant(groupId, participantId);
      onRemoved();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t("members.removeError"));
      setConfirming(false);
    }
  };

  if (confirming) {
    return (
      <div className="flex items-center gap-1">
        <Button size="sm" variant="danger" onClick={handleRemove}>{t("common:confirm")}</Button>
        <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>{t("common:cancel")}</Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1">
      {error && <span className="text-xs text-error">{error}</span>}
      <Button size="sm" variant="ghost" onClick={() => setConfirming(true)} className="text-error hover:text-error-text">
        {t("members.remove")}
      </Button>
    </div>
  );
}

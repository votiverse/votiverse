import { useState } from "react";
import { useParams } from "react-router";
import { useApi } from "../hooks/use-api.js";
import * as api from "../api/client.js";
import { Card, CardBody, Button, Input, Label, Select, Spinner, ErrorBox, EmptyState, Badge } from "../components/ui.js";
import { Avatar } from "../components/avatar.js";
import { BulkInvite } from "../components/bulk-invite.js";
import type { AdmissionMode } from "../api/types.js";

export function Members() {
  const { assemblyId } = useParams();
  const { data, loading, error, refetch } = useApi(() => api.listParticipants(assemblyId!), [assemblyId]);
  const { data: settingsData, refetch: refetchSettings } = useApi(() => api.getAssemblySettings(assemblyId!), [assemblyId]);
  const [showSettings, setShowSettings] = useState(false);
  const { data: joinRequestsData, refetch: refetchJoinRequests } = useApi(() => api.listJoinRequests(assemblyId!).catch(() => ({ joinRequests: [] })), [assemblyId]);
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
      const result = await api.createInviteLink(assemblyId!) as { token: string; expiresAt?: string };
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
        <h1 className="text-xl sm:text-2xl font-semibold text-gray-900">Members</h1>
        <div className="flex gap-2">
          {admissionMode !== "invite-only" && (
            <Button variant="secondary" onClick={handleGenerateInvite}>
              {inviteCopied ? "Link copied!" : "Invite link"}
            </Button>
          )}
          <Button variant="secondary" onClick={() => setShowDirectInvite(!showDirectInvite)}>
            Invite by handle
          </Button>
          {admissionMode !== "invite-only" && (
            <Button variant="secondary" onClick={() => setShowBulkInvite(!showBulkInvite)}>
              Bulk invite
            </Button>
          )}
          <Button onClick={() => setAdding(true)}>Add Member</Button>
        </div>
      </div>

      {/* Admission mode indicator + settings */}
      <div className="flex items-center gap-3 mb-4 text-sm">
        <span className="text-gray-500">
          Admission: <span className="font-medium text-gray-700">
            {admissionMode === "approval" ? "Approval required" : admissionMode === "open" ? "Open" : "Invite only"}
          </span>
        </span>
        <button
          onClick={() => setShowSettings(!showSettings)}
          className="text-brand hover:text-brand-light text-xs font-medium"
        >
          {showSettings ? "Hide settings" : "Change"}
        </button>
      </div>

      {showSettings && (
        <AdmissionModeSettings
          assemblyId={assemblyId!}
          currentMode={admissionMode}
          onChanged={() => { refetchSettings(); setShowSettings(false); }}
        />
      )}

      {inviteLink && (
        <Card className="mb-4 border-brand-200 bg-brand-50/30">
          <CardBody>
            <p className="text-sm text-gray-700 mb-2">Share this link to invite people:</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs bg-white px-3 py-2 rounded border border-gray-200 text-gray-600 truncate">{inviteLink}</code>
              <Button
                variant="secondary"
                onClick={async () => {
                  await navigator.clipboard.writeText(inviteLink);
                  setInviteCopied(true);
                  setTimeout(() => setInviteCopied(false), 3000);
                }}
              >
                {inviteCopied ? "Copied!" : "Copy"}
              </Button>
            </div>
            {admissionMode === "open" ? (
              <div className="bg-amber-50 border border-amber-200 rounded-md p-2 mt-2">
                <p className="text-xs text-amber-800">
                  <span className="font-medium">Sybil risk:</span> This link lets anyone join and vote immediately. A bad actor could create multiple accounts to multiply their voting power. Share only with people you trust.
                </p>
              </div>
            ) : (
              <p className="text-xs text-gray-400 mt-2">
                Recipients will need admin approval before they can join and vote.
              </p>
            )}
            {inviteExpiresAt && (
              <p className="text-xs text-gray-400 mt-1">
                Expires {new Date(inviteExpiresAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
              </p>
            )}
          </CardBody>
        </Card>
      )}

      {showDirectInvite && (
        <DirectInviteForm
          assemblyId={assemblyId!}
          onClose={() => setShowDirectInvite(false)}
        />
      )}

      {showBulkInvite && (
        <BulkInvite
          assemblyId={assemblyId!}
          onClose={() => setShowBulkInvite(false)}
        />
      )}

      {/* Pending join requests (approval mode) */}
      {pendingRequests.length > 0 && (
        <Card className="mb-4 border-blue-200">
          <CardBody>
            <div className="flex items-center gap-2 mb-3">
              <h3 className="text-sm font-semibold text-gray-900">Pending Join Requests</h3>
              <Badge color="blue">{pendingRequests.length}</Badge>
            </div>
            <div className="space-y-2">
              {pendingRequests.map((req) => (
                <PendingRequestRow
                  key={req.id}
                  request={req}
                  assemblyId={assemblyId!}
                  onAction={() => { void refetchJoinRequests(); void refetch(); }}
                />
              ))}
            </div>
          </CardBody>
        </Card>
      )}

      {adding && (
        <AddMemberForm
          assemblyId={assemblyId!}
          onClose={() => setAdding(false)}
          onAdded={refetch}
        />
      )}

      {participants.length === 0 ? (
        <EmptyState title="No members yet" description="Add members to start making decisions together." />
      ) : (
        <Card>
          <div className="divide-y divide-gray-100">
            {participants.map((p) => (
              <div key={p.id} className="px-4 py-3 sm:px-6 sm:py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2 min-h-[56px]">
                <div className="flex items-center gap-3 min-w-0">
                  <Avatar name={p.name} size="md" />
                  <div className="min-w-0">
                    <div className="font-medium text-gray-900">{p.name}</div>
                    {p.registeredAt && (
                      <div className="text-xs text-gray-400 mt-0.5">
                        Joined {new Date(p.registeredAt).toLocaleDateString()}
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
                  <RemoveButton assemblyId={assemblyId!} participantId={p.id} onRemoved={refetch} />
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

function AddMemberForm({ assemblyId, onClose, onAdded }: { assemblyId: string; onClose: () => void; onAdded: () => void }) {
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.addParticipant(assemblyId, name.trim());
      setName("");
      onAdded();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to add member");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card className="mb-4 sm:mb-6">
      <CardBody>
        <form onSubmit={handleSubmit} className="space-y-4">
          <h3 className="font-medium text-gray-900">Add Member</h3>
          {error && <ErrorBox message={error} />}
          <div>
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Member name" autoFocus />
          </div>
          <div className="flex gap-2 justify-end">
            <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={submitting || !name.trim()}>
              {submitting ? "Adding..." : "Add"}
            </Button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}

function DirectInviteForm({ assemblyId, onClose }: { assemblyId: string; onClose: () => void }) {
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
      await api.createDirectInvite(assemblyId, h);
      setSent(true);
      setTimeout(() => { setSent(false); setHandle(""); }, 2000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to send invitation");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card className="mb-4">
      <CardBody>
        <form onSubmit={handleSubmit} className="space-y-3">
          <h3 className="font-medium text-gray-900 text-sm">Invite by handle</h3>
          {error && <ErrorBox message={error} />}
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">@</span>
              <Input
                value={handle}
                onChange={(e) => setHandle(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                placeholder="username"
                className="pl-7"
                autoFocus
              />
            </div>
            <Button type="submit" disabled={submitting || !handle.trim()}>
              {sent ? "Sent!" : submitting ? "Sending..." : "Send invite"}
            </Button>
            <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          </div>
          <p className="text-xs text-gray-400">The user will see the invitation on their dashboard.</p>
        </form>
      </CardBody>
    </Card>
  );
}

function PendingRequestRow({ request, assemblyId, onAction }: { request: { id: string; userName: string; userHandle: string | null; createdAt: string }; assemblyId: string; onAction: () => void }) {
  const [acting, setActing] = useState(false);

  const handleApprove = async () => {
    setActing(true);
    try {
      await api.approveJoinRequest(assemblyId, request.id);
      onAction();
    } catch { /* ignore */ }
    finally { setActing(false); }
  };

  const handleReject = async () => {
    setActing(true);
    try {
      await api.rejectJoinRequest(assemblyId, request.id);
      onAction();
    } catch { /* ignore */ }
    finally { setActing(false); }
  };

  return (
    <div className="flex items-center justify-between py-2 px-3 rounded-md bg-gray-50">
      <div className="flex items-center gap-2 min-w-0">
        <Avatar name={request.userName} size="sm" />
        <div className="min-w-0">
          <span className="text-sm font-medium text-gray-900">{request.userName}</span>
          {request.userHandle && (
            <span className="text-xs text-gray-400 ml-1">@{request.userHandle}</span>
          )}
          <div className="text-xs text-gray-400">
            Requested {new Date(request.createdAt).toLocaleDateString()}
          </div>
        </div>
      </div>
      <div className="flex gap-1 shrink-0">
        <Button size="sm" onClick={handleApprove} disabled={acting}>Approve</Button>
        <Button size="sm" variant="ghost" onClick={handleReject} disabled={acting}>Reject</Button>
      </div>
    </div>
  );
}

function AdmissionModeSettings({ assemblyId, currentMode, onChanged }: { assemblyId: string; currentMode: AdmissionMode; onChanged: () => void }) {
  const [mode, setMode] = useState(currentMode);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    if (mode === currentMode) { onChanged(); return; }
    setSaving(true);
    setError(null);
    try {
      await api.updateAssemblySettings(assemblyId, { admissionMode: mode });
      onChanged();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to update");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="mb-4">
      <CardBody>
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Admission Settings</h3>
        {error && <ErrorBox message={error} />}
        <div className="space-y-3">
          <div>
            <Label>Who can join</Label>
            <Select value={mode} onChange={(e) => setMode(e.target.value as AdmissionMode)}>
              <option value="approval">Approval required</option>
              <option value="open">Open — anyone with a link joins immediately</option>
              <option value="invite-only">Invite only — admin sends directly</option>
            </Select>
          </div>
          {mode === "open" && mode !== currentMode && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
              Open admission increases the risk of Sybil attacks — a bad actor could create multiple accounts to multiply their voting power.
            </p>
          )}
          {mode === "invite-only" && mode !== currentMode && (
            <p className="text-xs text-gray-500">
              Existing invite links will no longer work. Only direct invitations by handle will be accepted.
            </p>
          )}
          <div className="flex gap-2 justify-end">
            <Button variant="secondary" onClick={onChanged}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : "Save"}
            </Button>
          </div>
        </div>
      </CardBody>
    </Card>
  );
}

function RemoveButton({ assemblyId, participantId, onRemoved }: { assemblyId: string; participantId: string; onRemoved: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRemove = async () => {
    setError(null);
    try {
      await api.removeParticipant(assemblyId, participantId);
      onRemoved();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to remove member");
      setConfirming(false);
    }
  };

  if (confirming) {
    return (
      <div className="flex items-center gap-1">
        <Button size="sm" variant="danger" onClick={handleRemove}>Confirm</Button>
        <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>Cancel</Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1">
      {error && <span className="text-xs text-red-500">{error}</span>}
      <Button size="sm" variant="ghost" onClick={() => setConfirming(true)} className="text-red-500 hover:text-red-700">
        Remove
      </Button>
    </div>
  );
}

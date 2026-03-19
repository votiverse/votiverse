import { useState } from "react";
import { useParams } from "react-router";
import { useApi } from "../hooks/use-api.js";
import * as api from "../api/client.js";
import { Card, CardBody, Button, Input, Label, Spinner, ErrorBox, EmptyState, Badge } from "../components/ui.js";
import { Avatar } from "../components/avatar.js";

export function Members() {
  const { assemblyId } = useParams();
  const { data, loading, error, refetch } = useApi(() => api.listParticipants(assemblyId!), [assemblyId]);
  const [adding, setAdding] = useState(false);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [inviteCopied, setInviteCopied] = useState(false);

  const handleGenerateInvite = async () => {
    try {
      const result = await api.createInviteLink(assemblyId!);
      const link = `${window.location.origin}/invite/${result.token}`;
      setInviteLink(link);
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
          <Button variant="secondary" onClick={handleGenerateInvite}>
            {inviteCopied ? "Link copied!" : "Invite link"}
          </Button>
          <Button onClick={() => setAdding(true)}>Add Member</Button>
        </div>
      </div>

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
            <p className="text-xs text-gray-400 mt-2">Anyone with this link can join the group.</p>
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

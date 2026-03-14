import { useState } from "react";
import { useParams, Link } from "react-router";
import { useApi } from "../hooks/use-api.js";
import * as api from "../api/client.js";
import { Card, CardBody, Button, Input, Label, Spinner, ErrorBox, EmptyState } from "../components/ui.js";

export function Members() {
  const { assemblyId } = useParams();
  const { data, loading, error, refetch } = useApi(() => api.listParticipants(assemblyId!), [assemblyId]);
  const [adding, setAdding] = useState(false);

  if (loading) return <Spinner />;
  if (error) return <ErrorBox message={error} onRetry={refetch} />;

  const participants = data?.participants ?? [];

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Members</h1>
        <Button onClick={() => setAdding(true)}>Add Member</Button>
      </div>

      {adding && (
        <AddMemberForm
          assemblyId={assemblyId!}
          onClose={() => setAdding(false)}
          onAdded={refetch}
        />
      )}

      {participants.length === 0 ? (
        <EmptyState title="No members yet" description="Add members to start governing." />
      ) : (
        <Card>
          <div className="divide-y divide-gray-100">
            {participants.map((p) => (
              <div key={p.id} className="px-6 py-4 flex items-center justify-between">
                <div>
                  <div className="font-medium text-gray-900">{p.name}</div>
                  <div className="text-xs text-gray-400 font-mono mt-0.5">{p.id}</div>
                </div>
                <div className="flex items-center gap-2">
                  <Link
                    to={`/assembly/${assemblyId}/awareness/profile/${p.id}`}
                    className="text-sm text-brand hover:text-brand-light"
                  >
                    Profile
                  </Link>
                  <Link
                    to={`/assembly/${assemblyId}/awareness/history/${p.id}`}
                    className="text-sm text-brand hover:text-brand-light"
                  >
                    History
                  </Link>
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
    <Card className="mb-6">
      <CardBody>
        <form onSubmit={handleSubmit} className="space-y-4">
          <h3 className="font-medium text-gray-900">Add Member</h3>
          {error && <ErrorBox message={error} />}
          <div>
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Participant name" autoFocus />
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

  const handleRemove = async () => {
    try {
      await api.removeParticipant(assemblyId, participantId);
      onRemoved();
    } catch {
      // silently ignore
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
    <Button size="sm" variant="ghost" onClick={() => setConfirming(true)} className="text-red-500 hover:text-red-700">
      Remove
    </Button>
  );
}

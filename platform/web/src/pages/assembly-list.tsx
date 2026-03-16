import { useState } from "react";
import { Link } from "react-router";
import { useApi } from "../hooks/use-api.js";
import { useAttention } from "../hooks/use-attention.js";
import * as api from "../api/client.js";
import { Card, CardBody, Button, Input, Label, Select, Spinner, ErrorBox, EmptyState, StatusBadge, Badge } from "../components/ui.js";
import { presetLabel } from "../lib/presets.js";

const PRESETS = [
  { value: "TOWN_HALL", label: "Everyone votes directly", desc: "Every member votes on every question. Simple and equal." },
  { value: "SWISS_MODEL", label: "Discuss, then vote", desc: "A structured discussion period, then a direct vote by all members." },
  { value: "LIQUID_STANDARD", label: "Members choose delegates", desc: "Members can delegate their vote to someone they choose, by topic." },
  { value: "LIQUID_ACCOUNTABLE", label: "Delegates with full accountability", desc: "Delegate votes are visible and predictions are tracked over time." },
  { value: "BOARD_PROXY", label: "Elected representatives", desc: "Members elect or appoint representatives who vote on their behalf." },
  { value: "CIVIC_PARTICIPATORY", label: "Mixed approach", desc: "Some topics decided by direct vote, others through delegates." },
];

export function AssemblyList() {
  const { data: assemblies, loading, error, refetch } = useApi(() => api.listAssemblies());
  const { pendingByAssembly } = useAttention();
  const [creating, setCreating] = useState(false);

  if (loading) return <Spinner />;
  if (error) return <ErrorBox message={error} onRetry={refetch} />;

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold text-gray-900">My Groups</h1>
          <p className="mt-1 text-sm text-gray-500">Your communities and organizations</p>
        </div>
        <Button onClick={() => setCreating(true)}>New Group</Button>
      </div>

      {creating && <CreateAssemblyForm onClose={() => setCreating(false)} onCreated={refetch} />}

      {!assemblies || assemblies.length === 0 ? (
        <EmptyState
          title="No groups yet"
          description="Create your first group to start making decisions together."
          action={!creating ? <Button onClick={() => setCreating(true)}>New Group</Button> : undefined}
        />
      ) : (
        <div className="space-y-3">
          {assemblies.map((asm) => (
            <Link key={asm.id} to={`/assembly/${asm.id}`} className="block">
              <Card className="hover:border-brand-200 hover:shadow transition-all">
                <CardBody>
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-medium text-gray-900">{asm.name}</h3>
                      <p className="text-sm text-gray-500 mt-0.5">{presetLabel(asm.config.name)}</p>
                    </div>
                    <div className="flex items-center gap-2 sm:gap-3">
                      <StatusBadge status={asm.status} />
                      {(pendingByAssembly[asm.id] ?? 0) > 0 && (
                        <Badge color="red">{pendingByAssembly[asm.id]} vote{pendingByAssembly[asm.id] !== 1 ? "s" : ""} need{pendingByAssembly[asm.id] === 1 ? "s" : ""} you</Badge>
                      )}
                      <span className="text-xs text-gray-400 hidden sm:inline">
                        {new Date(asm.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                </CardBody>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function CreateAssemblyForm({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState("");
  const [preset, setPreset] = useState("LIQUID_STANDARD");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.createAssembly({ name: name.trim(), preset });
      onCreated();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create group");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card className="mb-6">
      <CardBody>
        <form onSubmit={handleSubmit} className="space-y-4">
          <h3 className="font-medium text-gray-900">New Group</h3>
          {error && <ErrorBox message={error} />}
          <div>
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Group name" autoFocus />
          </div>
          <div>
            <Label>How should your group make decisions?</Label>
            <Select value={preset} onChange={(e) => setPreset(e.target.value)}>
              {PRESETS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label} — {p.desc}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex gap-2 justify-end">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting || !name.trim()}>
              {submitting ? "Creating..." : "Create"}
            </Button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}

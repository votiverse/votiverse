import { useState } from "react";
import { Link } from "react-router";
import { useApi } from "../hooks/use-api.js";
import { useAttention } from "../hooks/use-attention.js";
import * as api from "../api/client.js";
import { Card, CardBody, Button, Input, Label, Spinner, ErrorBox, EmptyState, Badge } from "../components/ui.js";
import { presetLabel } from "../lib/presets.js";

const PRESETS = [
  { value: "MODERN_DEMOCRACY", label: "Modern Democracy", desc: "Delegation with candidates, voting booklets, community notes, surveys. The recommended default.", recommended: true },
  { value: "TOWN_HALL", label: "Direct Democracy", desc: "Every member votes on every question. No delegation." },
  { value: "SWISS_MODEL", label: "Swiss Votation", desc: "Structured deliberation with voting booklets and community notes. No delegation." },
  { value: "LIQUID_STANDARD", label: "Liquid Open", desc: "Open delegation for groups where everyone knows each other." },
  { value: "LIQUID_ACCOUNTABLE", label: "Full Accountability", desc: "Mandatory predictions, full awareness, maximum transparency." },
  { value: "BOARD_PROXY", label: "Board Proxy", desc: "Single-delegate proxy voting for formal governance bodies." },
  { value: "CIVIC_PARTICIPATORY", label: "Civic Participatory", desc: "Municipal-scale deployment with chain depth cap and blockchain integrity." },
];

export function AssemblyList() {
  const { data: assemblies, loading, error, refetch } = useApi(() => api.listAssemblies());
  const { pendingByAssembly, assemblySummaries } = useAttention();
  const activeByAssembly = Object.fromEntries(assemblySummaries.map((s) => [s.assembly.id, s.activeEventCount]));
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
            <Link key={asm.id} to={`/assembly/${asm.id}/events`} className="block">
              <Card className="hover:border-brand-200 hover:shadow transition-all">
                <CardBody>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <AssemblyInitial name={asm.name} />
                      <div>
                        <h3 className="font-medium text-gray-900">{asm.name}</h3>
                        <p className="text-sm text-gray-500 mt-0.5">{presetLabel(asm.config.name)}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 sm:gap-3">
                      {(activeByAssembly[asm.id] ?? 0) > 0 && (
                        <Badge color="gray">{activeByAssembly[asm.id]} open vote{activeByAssembly[asm.id] !== 1 ? "s" : ""}</Badge>
                      )}
                      {(pendingByAssembly[asm.id] ?? 0) > 0 && (
                        <Badge color="red">{pendingByAssembly[asm.id]} need{pendingByAssembly[asm.id] === 1 ? "s" : ""} you</Badge>
                      )}
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
  const [preset, setPreset] = useState("MODERN_DEMOCRACY");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);

  const selectedPreset = PRESETS.find((p) => p.value === preset);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    if (!showConfirm) {
      setShowConfirm(true);
      return;
    }
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
            <Label>Governance approach</Label>
            <div className="space-y-2 mt-1">
              {PRESETS.map((p) => (
                <label
                  key={p.value}
                  className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                    preset === p.value
                      ? "border-brand bg-brand-50"
                      : "border-gray-200 hover:border-gray-300"
                  }`}
                >
                  <input
                    type="radio"
                    name="preset"
                    value={p.value}
                    checked={preset === p.value}
                    onChange={() => { setPreset(p.value); setShowConfirm(false); }}
                    className="mt-0.5"
                  />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-900">{p.label}</span>
                      {"recommended" in p && p.recommended && (
                        <Badge color="green">Recommended</Badge>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">{p.desc}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Immutability notice */}
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            <p className="text-xs text-amber-800">
              These rules define how your group governs itself. They apply to all votes and cannot be changed after creation.
              This ensures every member can trust that the rules won't shift.
            </p>
          </div>

          {/* Confirmation step */}
          {showConfirm && (
            <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
              <p className="text-sm text-gray-700 font-medium mb-1">Confirm creation</p>
              <p className="text-xs text-gray-500">
                <strong>{name.trim()}</strong> will use <strong>{selectedPreset?.label}</strong> governance.
                These rules are permanent.
              </p>
            </div>
          )}

          <div className="flex gap-2 justify-end">
            <Button type="button" variant="secondary" onClick={() => { showConfirm ? setShowConfirm(false) : onClose(); }}>
              {showConfirm ? "Back" : "Cancel"}
            </Button>
            <Button type="submit" disabled={submitting || !name.trim()}>
              {submitting ? "Creating..." : showConfirm ? "Create Group" : "Continue"}
            </Button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}

const INITIAL_COLORS = [
  "bg-blue-500", "bg-green-500", "bg-purple-500", "bg-amber-500",
  "bg-rose-500", "bg-cyan-500", "bg-indigo-500", "bg-teal-500",
];

function AssemblyInitial({ name }: { name: string }) {
  const hash = name.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return (
    <div className={`w-9 h-9 ${INITIAL_COLORS[hash % INITIAL_COLORS.length]} rounded-lg flex items-center justify-center shrink-0`}>
      <span className="text-white font-semibold text-sm">{name.charAt(0).toUpperCase()}</span>
    </div>
  );
}

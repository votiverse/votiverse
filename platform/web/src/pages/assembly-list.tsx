import { useState } from "react";
import { Link } from "react-router";
import { useApi } from "../hooks/use-api.js";
import * as api from "../api/client.js";
import { Card, CardBody, Button, Input, Label, Select, Spinner, ErrorBox, EmptyState, StatusBadge } from "../components/ui.js";

const PRESETS = [
  { value: "TOWN_HALL", label: "Town Hall", desc: "Direct democracy, no delegation" },
  { value: "SWISS_MODEL", label: "Swiss Model", desc: "Secret ballot, optional delegation" },
  { value: "LIQUID_STANDARD", label: "Liquid Standard", desc: "Topic-specific liquid delegation" },
  { value: "LIQUID_ACCOUNTABLE", label: "Liquid Accountable", desc: "Liquid delegation with predictions" },
  { value: "BOARD_PROXY", label: "Board Proxy", desc: "Corporate proxy voting model" },
  { value: "CIVIC_PARTICIPATORY", label: "Civic Participatory", desc: "Full participatory governance" },
];

export function AssemblyList() {
  const { data: assemblies, loading, error, refetch } = useApi(() => api.listAssemblies());
  const [creating, setCreating] = useState(false);

  if (loading) return <Spinner />;
  if (error) return <ErrorBox message={error} onRetry={refetch} />;

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold text-gray-900">Assemblies</h1>
          <p className="mt-1 text-sm text-gray-500">Governance assemblies on this VCP instance</p>
        </div>
        <Button onClick={() => setCreating(true)}>Create Assembly</Button>
      </div>

      {creating && <CreateAssemblyForm onClose={() => setCreating(false)} onCreated={refetch} />}

      {!assemblies || assemblies.length === 0 ? (
        <EmptyState
          title="No assemblies yet"
          description="Create your first assembly to start governing."
          action={!creating ? <Button onClick={() => setCreating(true)}>Create Assembly</Button> : undefined}
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
                      <p className="text-sm text-gray-500 mt-0.5">{asm.config.name} preset</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <StatusBadge status={asm.status} />
                      <span className="text-xs text-gray-400">
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
      setError(err instanceof Error ? err.message : "Failed to create assembly");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card className="mb-6">
      <CardBody>
        <form onSubmit={handleSubmit} className="space-y-4">
          <h3 className="font-medium text-gray-900">New Assembly</h3>
          {error && <ErrorBox message={error} />}
          <div>
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Assembly name" autoFocus />
          </div>
          <div>
            <Label>Governance Preset</Label>
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

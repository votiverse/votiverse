import { useState, useEffect } from "react";
import { useIdentity } from "../hooks/use-identity.js";
import * as api from "../api/client.js";
import { Spinner } from "./ui.js";
import { Avatar } from "./avatar.js";

interface KnownParticipant {
  id: string;
  name: string;
  assemblyId: string;
  assemblyName: string;
}

export function IdentityPicker() {
  const { setParticipant } = useIdentity();
  const [participants, setParticipants] = useState<KnownParticipant[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const assemblies = await api.listAssemblies();
        const results: KnownParticipant[] = [];
        const seen = new Set<string>();
        await Promise.allSettled(
          assemblies.map(async (asm) => {
            const { participants: ps } = await api.listParticipants(asm.id);
            for (const p of ps) {
              // Deduplicate by name (same person across assemblies)
              if (!seen.has(p.name)) {
                seen.add(p.name);
                results.push({
                  id: p.id,
                  name: p.name,
                  assemblyId: asm.id,
                  assemblyName: asm.name,
                });
              }
            }
          }),
        );
        if (!cancelled) setParticipants(results);
      } catch {
        // ignore
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div className="max-w-md mx-auto py-16 text-center">
        <Spinner />
        <p className="mt-4 text-sm text-gray-500">Loading members...</p>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto py-8 sm:py-16">
      <div className="text-center mb-8">
        <div className="w-14 h-14 bg-brand rounded-xl flex items-center justify-center mx-auto mb-4">
          <span className="text-white font-bold text-2xl">V</span>
        </div>
        <h1 className="text-xl sm:text-2xl font-semibold text-gray-900">Welcome to Votiverse</h1>
        <p className="mt-2 text-sm text-gray-500">Select who you are to get started.</p>
      </div>
      <div className="space-y-2">
        {participants.map((p) => (
          <button
            key={p.id}
            onClick={() => setParticipant(p.id, p.name)}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-lg border border-gray-200 bg-white hover:border-brand-200 hover:shadow transition-all min-h-[52px] text-left"
          >
            <Avatar name={p.name} size="md" />
            <div>
              <p className="font-medium text-gray-900">{p.name}</p>
              <p className="text-xs text-gray-400">{p.assemblyName}</p>
            </div>
          </button>
        ))}
      </div>
      {participants.length === 0 && (
        <p className="text-center text-sm text-gray-400 mt-8">
          No members found. Create a group first.
        </p>
      )}
    </div>
  );
}

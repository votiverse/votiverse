import { useState, useEffect } from "react";
import { useIdentity } from "../hooks/use-identity.js";
import { loadIdentityStore, type IdentityUser } from "../identity-store.js";
import { Spinner, ErrorBox } from "./ui.js";
import { Avatar } from "./avatar.js";

export function IdentityPicker() {
  const { setUser } = useIdentity();
  const [users, setUsers] = useState<IdentityUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const store = await loadIdentityStore();
        if (!cancelled) setUsers(store.listUsers());
      } catch (err: unknown) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load identity data");
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

  if (error) {
    return (
      <div className="max-w-md mx-auto py-16">
        <ErrorBox message={error} />
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
        {users.map((user) => (
          <button
            key={user.id}
            onClick={() => setUser(user.id, user.name, user.memberships)}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-lg border border-gray-200 bg-white hover:border-brand-200 hover:shadow transition-all min-h-[52px] text-left"
          >
            <Avatar name={user.name} size="md" />
            <div>
              <p className="font-medium text-gray-900">{user.name}</p>
              {user.memberships.length > 1 && (
                <p className="text-xs text-gray-400">{user.memberships.length} groups</p>
              )}
            </div>
          </button>
        ))}
      </div>
      {users.length === 0 && (
        <p className="text-center text-sm text-gray-400 mt-8">
          No members found. Create a group first.
        </p>
      )}
    </div>
  );
}

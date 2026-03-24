/**
 * OAuth API helpers — provider listing and linked account management.
 */

const BASE_URL = import.meta.env.VITE_API_BASE_URL || "/api";

export interface LinkedProvider {
  provider: string;
  providerEmail: string | null;
  createdAt: string;
}

/** Fetch the list of enabled OAuth providers. In dev mode, always returns both providers for UI preview. */
export async function getOAuthProviders(): Promise<string[]> {
  try {
    const res = await fetch(`${BASE_URL}/auth/oauth/providers`);
    if (!res.ok) return import.meta.env.DEV ? ["google", "microsoft"] : [];
    const data = await res.json() as { providers: string[] };
    // In dev, show all providers even if not configured so the UI can be assessed
    if (import.meta.env.DEV && data.providers.length === 0) {
      return ["google", "microsoft"];
    }
    return data.providers;
  } catch {
    return import.meta.env.DEV ? ["google", "microsoft"] : [];
  }
}

/** Fetch the OAuth providers linked to the current user. */
export async function getLinkedProviders(): Promise<LinkedProvider[]> {
  const res = await fetch(`${BASE_URL}/me/oauth/linked`, { credentials: "include" });
  if (!res.ok) return [];
  const data = await res.json() as { providers: LinkedProvider[] };
  return data.providers;
}

/** Unlink an OAuth provider from the current user. */
export async function unlinkProvider(provider: string): Promise<void> {
  const res = await fetch(`${BASE_URL}/me/oauth/linked/${provider}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!res.ok) {
    const data = await res.json() as { error?: { message?: string } };
    throw new Error(data.error?.message ?? "Failed to unlink provider");
  }
}

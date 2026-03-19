import { useState, useEffect } from "react";
import { Link } from "react-router";
import { useIdentity } from "../hooks/use-identity.js";
import * as api from "../api/client.js";
import type { Assembly, DelegateProfile, VotingHistory } from "../api/types.js";
import { Card, CardHeader, CardBody, Button, Input, Label, Spinner, ErrorBox } from "../components/ui.js";
import { Avatar, AVATAR_STYLES, AVATAR_STYLE_LABELS, avatarUrl, type AvatarStyle } from "../components/avatar.js";

interface AssemblyProfileData {
  assembly: Assembly;
  profile: DelegateProfile | null;
  history: VotingHistory | null;
}

export function Profile() {
  const { storeUserId, participantName, handle, email, memberships } = useIdentity();
  const [data, setData] = useState<AssemblyProfileData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (!storeUserId || memberships.length === 0) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const membershipMap = new Map(
          memberships.map((m) => [m.assemblyId, m.participantId]),
        );
        const allAssemblies = await api.listAssemblies();
        const assemblies = allAssemblies.filter((a) => membershipMap.has(a.id));
        const results: AssemblyProfileData[] = [];

        await Promise.allSettled(
          assemblies.map(async (asm) => {
            const pid = membershipMap.get(asm.id)!;
            const [profileRes, historyRes] = await Promise.allSettled([
              api.getDelegateProfile(asm.id, pid),
              api.getVotingHistory(asm.id, pid),
            ]);

            results.push({
              assembly: asm,
              profile: profileRes.status === "fulfilled" ? profileRes.value : null,
              history: historyRes.status === "fulfilled" ? historyRes.value : null,
            });
          }),
        );

        if (!cancelled) setData(results);
      } catch (err: unknown) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load profile data");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [storeUserId, memberships]);

  if (!storeUserId) {
    return (
      <div className="max-w-3xl mx-auto text-center py-12">
        <p className="text-gray-500">No identity selected. Go to Home to pick who you are.</p>
      </div>
    );
  }

  if (loading) return <Spinner />;
  if (error) return <div className="max-w-3xl mx-auto"><ErrorBox message={error} /></div>;

  const totalVotes = data.reduce((sum, d) => sum + (d.history?.history.length ?? 0), 0);
  const totalDelegators = data.reduce((sum, d) => sum + (d.profile?.delegatorsCount ?? 0), 0);
  const totalOutbound = data.reduce((sum, d) => sum + (d.profile?.myDelegations.length ?? 0), 0);

  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-xl sm:text-2xl font-semibold text-gray-900 mb-6">Me</h1>

      {/* Identity card */}
      <Card className="mb-6">
        <CardBody>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Avatar name={participantName ?? "?"} size="lg" />
              <div>
                <p className="font-semibold text-gray-900 text-lg">{participantName}</p>
                {handle && <p className="text-sm text-gray-500">@{handle}</p>}
                {email && <p className="text-xs text-gray-400">{email}</p>}
              </div>
            </div>
            <Button variant="secondary" size="sm" onClick={() => setEditing(!editing)}>
              {editing ? "Done" : "Edit"}
            </Button>
          </div>
        </CardBody>
      </Card>

      {editing && (
        <ProfileEditor
          currentName={participantName ?? ""}
          currentHandle={handle ?? ""}
          onSaved={() => {
            setEditing(false);
            // Refresh identity by reloading the page (simplest approach)
            window.location.reload();
          }}
        />
      )}

      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-3 mb-8">
        <Link to="/profile/votes">
          <Card className="hover:border-brand-200 hover:shadow active:border-brand transition-all">
            <CardBody className="text-center py-4">
              <div className="text-2xl font-semibold text-gray-900">{totalVotes}</div>
              <div className="text-xs text-gray-500 mt-0.5">Votes Cast</div>
            </CardBody>
          </Card>
        </Link>
        <Link to="/profile/delegators">
          <Card className="hover:border-brand-200 hover:shadow active:border-brand transition-all">
            <CardBody className="text-center py-4">
              <div className="text-2xl font-semibold text-gray-900">{totalDelegators}</div>
              <div className="text-xs text-gray-500 mt-0.5">Delegators</div>
            </CardBody>
          </Card>
        </Link>
        <Link to="/profile/delegates">
          <Card className="hover:border-brand-200 hover:shadow active:border-brand transition-all">
            <CardBody className="text-center py-4">
              <div className="text-2xl font-semibold text-gray-900">{totalOutbound}</div>
              <div className="text-xs text-gray-500 mt-0.5">My Delegates</div>
            </CardBody>
          </Card>
        </Link>
      </div>

      {/* Per-assembly breakdown */}
      {data.length > 0 && (
        <h2 className="text-sm font-medium text-gray-500 mb-3">Your activity by group</h2>
      )}
      {data.map(({ assembly, profile, history }) => (
        <Card key={assembly.id} className="mb-4">
          <CardHeader>
            <Link to={`/assembly/${assembly.id}`} className="font-medium text-gray-900 hover:text-brand transition-colors">
              {assembly.name}
            </Link>
          </CardHeader>
          <CardBody className="space-y-4">
            {profile && (
              <div className="space-y-2">
                {profile.delegatorsCount > 0 && (
                  <div>
                    <p className="text-xs text-gray-500 mb-1">
                      {profile.delegatorsCount} member{profile.delegatorsCount !== 1 ? "s" : ""} delegate{profile.delegatorsCount === 1 ? "s" : ""} to you
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {profile.delegators.map((d) => (
                        <span key={d.id} className="inline-flex items-center gap-1.5 text-xs bg-brand/10 text-brand px-2 py-1 rounded">
                          <Avatar name={d.name ?? "?"} size="xs" className="!w-4 !h-4" />
                          {d.name ?? d.id.slice(0, 8)}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {profile.myDelegations.length > 0 && (
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Your delegates</p>
                    {profile.myDelegations.map((d, i) => (
                      <div key={i} className="flex items-center gap-2 text-sm text-gray-700">
                        <Avatar name={d.targetName ?? "?"} size="xs" className="!w-4 !h-4" />
                        <span>
                          {d.targetName ?? d.targetId.slice(0, 8)}
                          {d.topicScope.length === 0 ? " (global)" : ` (${d.topicScope.length} topic${d.topicScope.length !== 1 ? "s" : ""})`}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                {profile.delegatorsCount === 0 && profile.myDelegations.length === 0 && (
                  <p className="text-sm text-gray-400">No delegates in this group.</p>
                )}
              </div>
            )}

            {history && history.history.length > 0 && (
              <div>
                <p className="text-xs text-gray-500 mb-2">
                  Recent votes ({history.history.length} total)
                </p>
                <div className="space-y-1">
                  {history.history.slice(0, 5).map((entry, idx) => (
                    <div key={idx} className="flex items-center justify-between text-sm bg-gray-50 rounded px-3 py-2">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <span className="capitalize font-medium text-gray-900 shrink-0">{entry.choice}</span>
                        <span className="text-xs text-gray-500 truncate">{entry.issueTitle ?? entry.issueId.slice(0, 12)}</span>
                      </div>
                      <span className="text-xs text-gray-400">
                        {new Date(entry.votedAt).toLocaleDateString()}
                      </span>
                    </div>
                  ))}
                  {history.history.length > 5 && (
                    <p className="text-xs text-gray-400 text-center mt-1">
                      +{history.history.length - 5} more votes
                    </p>
                  )}
                </div>
              </div>
            )}
            {history && history.history.length === 0 && (
              <p className="text-sm text-gray-400">No votes recorded in this group.</p>
            )}
          </CardBody>
        </Card>
      ))}
    </div>
  );
}

// ── Profile editor ────────────────────────────────────────────────────

/** A set of fun seed words to generate varied avatars for browsing. */
const SEED_POOL = [
  "felix", "luna", "atlas", "nova", "sage", "river", "ember", "storm",
  "coral", "jasper", "maple", "onyx", "pearl", "robin", "sky", "wren",
  "cedar", "dusk", "frost", "glow", "ivy", "jade", "lark", "moss",
];

function ProfileEditor({ currentName, currentHandle, onSaved }: {
  currentName: string;
  currentHandle: string;
  onSaved: () => void;
}) {
  const [name, setName] = useState(currentName);
  const [handleValue, setHandleValue] = useState(currentHandle);
  const [bio, setBio] = useState("");
  const [selectedStyle, setSelectedStyle] = useState<AvatarStyle>("avataaars");
  const [avatarSeed, setAvatarSeed] = useState(currentName);
  const [showAvatarPicker, setShowAvatarPicker] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const selectedAvatarUrl = avatarUrl(avatarSeed, selectedStyle);
      await api.updateProfile({
        name: name.trim() || undefined,
        handle: handleValue.trim() || undefined,
        bio: bio || undefined,
        avatarUrl: selectedAvatarUrl,
      });
      setSuccess(true);
      setTimeout(() => onSaved(), 500);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="mb-6">
      <CardBody className="space-y-4">
        <h3 className="font-medium text-gray-900">Edit Profile</h3>
        {error && <ErrorBox message={error} />}

        <div>
          <Label>Name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </div>

        <div>
          <Label>Handle</Label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">@</span>
            <Input
              value={handleValue}
              onChange={(e) => setHandleValue(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
              className="pl-7"
              maxLength={30}
            />
          </div>
        </div>

        <div>
          <Label>Bio</Label>
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
            rows={2}
            maxLength={280}
            placeholder="A short description about yourself"
          />
          <p className="text-xs text-gray-400 mt-1">{bio.length}/280</p>
        </div>

        {/* Avatar — current + change button */}
        <div>
          <Label>Avatar</Label>
          <div className="flex items-center gap-3 mt-1">
            <img
              src={avatarUrl(avatarSeed, selectedStyle)}
              alt="Current avatar"
              className="w-14 h-14 rounded-full bg-gray-100"
            />
            <Button variant="secondary" size="sm" onClick={() => setShowAvatarPicker(!showAvatarPicker)}>
              {showAvatarPicker ? "Close picker" : "Choose avatar"}
            </Button>
          </div>
        </div>

        {/* Avatar gallery */}
        {showAvatarPicker && (
          <AvatarPicker
            currentStyle={selectedStyle}
            currentSeed={avatarSeed}
            onSelect={(style, seed) => {
              setSelectedStyle(style);
              setAvatarSeed(seed);
            }}
          />
        )}

        {/* Preview */}
        <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
          <img
            src={avatarUrl(avatarSeed, selectedStyle)}
            alt="Preview"
            className="w-12 h-12 rounded-full bg-gray-100"
          />
          <div>
            <p className="font-medium text-gray-900">{name || "Your name"}</p>
            <p className="text-sm text-gray-500">@{handleValue || "handle"}</p>
            {bio && <p className="text-xs text-gray-400 mt-0.5">{bio}</p>}
          </div>
        </div>

        <div className="flex gap-2 justify-end">
          <Button onClick={handleSave} disabled={saving}>
            {success ? "Saved!" : saving ? "Saving..." : "Save changes"}
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}

// ── Avatar picker gallery ─────────────────────────────────────────────

function AvatarPicker({ currentStyle, currentSeed, onSelect }: {
  currentStyle: AvatarStyle;
  currentSeed: string;
  onSelect: (style: AvatarStyle, seed: string) => void;
}) {
  const [browsingStyle, setBrowsingStyle] = useState<AvatarStyle>(currentStyle);
  const [customSeed, setCustomSeed] = useState("");

  // Generate a set of seeds: the user's current seed + pool of fun words
  const seeds = [currentSeed, ...SEED_POOL.filter((s) => s !== currentSeed)];

  // If user typed a custom seed, prepend it
  const displaySeeds = customSeed.trim()
    ? [customSeed.trim(), ...seeds]
    : seeds;

  return (
    <div className="border border-gray-200 rounded-lg p-3 space-y-3">
      {/* Style tabs — scrollable row */}
      <div>
        <p className="text-xs font-medium text-gray-500 mb-2">Style</p>
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {AVATAR_STYLES.map((style) => (
            <button
              key={style}
              type="button"
              onClick={() => setBrowsingStyle(style)}
              className={`shrink-0 px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                browsingStyle === style
                  ? "bg-brand text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {AVATAR_STYLE_LABELS[style] ?? style}
            </button>
          ))}
        </div>
      </div>

      {/* Custom seed input */}
      <div>
        <Input
          value={customSeed}
          onChange={(e) => setCustomSeed(e.target.value)}
          placeholder="Type a word to generate more options..."
          className="text-sm"
        />
      </div>

      {/* Avatar grid for the selected style */}
      <div className="grid grid-cols-6 sm:grid-cols-8 gap-2">
        {displaySeeds.slice(0, 24).map((seed) => {
          const isSelected = browsingStyle === currentStyle && seed === currentSeed;
          return (
            <button
              key={`${browsingStyle}-${seed}`}
              type="button"
              onClick={() => onSelect(browsingStyle, seed)}
              className={`p-1 rounded-lg border-2 transition-colors ${
                isSelected
                  ? "border-brand bg-brand-50"
                  : "border-transparent hover:border-gray-300"
              }`}
            >
              <img
                src={avatarUrl(seed, browsingStyle)}
                alt={seed}
                className="w-full aspect-square rounded-full bg-gray-100"
                loading="lazy"
              />
            </button>
          );
        })}
      </div>

      <p className="text-xs text-gray-400">
        Click any avatar to select it. Type a word above to see new faces.
      </p>
    </div>
  );
}

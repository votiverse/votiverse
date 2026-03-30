import { useState, useEffect } from "react";
import { Link, useSearchParams } from "react-router";
import { useTranslation } from "react-i18next";
import { formatDate } from "../lib/format.js";
import { useIdentity } from "../hooks/use-identity.js";
import * as api from "../api/client.js";
import * as oauthApi from "../api/oauth.js";
import type { Group, DelegateProfile, VotingHistory } from "../api/types.js";
import { Card, CardHeader, CardBody, Button, Input, Label, Spinner, ErrorBox } from "../components/ui.js";
import { Avatar, AVATAR_STYLES, AVATAR_STYLE_LABELS, avatarUrl, type AvatarStyle } from "../components/avatar.js";
import { Sun, Monitor, Moon, Globe, Palette, User, Link2, LogOut, MessageSquare, FileText } from "lucide-react";
import { useTheme, type ThemeMode } from "../hooks/use-theme.js";
import { ALL_LOCALES, LOCALE_NAMES } from "../locales.js";

// ── Tab definitions ──────────────────────────────────────────────────

type ProfileTab = "activity" | "language" | "appearance" | "accounts";

const TAB_ICONS: Record<ProfileTab, typeof User> = {
  activity: User,
  language: Globe,
  appearance: Palette,
  accounts: Link2,
};

// ── Main profile page ────────────────────────────────────────────────

interface GroupProfileData {
  group: Group;
  profile: DelegateProfile | null;
  history: VotingHistory | null;
}

export function Profile() {
  const { t } = useTranslation("governance");
  const { storeUserId, participantName, handle, email, memberships, clearIdentity } = useIdentity();
  const [searchParams, setSearchParams] = useSearchParams();
  const [data, setData] = useState<GroupProfileData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  const activeTab = (searchParams.get("tab") as ProfileTab) || "activity";
  const setActiveTab = (tab: ProfileTab) => {
    if (tab === "activity") {
      setSearchParams({}, { replace: true });
    } else {
      setSearchParams({ tab }, { replace: true });
    }
  };

  useEffect(() => {
    if (!storeUserId || memberships.length === 0) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const membershipMap = new Map(
          memberships.map((m) => [m.groupId, m.participantId]),
        );
        const allAssemblies = await api.listGroups();
        const groups = allAssemblies.filter((a) => membershipMap.has(a.id));
        const results: GroupProfileData[] = [];

        await Promise.allSettled(
          groups.map(async (grp) => {
            const pid = membershipMap.get(grp.id)!;
            const [profileRes, historyRes] = await Promise.allSettled([
              api.getDelegateProfile(grp.id, pid),
              api.getVotingHistory(grp.id, pid),
            ]);

            results.push({
              group: grp,
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
        <p className="text-text-muted">{t("profile.noIdentity")}</p>
      </div>
    );
  }

  if (loading) return <Spinner />;
  if (error) return <div className="max-w-3xl mx-auto"><ErrorBox message={error} /></div>;

  const totalVotes = data.reduce((sum, d) => sum + (d.history?.history.length ?? 0), 0);
  const totalDelegators = data.reduce((sum, d) => sum + (d.profile?.delegatorsCount ?? 0), 0);
  const totalOutbound = data.reduce((sum, d) => sum + (d.profile?.myDelegations.length ?? 0), 0);

  const tabs: ProfileTab[] = ["activity", "language", "appearance", "accounts"];

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl sm:text-2xl font-bold font-display text-text-primary">{t("profile.title")}</h1>
        <div className="flex items-center gap-4">
          <Link
            to="/feedback"
            className="flex items-center gap-1.5 text-sm text-text-muted hover:text-text-secondary transition-colors"
          >
            <MessageSquare size={15} />
            {t("profile.feedback")}
          </Link>
          <Link
            to="/terms"
            className="flex items-center gap-1.5 text-sm text-text-muted hover:text-text-secondary transition-colors"
          >
            <FileText size={15} />
            {t("profile.terms")}
          </Link>
          <button
            onClick={() => clearIdentity()}
            className="flex items-center gap-1.5 text-sm text-text-muted hover:text-error-text transition-colors"
          >
            <LogOut size={15} />
            {t("profile.logout")}
          </button>
        </div>
      </div>

      {/* Identity card — always visible above tabs */}
      <Card className="mb-4">
        <CardBody>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Avatar name={participantName ?? "?"} size="lg" />
              <div>
                <p className="font-semibold text-text-primary text-lg">{participantName}</p>
                {handle && <p className="text-sm text-text-muted">@{handle}</p>}
                {email && <p className="text-xs text-text-tertiary">{email}</p>}
              </div>
            </div>
            <Button variant="secondary" size="sm" onClick={() => setEditing(!editing)}>
              {editing ? t("proposals.doneEditing") : t("proposals.edit")}
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
            window.location.reload();
          }}
        />
      )}

      {/* Tab bar */}
      <div className="flex overflow-x-auto hide-scrollbar gap-1 mb-6 border-b border-border-subtle">
        {tabs.map((tab) => {
          const Icon = TAB_ICONS[tab];
          const active = activeTab === tab;
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex items-center gap-1.5 px-3 pb-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                active
                  ? "border-accent text-accent-text"
                  : "border-transparent text-text-muted hover:text-text-primary hover:border-border-strong"
              }`}
            >
              <Icon size={15} strokeWidth={1.5} />
              {t(`profile.tab.${tab}`)}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      {activeTab === "activity" && (
        <ActivityTab data={data} totalVotes={totalVotes} totalDelegators={totalDelegators} totalOutbound={totalOutbound} />
      )}
      {activeTab === "language" && <LanguageTab />}
      {activeTab === "appearance" && <AppearanceTab />}
      {activeTab === "accounts" && <AccountsTab />}
    </div>
  );
}

// ── Activity tab ─────────────────────────────────────────────────────

function ActivityTab({ data, totalVotes, totalDelegators, totalOutbound }: {
  data: GroupProfileData[];
  totalVotes: number;
  totalDelegators: number;
  totalOutbound: number;
}) {
  const { t } = useTranslation("governance");

  return (
    <>
      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-3 mb-8">
        <Link to="/profile/votes">
          <Card className="hover:border-accent-muted hover:shadow active:border-accent transition-all">
            <CardBody className="text-center py-4">
              <div className="text-2xl font-semibold text-text-primary">{totalVotes}</div>
              <div className="text-xs text-text-muted mt-0.5">{t("profile.votesCast")}</div>
            </CardBody>
          </Card>
        </Link>
        <Link to="/profile/delegators">
          <Card className="hover:border-accent-muted hover:shadow active:border-accent transition-all">
            <CardBody className="text-center py-4">
              <div className="text-2xl font-semibold text-text-primary">{totalDelegators}</div>
              <div className="text-xs text-text-muted mt-0.5">{t("profile.delegators")}</div>
            </CardBody>
          </Card>
        </Link>
        <Link to="/profile/delegates">
          <Card className="hover:border-accent-muted hover:shadow active:border-accent transition-all">
            <CardBody className="text-center py-4">
              <div className="text-2xl font-semibold text-text-primary">{totalOutbound}</div>
              <div className="text-xs text-text-muted mt-0.5">{t("profile.myDelegates")}</div>
            </CardBody>
          </Card>
        </Link>
      </div>

      {/* Per-group breakdown */}
      {data.length > 0 && (
        <h2 className="text-sm font-medium text-text-muted mb-3">{t("profile.activityByGroup")}</h2>
      )}
      {data.map(({ group, profile, history }) => (
        <Card key={group.id} className="mb-4">
          <CardHeader>
            <Link to={`/group/${group.id}/events`} className="font-medium text-text-primary hover:text-accent-text transition-colors">
              {group.name}
            </Link>
          </CardHeader>
          <CardBody className="space-y-4">
            {profile && (
              <div className="space-y-2">
                {profile.delegatorsCount > 0 && (
                  <div>
                    <p className="text-xs text-text-muted mb-1">
                      {t("profile.delegatorsToYou", { count: profile.delegatorsCount })}
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {profile.delegators.map((d) => (
                        <span key={d.id} className="inline-flex items-center gap-1.5 text-xs bg-accent/10 text-accent-text px-2 py-1 rounded">
                          <Avatar name={d.name ?? "?"} size="xs" className="!w-4 !h-4" />
                          {d.name ?? d.id.slice(0, 8)}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {profile.myDelegations.length > 0 && (
                  <div>
                    <p className="text-xs text-text-muted mb-1">{t("profile.yourDelegates")}</p>
                    {profile.myDelegations.map((d, i) => (
                      <div key={i} className="flex items-center gap-2 text-sm text-text-secondary">
                        <Avatar name={d.targetName ?? "?"} size="xs" className="!w-4 !h-4" />
                        <span>
                          {d.targetName ?? d.targetId.slice(0, 8)}
                          {d.topicScope.length === 0 ? ` ${t("profile.globalScope")}` : ` ${t("profile.topicScope", { count: d.topicScope.length })}`}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                {profile.delegatorsCount === 0 && profile.myDelegations.length === 0 && (
                  <p className="text-sm text-text-tertiary">{t("profile.noDelegatesInGroup")}</p>
                )}
              </div>
            )}

            {history && history.history.length > 0 && (
              <div>
                <p className="text-xs text-text-muted mb-2">
                  {t("profile.recentVotes", { count: history.history.length })}
                </p>
                <div className="space-y-1">
                  {history.history.slice(0, 5).map((entry, idx) => (
                    <div key={idx} className="flex items-center justify-between text-sm bg-surface rounded px-3 py-2">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <span className="capitalize font-medium text-text-primary shrink-0">{entry.choice}</span>
                        <span className="text-xs text-text-muted truncate">{entry.issueTitle ?? entry.issueId.slice(0, 12)}</span>
                      </div>
                      <span className="text-xs text-text-tertiary">
                        {formatDate(entry.votedAt)}
                      </span>
                    </div>
                  ))}
                  {history.history.length > 5 && (
                    <p className="text-xs text-text-tertiary text-center mt-1">
                      {t("profile.moreVotes", { count: history.history.length - 5 })}
                    </p>
                  )}
                </div>
              </div>
            )}
            {history && history.history.length === 0 && (
              <p className="text-sm text-text-tertiary">{t("profile.noVotesInGroup")}</p>
            )}
          </CardBody>
        </Card>
      ))}
    </>
  );
}

// ── Language tab ──────────────────────────────────────────────────────

function LanguageTab() {
  const { t, i18n } = useTranslation("settings");
  const currentLocale = i18n.language;
  const [saving, setSaving] = useState(false);

  const handleChange = async (newLocale: string) => {
    if (newLocale === currentLocale) return;
    setSaving(true);
    try {
      await api.updateProfile({ locale: newLocale });
      window.location.reload();
    } catch {
      setSaving(false);
    }
  };

  if (saving) return <Spinner />;

  return (
    <Card>
      <CardHeader>
        <h2 className="text-base font-medium text-text-primary">{t("language.preferred")}</h2>
        <p className="text-sm text-text-muted mt-1">{t("language.description")}</p>
      </CardHeader>
      <CardBody>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {ALL_LOCALES.map((locale) => (
            <button
              key={locale}
              onClick={() => handleChange(locale)}
              className={`text-left px-4 py-3 rounded-lg border transition-colors ${
                locale === currentLocale
                  ? "border-accent bg-accent-subtle text-accent-strong-text font-medium"
                  : "border-border-default hover:border-border-strong hover:bg-interactive-hover text-text-secondary"
              }`}
            >
              <span className="text-sm">{LOCALE_NAMES[locale] ?? locale}</span>
              {locale === currentLocale && (
                <span className="ml-2 text-xs text-accent-text">✓</span>
              )}
            </button>
          ))}
        </div>
      </CardBody>
    </Card>
  );
}

// ── Appearance tab ───────────────────────────────────────────────────

const THEME_MODES: { mode: ThemeMode; Icon: typeof Sun }[] = [
  { mode: "light", Icon: Sun },
  { mode: "system", Icon: Monitor },
  { mode: "dark", Icon: Moon },
];

function AppearanceTab() {
  const { t } = useTranslation("settings");
  const { mode, setMode } = useTheme();

  return (
    <Card>
      <CardHeader>
        <h2 className="text-base font-medium text-text-primary">{t("appearance.theme")}</h2>
        <p className="text-sm text-text-muted mt-1">{t("appearance.description")}</p>
      </CardHeader>
      <CardBody>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {THEME_MODES.map(({ mode: m, Icon }) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg border transition-colors ${
                m === mode
                  ? "border-accent bg-accent-subtle text-accent-strong-text font-medium"
                  : "border-border-default hover:border-border-strong hover:bg-interactive-hover text-text-secondary"
              }`}
            >
              <Icon size={20} />
              <span className="text-sm">{t(`appearance.${m}`)}</span>
              {m === mode && (
                <span className="ml-auto text-xs text-accent-text">✓</span>
              )}
            </button>
          ))}
        </div>
      </CardBody>
    </Card>
  );
}

// ── Accounts tab ─────────────────────────────────────────────────────

const PROVIDER_LABELS: Record<string, string> = {
  google: "Google",
  microsoft: "Microsoft",
};

const BASE_URL = import.meta.env.VITE_API_BASE_URL || "/api";

function AccountsTab() {
  const { t } = useTranslation("settings");
  const [linked, setLinked] = useState<oauthApi.LinkedProvider[]>([]);
  const [providers, setProviders] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [unlinking, setUnlinking] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [linkedRes, providersRes] = await Promise.all([
        oauthApi.getLinkedProviders(),
        oauthApi.getOAuthProviders(),
      ]);
      if (!cancelled) {
        setLinked(linkedRes);
        setProviders(providersRes);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (loading) return <Spinner />;
  if (providers.length === 0 && linked.length === 0) {
    return <p className="text-sm text-text-muted">{t("connectedAccounts.none")}</p>;
  }

  const linkedSet = new Set(linked.map((l) => l.provider));
  const unlinkedProviders = providers.filter((p) => !linkedSet.has(p));

  const handleUnlink = async (provider: string) => {
    setUnlinking(provider);
    try {
      await oauthApi.unlinkProvider(provider);
      setLinked((prev) => prev.filter((l) => l.provider !== provider));
    } catch {
      // Silently fail
    } finally {
      setUnlinking(null);
    }
  };

  const handleConnect = (provider: string) => {
    window.location.href = `${BASE_URL}/auth/oauth/${provider}?redirect=/profile?tab=accounts`;
  };

  return (
    <Card>
      <CardHeader>
        <h2 className="text-base font-medium text-text-primary">{t("connectedAccounts.title")}</h2>
        <p className="text-sm text-text-muted mt-1">{t("connectedAccounts.description")}</p>
      </CardHeader>
      <CardBody>
        <div className="space-y-2">
          {linked.map((l) => (
            <div key={l.provider} className="flex items-center justify-between py-2">
              <div className="flex items-center gap-2.5">
                <ProviderIcon provider={l.provider} />
                <div>
                  <p className="text-sm font-medium text-text-primary">{PROVIDER_LABELS[l.provider] ?? l.provider}</p>
                  {l.providerEmail && <p className="text-xs text-text-tertiary">{l.providerEmail}</p>}
                </div>
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => handleUnlink(l.provider)}
                disabled={unlinking === l.provider || linked.length <= 1}
              >
                {unlinking === l.provider ? t("connectedAccounts.unlinking") : t("connectedAccounts.disconnect")}
              </Button>
            </div>
          ))}
          {unlinkedProviders.map((provider) => (
            <div key={provider} className="flex items-center justify-between py-2">
              <div className="flex items-center gap-2.5">
                <ProviderIcon provider={provider} />
                <p className="text-sm text-text-muted">{PROVIDER_LABELS[provider] ?? provider}</p>
              </div>
              <Button variant="secondary" size="sm" onClick={() => handleConnect(provider)}>
                {t("connectedAccounts.connect")}
              </Button>
            </div>
          ))}
        </div>
      </CardBody>
    </Card>
  );
}

function ProviderIcon({ provider }: { provider: string }) {
  if (provider === "google") {
    return (
      <svg width="20" height="20" viewBox="0 0 18 18" fill="none" aria-hidden="true">
        <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4" />
        <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853" />
        <path d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05" />
        <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335" />
      </svg>
    );
  }
  if (provider === "microsoft") {
    return (
      <svg width="20" height="20" viewBox="0 0 21 21" fill="none" aria-hidden="true">
        <rect x="1" y="1" width="9" height="9" fill="#F25022" />
        <rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
        <rect x="1" y="11" width="9" height="9" fill="#00A4EF" />
        <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
      </svg>
    );
  }
  return <div className="w-5 h-5 rounded-full bg-text-tertiary" />;
}

// ── Profile editor ────────────────────────────────────────────────────

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
  const { t } = useTranslation("governance");
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
      setError(err instanceof Error ? err.message : t("profile.saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="mb-4">
      <CardBody className="space-y-4">
        <h3 className="font-medium text-text-primary">{t("profile.editProfile")}</h3>
        {error && <ErrorBox message={error} />}

        <div>
          <Label>{t("profile.nameLabel")}</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </div>

        <div>
          <Label>{t("profile.handleLabel")}</Label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary text-sm">@</span>
            <Input
              value={handleValue}
              onChange={(e) => setHandleValue(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
              className="pl-7"
              maxLength={30}
            />
          </div>
        </div>

        <div>
          <Label>{t("profile.bioLabel")}</Label>
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            className="block w-full rounded-xl border border-border-strong px-3 py-2 text-sm shadow-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-focus-ring"
            rows={2}
            maxLength={280}
            placeholder={t("profile.bioPlaceholder")}
          />
          <p className="text-xs text-text-tertiary mt-1">{bio.length}/280</p>
        </div>

        {/* Avatar — current + change button */}
        <div>
          <Label>{t("profile.avatarLabel")}</Label>
          <div className="flex items-center gap-3 mt-1">
            <img
              src={avatarUrl(avatarSeed, selectedStyle)}
              alt={t("profile.currentAvatar")}
              className="w-14 h-14 rounded-full bg-surface-sunken"
            />
            <Button variant="secondary" size="sm" onClick={() => setShowAvatarPicker(!showAvatarPicker)}>
              {showAvatarPicker ? t("profile.closePicker") : t("profile.chooseAvatar")}
            </Button>
          </div>
        </div>

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
        <div className="flex items-center gap-3 p-3 bg-surface rounded-lg">
          <img
            src={avatarUrl(avatarSeed, selectedStyle)}
            alt={t("profile.preview")}
            className="w-12 h-12 rounded-full bg-surface-sunken"
          />
          <div>
            <p className="font-medium text-text-primary">{name || t("profile.yourName")}</p>
            <p className="text-sm text-text-muted">@{handleValue || t("profile.handle")}</p>
            {bio && <p className="text-xs text-text-tertiary mt-0.5">{bio}</p>}
          </div>
        </div>

        <div className="flex gap-2 justify-end">
          <Button onClick={handleSave} disabled={saving}>
            {success ? t("profile.saved") : saving ? t("profile.saving") : t("profile.saveChanges")}
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
  const { t } = useTranslation("governance");
  const [browsingStyle, setBrowsingStyle] = useState<AvatarStyle>(currentStyle);
  const [customSeed, setCustomSeed] = useState("");

  const seeds = [currentSeed, ...SEED_POOL.filter((s) => s !== currentSeed)];
  const displaySeeds = customSeed.trim()
    ? [customSeed.trim(), ...seeds]
    : seeds;

  return (
    <div className="border border-border-default rounded-xl p-3 space-y-3">
      <div>
        <p className="text-xs font-medium text-text-muted mb-2">{t("profile.style")}</p>
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {AVATAR_STYLES.map((style) => (
            <button
              key={style}
              type="button"
              onClick={() => setBrowsingStyle(style)}
              className={`shrink-0 px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                browsingStyle === style
                  ? "bg-accent text-text-on-accent"
                  : "bg-surface-sunken text-text-secondary hover:bg-interactive-active"
              }`}
            >
              {AVATAR_STYLE_LABELS[style] ?? style}
            </button>
          ))}
        </div>
      </div>

      <div>
        <Input
          value={customSeed}
          onChange={(e) => setCustomSeed(e.target.value)}
          placeholder={t("profile.customSeedPlaceholder")}
          className="text-sm"
        />
      </div>

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
                  ? "border-accent bg-accent-subtle"
                  : "border-transparent hover:border-border-strong"
              }`}
            >
              <img
                src={avatarUrl(seed, browsingStyle)}
                alt={seed}
                className="w-full aspect-square rounded-full bg-surface-sunken"
                loading="lazy"
              />
            </button>
          );
        })}
      </div>

      <p className="text-xs text-text-tertiary">
        {t("profile.avatarPickerHint")}
      </p>
    </div>
  );
}

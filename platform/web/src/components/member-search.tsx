/**
 * Member search — typeahead search for finding assembly members.
 *
 * Per Paper II Section 2.6: participants can find anyone by name via
 * typeahead search, without exposing the full member list. The searcher
 * must know approximately who they're looking for.
 *
 * In candidacy mode, declared candidates are featured above the search.
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import type { Participant, Candidacy } from "../api/types.js";
import { Avatar } from "./avatar.js";
import { Badge } from "./ui.js";

interface MemberSearchProps {
  /** All participants in the assembly. */
  participants: Participant[];
  /** Current user's participant ID (excluded from results). */
  currentParticipantId: string;
  /** Called when a member is selected. */
  onSelect: (participantId: string) => void;
  /** Declared candidates (shown featured above search in candidacy mode). */
  candidates?: Candidacy[];
  /** Topic names for candidate topic badges. */
  topicNameMap?: Map<string, string>;
  /** Placeholder text for the search input. */
  placeholder?: string;
}

export function MemberSearch({
  participants,
  currentParticipantId,
  onSelect,
  candidates,
  topicNameMap,
  placeholder,
}: MemberSearchProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Filter participants by search query
  const filteredResults = query.length >= 2
    ? participants
        .filter((p) => p.id !== currentParticipantId)
        .filter((p) => p.name.toLowerCase().includes(query.toLowerCase()))
        .slice(0, 8) // Limit results
    : [];

  // Active candidates (exclude self)
  const activeCandidates = (candidates ?? [])
    .filter((c) => c.status === "active" && c.participantId !== currentParticipantId);

  // Get candidate's participant name
  const getName = useCallback((participantId: string) => {
    return participants.find((p) => p.id === participantId)?.name ?? participantId.slice(0, 8);
  }, [participants]);

  // Check if a participant is a declared candidate
  const isCandidate = useCallback((participantId: string) => {
    return activeCandidates.some((c) => c.participantId === participantId);
  }, [activeCandidates]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setFocused(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const handleSelect = (participantId: string) => {
    onSelect(participantId);
    setQuery("");
    setFocused(false);
  };

  const showDropdown = focused && (query.length >= 2 || activeCandidates.length > 0);

  return (
    <div ref={containerRef} className="relative">
      {/* Search input */}
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setFocused(true)}
          placeholder={placeholder ?? t("search.byName")}
          className="w-full border border-gray-300 rounded-lg px-4 py-2.5 pl-10 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400"
        />
        <svg
          className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
        </svg>
      </div>

      {/* Dropdown */}
      {showDropdown && (
        <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-80 overflow-y-auto">
          {/* Featured candidates section (candidacy mode) */}
          {activeCandidates.length > 0 && query.length < 2 && (
            <div>
              <div className="px-3 py-2 text-xs font-medium text-gray-500 uppercase tracking-wider bg-gray-50 border-b">
                {t("governance:candidates.declared")}
              </div>
              {activeCandidates.map((c) => (
                <CandidateRow
                  key={c.id}
                  candidacy={c}
                  name={getName(c.participantId)}
                  topicNameMap={topicNameMap}
                  onClick={() => handleSelect(c.participantId)}
                />
              ))}
              <div className="px-3 py-2 text-xs text-gray-400 border-t bg-gray-50">
                {t("search.orSearchAny")}
              </div>
            </div>
          )}

          {/* Search results */}
          {query.length >= 2 && (
            <>
              {filteredResults.length === 0 ? (
                <div className="px-4 py-3 text-sm text-gray-400">
                  {t("search.noResults", { query })}
                </div>
              ) : (
                <>
                  {activeCandidates.length > 0 && (
                    <div className="px-3 py-2 text-xs font-medium text-gray-500 uppercase tracking-wider bg-gray-50 border-b">
                      {t("search.results")}
                    </div>
                  )}
                  {filteredResults.map((p) => (
                    <MemberRow
                      key={p.id}
                      name={p.name}
                      isCandidate={isCandidate(p.id)}
                      onClick={() => handleSelect(p.id)}
                    />
                  ))}
                </>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Row components
// ---------------------------------------------------------------------------

function CandidateRow({
  candidacy,
  name,
  topicNameMap,
  onClick,
}: {
  candidacy: Candidacy;
  name: string;
  topicNameMap?: Map<string, string>;
  onClick: () => void;
}) {
  const { t } = useTranslation();
  const topics = candidacy.topicScope
    .map((tid) => topicNameMap?.get(tid) ?? tid.slice(0, 8))
    .slice(0, 3); // Show max 3 topics

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-blue-50 text-left transition-colors"
    >
      <Avatar name={name} size="sm" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-900 truncate">{name}</span>
          <Badge color="blue">{t("governance:candidate")}</Badge>
          {candidacy.voteTransparencyOptIn && (
            <Badge color="green">{t("governance:publicVotes")}</Badge>
          )}
        </div>
        {topics.length > 0 && (
          <p className="text-xs text-gray-500 truncate mt-0.5">
            {topics.join(", ")}
          </p>
        )}
      </div>
    </button>
  );
}

function MemberRow({
  name,
  isCandidate,
  onClick,
}: {
  name: string;
  isCandidate: boolean;
  onClick: () => void;
}) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-blue-50 text-left transition-colors"
    >
      <Avatar name={name} size="sm" />
      <span className="text-sm text-gray-900 truncate">{name}</span>
      {isCandidate && <Badge color="blue">{t("governance:candidate")}</Badge>}
    </button>
  );
}

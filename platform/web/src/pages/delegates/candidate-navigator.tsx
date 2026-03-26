import { useState, useRef, useEffect } from "react";
import { ChevronLeft, ChevronRight, ChevronsUpDown } from "lucide-react";
import type { Candidacy } from "../../api/types.js";
import { Avatar } from "../../components/avatar.js";

export function CandidateNavigator({
  candidacies,
  currentId,
  nameMap,
  onNavigate,
}: {
  candidacies: Candidacy[];
  currentId: string;
  nameMap: Map<string, string>;
  onNavigate: (candidacyId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const currentIndex = candidacies.findIndex((c) => c.id === currentId);
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < candidacies.length - 1;
  const currentName = nameMap.get(candidacies[currentIndex]?.participantId ?? "") ?? "";

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Focus input when dropdown opens
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const filtered = query.length >= 1
    ? candidacies.filter((c) => {
        const name = nameMap.get(c.participantId) ?? "";
        return name.toLowerCase().includes(query.toLowerCase());
      })
    : candidacies;

  const goPrev = () => {
    if (hasPrev) onNavigate(candidacies[currentIndex - 1]!.id);
  };
  const goNext = () => {
    if (hasNext) onNavigate(candidacies[currentIndex + 1]!.id);
  };

  return (
    <div className="flex items-center gap-2">
      {/* Prev */}
      <button
        onClick={goPrev}
        disabled={!hasPrev}
        className="w-9 h-9 flex items-center justify-center rounded-full border border-border-default bg-surface-raised text-text-muted hover:text-text-primary hover:border-border-strong disabled:opacity-30 disabled:cursor-not-allowed transition-all"
        aria-label="Previous candidate"
      >
        <ChevronLeft size={18} />
      </button>

      {/* Dropdown selector */}
      <div className="relative" ref={dropdownRef}>
        <button
          onClick={() => setOpen(!open)}
          className="flex items-center gap-1.5 px-3 h-9 rounded-full border border-border-default bg-surface-raised text-sm font-medium text-text-secondary hover:text-text-primary hover:border-border-strong transition-all"
        >
          <span className="truncate max-w-[180px]">{currentName}</span>
          <span className="text-xs text-text-tertiary">{currentIndex + 1}/{candidacies.length}</span>
          <ChevronsUpDown size={14} className="text-text-muted" />
        </button>

        {open && (
          <div className="absolute z-20 top-full mt-1 left-1/2 -translate-x-1/2 w-64 bg-surface-raised border border-border-default rounded-xl shadow-lg overflow-hidden">
            {/* Search input */}
            <div className="px-3 py-2 border-b border-border-subtle">
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search..."
                className="w-full text-sm bg-transparent text-text-primary placeholder:text-text-tertiary outline-none"
              />
            </div>

            {/* Candidate list */}
            <div className="max-h-48 overflow-y-auto">
              {filtered.map((c) => {
                const name = nameMap.get(c.participantId) ?? "";
                const isActive = c.id === currentId;
                return (
                  <button
                    key={c.id}
                    onClick={() => {
                      onNavigate(c.id);
                      setOpen(false);
                      setQuery("");
                    }}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-surface-sunken transition-colors ${isActive ? "bg-accent-subtle" : ""}`}
                  >
                    <Avatar name={name} size="xs" />
                    <span className={`text-sm truncate ${isActive ? "font-semibold text-text-primary" : "text-text-secondary"}`}>
                      {name}
                    </span>
                  </button>
                );
              })}
              {filtered.length === 0 && (
                <p className="px-3 py-2 text-sm text-text-tertiary">No matches</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Next */}
      <button
        onClick={goNext}
        disabled={!hasNext}
        className="w-9 h-9 flex items-center justify-center rounded-full border border-border-default bg-surface-raised text-text-muted hover:text-text-primary hover:border-border-strong disabled:opacity-30 disabled:cursor-not-allowed transition-all"
        aria-label="Next candidate"
      >
        <ChevronRight size={18} />
      </button>
    </div>
  );
}

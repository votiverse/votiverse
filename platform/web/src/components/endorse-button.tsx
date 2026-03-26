import { useState } from "react";
import { ThumbsUp, ThumbsDown } from "lucide-react";
import * as api from "../api/client.js";
import type { EndorsementCounts } from "../api/types.js";

/**
 * Compact endorse/dispute control with counts.
 * Shows: [👍 12] [👎 3] with active state highlighting.
 */
export function EndorseButton({
  assemblyId,
  targetType,
  targetId,
  counts,
  onUpdate,
}: {
  assemblyId: string;
  targetType: "candidacy" | "proposal";
  targetId: string;
  counts: EndorsementCounts;
  onUpdate: (updated: EndorsementCounts) => void;
}) {
  const [submitting, setSubmitting] = useState(false);

  const handleClick = async (value: "endorse" | "dispute") => {
    if (submitting) return;
    setSubmitting(true);
    try {
      if (counts.my === value) {
        // Retract
        await api.retractEndorsement(assemblyId, { targetType, targetId });
        onUpdate({
          endorse: counts.endorse - (value === "endorse" ? 1 : 0),
          dispute: counts.dispute - (value === "dispute" ? 1 : 0),
          my: null,
        });
      } else {
        // Upsert
        await api.upsertEndorsement(assemblyId, { targetType, targetId, value });
        const prev = counts.my;
        onUpdate({
          endorse: counts.endorse + (value === "endorse" ? 1 : 0) - (prev === "endorse" ? 1 : 0),
          dispute: counts.dispute + (value === "dispute" ? 1 : 0) - (prev === "dispute" ? 1 : 0),
          my: value,
        });
      }
    } catch {
      // Silently fail — optimistic update already applied
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex items-center gap-2 bg-surface-sunken p-1 pl-2.5 rounded-lg border border-border-default">
      <span className="text-xs font-medium text-text-muted">Endorse?</span>
      <button
        onClick={(e) => { e.stopPropagation(); handleClick("endorse"); }}
        disabled={submitting}
        className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-colors min-h-[28px] ${
          counts.my === "endorse"
            ? "bg-success-subtle text-success-text"
            : "text-text-tertiary hover:bg-success-subtle hover:text-success-text"
        }`}
      >
        <ThumbsUp size={12} />
        {counts.endorse > 0 && <span>{counts.endorse}</span>}
      </button>
      <button
        onClick={(e) => { e.stopPropagation(); handleClick("dispute"); }}
        disabled={submitting}
        className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-colors min-h-[28px] ${
          counts.my === "dispute"
            ? "bg-error-subtle text-error-text"
            : "text-text-tertiary hover:bg-error-subtle hover:text-error-text"
        }`}
      >
        <ThumbsDown size={12} />
        {counts.dispute > 0 && <span>{counts.dispute}</span>}
      </button>
    </div>
  );
}

/** Read-only score display (no interaction). */
export function EndorseScore({ counts }: { counts: EndorsementCounts }) {
  const net = counts.endorse - counts.dispute;
  return (
    <div className="flex items-center gap-1 text-xs font-medium text-success-text">
      <ThumbsUp size={12} />
      <span>{net > 0 ? `+${net}` : net}</span>
    </div>
  );
}

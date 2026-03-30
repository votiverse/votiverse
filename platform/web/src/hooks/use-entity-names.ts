/**
 * useEntityNames — resolves internal entity IDs to display names.
 *
 * Scans note content for internal URLs, extracts entity references,
 * and batch-fetches entity data to build a name map.
 */

import { useState, useEffect } from "react";
import * as api from "../api/client.js";
import type { CommunityNote } from "../api/types.js";
import { extractEntityRefs } from "../components/community-notes.js";

export function useEntityNames(
  groupId: string | undefined,
  notes: CommunityNote[],
): Map<string, string> {
  const [names, setNames] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    if (!groupId || notes.length === 0) return;

    // Collect all entity references from note content
    const allRefs: Array<{ type: string; id: string }> = [];
    for (const note of notes) {
      if (note.content?.markdown) {
        allRefs.push(...extractEntityRefs(note.content.markdown));
      }
    }
    if (allRefs.length === 0) return;

    // Deduplicate by type
    const byType = new Map<string, Set<string>>();
    for (const ref of allRefs) {
      const set = byType.get(ref.type) ?? new Set();
      set.add(ref.id);
      byType.set(ref.type, set);
    }

    // Fetch entity data for each type that has references
    const resolved = new Map<string, string>();

    const fetches: Promise<void>[] = [];

    if (byType.has("surveys")) {
      fetches.push(
        api.listSurveys(groupId).then((data) => {
          for (const s of data.surveys ?? []) {
            resolved.set(s.id, s.title);
          }
        }).catch(() => {}),
      );
    }

    if (byType.has("events")) {
      const ids = byType.get("events")!;
      for (const id of ids) {
        fetches.push(
          api.getEvent(groupId, id).then((event) => {
            if (event?.title) resolved.set(id, event.title);
          }).catch(() => {}),
        );
      }
    }

    if (byType.has("topics")) {
      fetches.push(
        api.listTopics(groupId).then((data) => {
          for (const t of data.topics ?? []) {
            resolved.set(t.id, t.name);
          }
        }).catch(() => {}),
      );
    }

    if (byType.has("candidacies")) {
      const ids = byType.get("candidacies")!;
      for (const id of ids) {
        fetches.push(
          api.getCandidacy(groupId, id).then((c) => {
            const name = c?.content?.title || c?.participantName || c?.handle;
            if (name) resolved.set(id, name);
          }).catch(() => {}),
        );
      }
    }

    if (byType.has("proposals")) {
      const ids = byType.get("proposals")!;
      for (const id of ids) {
        fetches.push(
          api.getProposal(groupId, id).then((p) => {
            if (p?.title) resolved.set(id, p.title);
          }).catch(() => {}),
        );
      }
    }

    Promise.all(fetches).then(() => {
      if (resolved.size > 0) setNames(new Map(resolved));
    });
  }, [groupId, notes]);

  return names;
}

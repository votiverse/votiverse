# Candidacy Lifecycle: Versioning, Withdrawal, and Note Persistence

**Status:** Approved design
**Date:** 2026-03-25
**Context:** Paper II Section 2.7, 5.2; Content Architecture Section 5.4, 6.8

---

## 1. Problem Statement

Delegate candidacies are "living documents with an immutable history" (Paper II, Section 2.7). The engine and VCP support versioning, withdrawal, and reactivation. But the web UI currently offers no way to edit, withdraw, or view version history for a candidacy. Additionally, the relationship between community notes and candidacy versions needs a clear, principled rule.

This document records the design decisions for candidacy lifecycle management and the note persistence principle.

---

## 2. Candidacy Lifecycle

### 2.1 States

```
                ┌───────────────────────────────────┐
     declare    │            ACTIVE                  │  edit (new version)
   ──────────►  │  versioned, public,                │ ◄──────────────────┐
                │  community-notable,                │ ───────────────────┘
                │  discoverable in candidacy mode    │
                └──────────┬────────────────────────┘
                           │ withdraw
                           ▼
                ┌───────────────────────────────────┐
                │          WITHDRAWN                 │
                │  record preserved,                 │
                │  notes preserved,                  │
                │  delegations remain active,        │
                │  not featured in discovery         │
                └──────────┬────────────────────────┘
                           │ re-declare
                           ▼
                      (back to ACTIVE,
                       same candidacy ID,
                       version history continues)
```

### 2.2 Operations

| Operation | Who | What happens |
|-----------|-----|-------------|
| **Declare** | Any participant | Creates a new candidacy (version 1). If the participant previously had a withdrawn candidacy, reactivates it with a new version instead. |
| **Edit** | Candidacy owner | Creates a new version. Previous versions are preserved. May update: markdown profile, website URL, topic scope, vote transparency opt-in. |
| **Withdraw** | Candidacy owner | Sets status to `withdrawn`. Existing delegations to this participant remain active. The public profile is removed from discovery, but the record and all community notes are preserved. |
| **Re-declare** | Candidacy owner (after withdrawal) | Reactivates the same candidacy with a new version. Version history continues from where it left off. |

### 2.3 What can change between versions

| Field | Mutable across versions? | Notes |
|-------|-------------------------|-------|
| Markdown profile | Yes | The primary content of the candidacy |
| Website URL | Yes | External link to the candidate's website |
| Topic scope | Yes | The candidate may expand or narrow their scope |
| Vote transparency opt-in | Yes | The candidate may choose to become more or less transparent |
| Participant ID | No | The candidacy is permanently tied to its author |
| Candidacy ID | No | Preserved across withdrawal and reactivation |

### 2.4 No expiration

Candidacies do not expire. Delegation in Votiverse is continuous, not cyclic — there are no election terms. A candidacy persists until the candidate withdraws it. This follows Paper II's model where delegation is an ongoing trust relationship.

If a delegate becomes inactive (stops voting), the awareness layer can surface this through activity indicators. But the platform does not automatically expire or deactivate candidacies.

---

## 3. Note Persistence Principle

### 3.1 The rule

**Community notes attach to the candidacy (or proposal), not to a specific version. They persist across all versions. They are never hidden or filtered by version.**

When a candidate edits their profile, all existing community notes remain visible on the updated profile. Version editing is not an escape hatch for unfavorable notes.

### 3.2 Rationale

This rule is motivated by three concerns:

**Preventing accountability evasion.** If notes were filtered by version, a candidate could evade scrutiny by publishing a trivial edit — a spelling correction, a reworded sentence — and all notes written against the previous version would disappear from default view. This would undermine the entire scrutiny infrastructure that Paper II describes as the foundation of self-sustaining governance.

**Community self-correction over editorial control.** If a note becomes irrelevant after a candidate addresses the concern in a new version, the community can downvote (dispute) the note. This is the self-correcting mechanism described in Paper II Section 4: layered evaluation where consensus emerges through community judgment, not through editorial control by any single participant (including the note's target).

**Consistency with established platforms.** Twitter/X's Community Notes persist across post edits. The note's relevance may change, but the community — not the post author — decides when a note no longer adds value. This is a battle-tested model.

### 3.3 Version context as metadata

While notes persist across versions, the UI should provide context:

- Each note records which version it was written against (the `versionNumber` field in `NoteTarget`). This is already stored in the VCP.
- When a candidacy has been updated since a note was written, the UI may display a subtle indicator: *"Written about version 2 (current: version 4)"*
- This helps evaluators assess relevance without hiding the note.

### 3.4 Implementation implications

- **Note queries** must filter by `targetType` and `targetId` only — never by `targetVersionNumber`. The version is metadata for display, not a filter.
- **The `versionNumber` on `NoteTarget`** remains useful for:
  - Displaying context ("this note references an earlier version")
  - Awareness layer: surfacing when a candidate changed positions after receiving notes
  - Audit: understanding the chronological relationship between notes and edits
- **No new data model changes needed.** The existing `NoteTarget.versionNumber` field serves this purpose correctly. The change is behavioral: the UI must never use it as a filter.

---

## 4. Website URL

### 4.1 Purpose

Candidates and assemblies can link to an external website for communication beyond the platform. The URL is stored in the backend (not the VCP) because it has no governance semantics.

### 4.2 Storage

- **Candidacies:** Stored per-version in `candidacy_content.website_url`. When the candidate edits their profile, they can update their URL. The latest version's URL is the current one.
- **Assemblies:** Stored in `assemblies_cache.website_url`. Updated via the assembly settings endpoint.

### 4.3 Validation

All website URLs are validated server-side to enforce `http://` or `https://` schemes only. This prevents XSS via `javascript:` or `data:` URIs. Max length: 2048 characters.

### 4.4 Website creation helper

When the URL field is empty, a subtle helper appears: *"Need a website? Browse templates"* with a link to [uniweb.app/templates](https://uniweb.app/templates). The category parameter is context-aware:
- Candidacies: `?category=campaign`
- Assemblies: `?category=organization`

This is a convenience, not a promotion. It appears once (when the field is empty), is a single line of helper text, and is easy to ignore.

---

## 5. UI Design

### 5.1 Candidate's own card

When viewing the Candidates page, the logged-in user's own candidacy card shows additional controls:

- **"Edit Profile"** button — opens a form pre-filled with the current version's content, website URL, topic scope, and transparency setting. Submitting creates a new version.
- **"Withdraw"** button — confirms, then withdraws the candidacy. The card updates to show withdrawn status.

### 5.2 Version indicator

When `currentVersion > 1`, the card shows a subtle *"Edited"* indicator near the declared date. This can expand to show version history — a list of version timestamps, each expandable to view that version's content.

### 5.3 Note display

Notes on candidacies are always shown on the current profile. If a note was written against an earlier version, a small version context indicator appears alongside the note. Notes are never hidden due to version changes.

---

## 6. Existing Infrastructure

The VCP and engine already support the full lifecycle:

| Endpoint | Status |
|----------|--------|
| `POST /assemblies/:id/candidacies` | Implemented (declare + reactivate) |
| `POST /assemblies/:id/candidacies/:cid/version` | Implemented |
| `POST /assemblies/:id/candidacies/:cid/withdraw` | Implemented |
| `GET /assemblies/:id/candidacies/:cid` | Implemented (returns version history) |

The backend needs proxy routes for version and withdraw. The web UI needs the edit/withdraw controls and version history display.

---

## 7. Known Bug: Sparse Topic Scope in Version Records

The VCP's version storage currently records `topic_scope` as NULL when not re-specified in a version update, rather than storing the full resolved scope. This makes it impossible to reconstruct the exact candidacy state at each version point.

**Fix required:** When creating a version, the VCP should store the full current topic scope (resolved from the update or carried forward from the previous version), not a sparse delta.

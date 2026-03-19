# Admission Control — Design Document

**Status:** Implemented (March 2026)

---

## 1. Problem

The Votiverse whitepaper (Section 12.2) states: *"At every scale, the platform must resist Sybil attacks — the creation of fake participants to multiply voting power."*

For invitation-based groups, Sybil resistance comes from **social verification by the administrator** — the admin personally knows who they're inviting. However, the original invite link system allowed anyone with a link to create throwaway accounts and join without admin verification. This breaks the social verification guarantee.

Different groups have different threat models. A small team where everyone knows each other has different needs than a municipal assembly. The platform must support a spectrum of admission controls.

## 2. Design Decision: Backend-Owned Mutable Setting

**`admissionMode` is NOT part of the immutable `GovernanceConfig`.** It is a backend-owned mutable setting.

### Rationale

GovernanceConfig fields (voting method, delegation, quorum, timeline) are immutable because they form the **social contract between members** — the rules you consent to when joining. Changing them after the fact would undermine consent.

Admission mode is fundamentally different:

1. **It happens before consent.** You experience admission policy as a prospective member, not a current one. You haven't agreed to anything yet.
2. **It doesn't affect how your vote counts.** Whether the group later tightens or loosens admission doesn't change the voting rules you agreed to.
3. **Admins have legitimate operational reasons to change it.** Start "open" for a founding sprint, then tighten to "approval" once the core is in. Or an "invite-only" board that opens up as it matures.
4. **Rigidity here hurts more than it helps.** Forcing someone to create a whole new assembly because they want to switch from "open" to "approval" is disproportionate.

### Storage

- Column `admission_mode TEXT NOT NULL DEFAULT 'approval'` on the backend's `assemblies_cache` table
- Changeable via `PUT /assemblies/:id/settings` (admin-only)
- The VCP has no knowledge of admission mode — it's purely a backend concern
- No engine package changes required

## 3. Three Modes

### Open (`"open"`)

Anyone with an invite link joins immediately. No admin approval step.

- **Use case:** Small, high-trust groups; public communities; onboarding events
- **Sybil risk:** High — a bad actor can create multiple accounts and join via the same link
- **UI warning:** Amber callout on invite link generation: *"This link lets anyone join and vote immediately. A bad actor could create multiple accounts to multiply their voting power."*

### Approval Required (`"approval"`) — Default

Anyone with an invite link can request to join. Admin must approve before membership is granted.

- **Use case:** Most groups — recommended default for MODERN_DEMOCRACY preset
- **Sybil risk:** Low — admin verifies each member
- **Flow:**
  1. User clicks invite link → sees group preview
  2. Clicks "Request to join" → `POST /invite/:token/accept` returns `202 Accepted`
  3. `join_requests` record created with status `"pending"`
  4. User sees confirmation: "Your request has been submitted. An admin will review it."
  5. Admin sees pending requests on Members page → approves or rejects
  6. On approval: membership created, user can participate

**Direct invitations bypass approval.** When an admin explicitly invites someone by handle, that IS the admin's verification. The invitee's acceptance creates membership immediately (201).

### Invite Only (`"invite-only"`)

No link invites at all. Members join only through direct invitation by handle.

- **Use case:** Formal boards, committees, sensitive votes
- **Sybil risk:** Very low — admin personally selects every member
- **Enforcement:** `POST /assemblies/:id/invitations` returns 403 when `type: "link"` is requested. "Invite link" and "Bulk invite" buttons hidden in web UI.

## 4. Default Link Expiration

All invite links now expire after **7 days** by default when no explicit `expiresAt` is provided. This prevents permanently-valid links from floating around the internet as an ongoing Sybil exposure.

Admins can override this with a custom `expiresAt` value. The expiration date is shown prominently in the UI next to the generated link.

## 5. Database Schema

### `assemblies_cache` (updated)

Added column:
```sql
admission_mode TEXT NOT NULL DEFAULT 'approval'
```

The `ON CONFLICT DO UPDATE` in `upsert()` does NOT update `admission_mode` — it's only set on initial INSERT and changeable via `updateAdmissionMode()`. This prevents VCP cache refreshes from overwriting the admin's setting.

### `join_requests` (new)

```sql
CREATE TABLE join_requests (
  id              TEXT PRIMARY KEY,
  assembly_id     TEXT NOT NULL,
  user_id         TEXT NOT NULL,
  user_name       TEXT NOT NULL,
  user_handle     TEXT,
  status          TEXT NOT NULL DEFAULT 'pending',  -- pending | approved | rejected
  reviewed_by     TEXT,                              -- admin user ID
  reviewed_at     TEXT,
  created_at      TEXT NOT NULL
);
```

Indexes on `(assembly_id, status)` and `(user_id)`.

## 6. API Endpoints

### Assembly Settings

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/assemblies/:id/settings` | Auth | Read admission mode |
| PUT | `/assemblies/:id/settings` | Admin | Update admission mode |

### Join Request Management

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/assemblies/:id/join-requests` | Admin | List pending requests |
| POST | `/assemblies/:id/join-requests/:reqId/approve` | Admin | Approve → creates membership |
| POST | `/assemblies/:id/join-requests/:reqId/reject` | Admin | Reject request |
| GET | `/me/join-requests` | Auth | User's pending requests |

### Modified Behavior

- `POST /invite/:token/accept` — returns 202 (pending) in approval mode, 201 (joined) in open mode
- `POST /assemblies/:id/invitations` — returns 403 for link invites in invite-only mode
- `GET /invite/:token` — includes `admissionMode` in group preview response

## 7. Risk-Aware UX

Three places where the UI educates about Sybil risk:

1. **Group creation** — admission mode selector with plain-language descriptions and an amber warning for open mode
2. **Invite link generation** — risk callout for open mode; approval info for approval mode; expiration date always visible
3. **Invite preview page** — `describeAdmissionMode()` adds a line to the governance rules summary so invitees see the admission policy before joining

## 8. Test Coverage

18 integration tests in `platform/backend/test/admission.test.ts`:

- Assembly settings: read, update (admin), auth (non-admin 403), validation
- Open mode: instant join via link invite
- Approval mode: join request (202), approve → membership, reject, admin list, non-admin 403, direct invite bypasses approval, duplicate prevention, user list
- Invite-only mode: link creation blocked (403), direct invite works
- Default expiration: 7-day default, explicit override
- Invite preview: includes admissionMode

## 9. Relationship to Whitepaper Identity Spectrum

The whitepaper (Section 12.1) describes four identity models:

| Model | Scale | Sybil Defense | Admission Mode |
|-------|-------|---------------|---------------|
| Invitation-based | Small groups | Social verification by admin | `approval` or `invite-only` |
| Organizational auth | Medium groups | Identity provider vouches | Future: SSO integration |
| Verified identity | Large civic | Government docs / biometrics | Future: identity verification |
| Cryptographic | Decentralized | Proof-of-personhood | Future: wallet integration |

The current admission control system implements the first tier. Future identity models (SSO, verified identity, cryptographic) would add additional `admissionMode` values or layer on top of the existing ones.

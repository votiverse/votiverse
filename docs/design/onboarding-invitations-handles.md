# Onboarding, Invitations, and User Handles

**Design Document — v1.0**
**March 2026**

---

## 1. Motivation

Votiverse has a working auth system (email + password, JWT tokens) and membership model (users join assemblies as participants). But three gaps prevent a real onboarding experience:

1. **No invitation mechanism.** Admins have no way to invite people to their group. Joining requires knowing the assembly ID and calling an API endpoint directly.

2. **No pre-join preview.** Users can't see a group's governance rules before joining. The welcome card appears *after* joining — too late for an informed decision.

3. **No public identity beyond name.** Members find each other by name in typeahead search, but names aren't unique, and there's no way to refer to someone without sharing their email address. Emails are auth credentials, not public identifiers.

This document addresses all three gaps with handles, invite links, direct invitations, and a group preview page.

---

## 2. Handles

### 2.1 What and why

A **handle** is a unique public identifier (e.g., `@sofia-reyes`) that replaces email as the way members are discovered and referenced. Handles are:

- Shown in member lists, search results, delegations, candidacy profiles, community notes
- Used by admins to find and invite users directly
- Used by members to find each other for delegation
- Never derived from or revealing the email address

Email remains the auth credential (login, password reset) but is **never shown to other members**. This follows the principle from Paper II §2.6: the client owns identity and discovery, the governance engine sees only opaque participant IDs.

### 2.2 Format

- Lowercase alphanumeric + hyphens: `[a-z0-9][a-z0-9-]{1,28}[a-z0-9]`
- 3–30 characters
- Must start and end with alphanumeric
- Unique across the platform (case-insensitive)

### 2.3 Auto-generation

At signup, the handle is auto-suggested from the display name:
1. Lowercase, replace spaces and non-alphanumeric with hyphens
2. Collapse consecutive hyphens, trim leading/trailing hyphens
3. If taken, append `-2`, `-3`, etc.

The user can edit the suggestion before confirming. The UI shows real-time availability (green check / red X) with debounced uniqueness checks.

### 2.4 Editability

Handles can be changed after signup via the profile settings page. The old handle becomes immediately available for others to claim. No redirect or alias — clean break. This is acceptable because handles are used for discovery, not for permanent references in governance data. The VCP uses opaque participant IDs, not handles.

---

## 3. Profile Fields

### 3.1 New user fields

| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| `handle` | TEXT UNIQUE | Yes (after migration) | Auto-generated from name | 3–30 chars, lowercase alphanumeric + hyphens |
| `avatar_url` | TEXT | No | null (falls back to DiceBear) | URL to uploaded image or preset selection |
| `bio` | TEXT | No | `''` | Short description, max 280 chars |

### 3.2 Database migration

```sql
ALTER TABLE users ADD COLUMN handle TEXT UNIQUE;
ALTER TABLE users ADD COLUMN avatar_url TEXT;
ALTER TABLE users ADD COLUMN bio TEXT NOT NULL DEFAULT '';
CREATE INDEX idx_users_handle ON users(handle);
```

Existing users (from seed) get handles auto-generated from their names during migration.

### 3.3 Profile editing

New endpoint: `PUT /me/profile`

Accepts: `{ handle?, name?, bio?, avatarUrl? }`

Validation:
- Handle: format check + uniqueness check
- Name: non-empty, trimmed
- Bio: max 280 chars
- Avatar URL: valid URL or null

### 3.4 Public profile lookup

New endpoint: `GET /users/:handle`

Returns: `{ handle, name, bio, avatarUrl, createdAt }`

Does NOT return: email, memberships, participant IDs. These are private.

---

## 4. Invitation System

### 4.1 Two invitation types

**Invite links** — Admin generates a shareable URL. Anyone with the link can join. This is the primary mechanism for most groups.

**Direct invitations** — Admin searches for a user by handle and sends them an invitation. The invitee sees it in their dashboard. This is for curated groups with selective membership.

### 4.2 Data model

```sql
CREATE TABLE invitations (
  id              TEXT PRIMARY KEY,
  assembly_id     TEXT NOT NULL,
  type            TEXT NOT NULL,          -- 'link' | 'direct'
  token           TEXT UNIQUE,            -- for link invites (null for direct)
  invited_by      TEXT NOT NULL,          -- user_id of the admin who created the invite
  invitee_handle  TEXT,                   -- for direct invites (null for link)
  max_uses        INTEGER,               -- null = unlimited (link invites only)
  use_count       INTEGER NOT NULL DEFAULT 0,
  expires_at      TEXT,                   -- null = never expires
  status          TEXT NOT NULL DEFAULT 'pending',  -- 'active' | 'expired' | 'revoked'
  created_at      TEXT NOT NULL,
  FOREIGN KEY (assembly_id) REFERENCES assemblies_cache(id)
);

CREATE TABLE invitation_acceptances (
  id              TEXT PRIMARY KEY,
  invitation_id   TEXT NOT NULL,
  user_id         TEXT NOT NULL,
  accepted_at     TEXT NOT NULL,
  FOREIGN KEY (invitation_id) REFERENCES invitations(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);
```

Link invites use `token` for URL generation. Direct invites use `invitee_handle` for targeting. The `invitation_acceptances` table tracks who accepted (for link invites that can be used multiple times).

### 4.3 Invite link flow

**Admin side:**
1. Opens group members page or settings
2. Clicks "Invite members"
3. Optionally sets max uses and expiration
4. System generates a link: `/invite/{token}`
5. Admin copies and shares via any channel

**Invitee side:**
1. Opens link → group preview page (public, no auth required to view)
2. Sees: group name, description, governance rules summary, owners/admins, member count
3. Clicks "Join this group"
4. If not logged in → signup/login flow, then redirected back
5. After auth → membership created, redirected to group dashboard with welcome card

### 4.4 Direct invitation flow

**Admin side:**
1. Opens members page
2. Searches for a user by handle
3. Clicks "Invite"
4. Invitation created with `type: 'direct'`, `invitee_handle: '@handle'`

**Invitee side:**
1. Sees notification on dashboard: "You've been invited to join [Group Name] by [Admin Name]"
2. Clicks → group preview page (same as invite link preview)
3. Accepts → membership created, redirected to group
4. Declines → invitation marked declined, removed from dashboard

### 4.5 Authorization

- **Creating invitations:** Requires admin role in the assembly
- **Revoking invitations:** Requires admin role
- **Listing invitations:** Requires admin role
- **Viewing invite link preview:** Public (no auth) — the governance rules are not secret
- **Accepting:** Requires authenticated user

---

## 5. Group Preview Page

The group preview is the key onboarding moment. It appears when someone follows an invite link or views a direct invitation. It shows:

1. **Group identity:** Name, description
2. **Governance rules:** Plain-language summary (reuses `summarizeRules()` from the welcome card)
3. **Leadership:** Owners and admins with avatars and names
4. **Scale:** Member count
5. **Immutability note:** "These rules are permanent and apply to all votes in this group."
6. **Action:** "Join this group" button (or "Log in to join" if unauthenticated)

The preview is served as a public page — no authentication required to view it. The governance rules of a group are not secret; transparency is a feature.

---

## 6. Updated Signup Flow

```
1. Enter display name
2. Choose handle (auto-suggested, editable, live availability check)
3. Enter email + password
4. [Optional: pick avatar from presets]
5. → Account created, logged in
6. If arrived via invite link → redirected to group preview → join
```

The handle field appears between name and email. It's pre-filled with the auto-suggestion, and the user can edit it. The availability check runs on blur or after 500ms of no typing.

---

## 7. API Endpoints

### Profile
```
PUT  /me/profile                          — update handle, name, bio, avatar
GET  /me/invitations                      — list pending direct invitations
POST /me/invitations/:invId/accept        — accept a direct invitation
POST /me/invitations/:invId/decline       — decline a direct invitation
```

### Invitations (admin)
```
POST   /assemblies/:id/invitations        — create invite (link or direct)
GET    /assemblies/:id/invitations        — list invitations for assembly
DELETE /assemblies/:id/invitations/:invId — revoke an invitation
```

### Public
```
GET  /invite/:token                       — group preview for invite link
POST /invite/:token/accept               — accept invite link (auth required)
GET  /users/:handle                       — public profile by handle
GET  /users/check-handle/:handle         — handle availability check
```

---

## 8. Implementation Plan

### Phase 1: Handles + profile editing (backend + web)

1. Add `handle`, `avatar_url`, `bio` columns to users table (SQLite + PostgreSQL)
2. Auto-generate handles for existing users (migration/seed update)
3. Add handle to registration flow (backend: validation, uniqueness, auto-generation)
4. Add `PUT /me/profile` endpoint
5. Add `GET /users/:handle` public profile endpoint
6. Add `GET /users/check-handle/:handle` availability endpoint
7. Update `GET /me` to include handle, bio, avatarUrl
8. Update web signup form: add handle field with live availability
9. Add profile editing page (handle, name, bio)
10. Update member search to show handles
11. Update member list, avatar, and profile pages to show handles
12. Update seed script to generate handles for test users
13. Tests

### Phase 2: Invite links (backend + web)

14. Add `invitations` and `invitation_acceptances` tables
15. Add `POST /assemblies/:id/invitations` (create link invite, admin auth)
16. Add `GET /assemblies/:id/invitations` (list, admin auth)
17. Add `DELETE /assemblies/:id/invitations/:invId` (revoke, admin auth)
18. Add `GET /invite/:token` (public group preview)
19. Add `POST /invite/:token/accept` (join via link, auth required)
20. Add group preview page (web): governance rules, leadership, member count
21. Add "Invite members" UI on members page
22. Add invite link generation + copy UI
23. Handle redirect-after-signup flow for invite links
24. Tests

### Phase 3: Direct invitations

25. Add `POST /assemblies/:id/invitations` for direct type (handle-based)
26. Add `GET /me/invitations` (pending invitations)
27. Add `POST /me/invitations/:invId/accept` and `/decline`
28. Add invitation notifications on dashboard
29. Add "Invite by handle" search UI on members page
30. Tests

### Phase 4: Avatar selection

31. Avatar preset gallery (curated set of DiceBear styles/seeds)
32. Avatar upload (image crop, resize, storage)
33. Profile page avatar editor
34. Signup avatar picker (optional step)
35. Tests

---

## 9. Security Considerations

- **Invite link tokens** are cryptographically random (32 bytes, base64url). They cannot be guessed or enumerated.
- **Handle enumeration** is a mild privacy risk (you can check if `@john-doe` exists). This is acceptable because handles are designed to be public. The availability check is rate-limited.
- **Email remains private.** No endpoint exposes email to other users. Even admins see only handles and names.
- **Invite link preview is public.** Group governance rules are not secret — they're the transparent foundation of trust. Showing them publicly is a feature, not a leak.
- **Direct invitations** do not reveal membership. Sending an invite to `@handle` does not confirm whether that person is already a member. The backend checks silently and returns a generic "invitation sent" response either way.

---

*This document covers the onboarding journey from signup through group membership. It does not cover email verification, social auth, or phone-based signup — those are production hardening concerns that can be layered on later without architectural changes.*

# Web Client — Implementation Report

**Date:** 2026-03-14
**Status:** Complete — builds cleanly, all views functional

---

## What was built

A lightweight single-page application for interacting with the Votiverse Cloud Platform. This is a developer/evaluation client — clean, functional, and real, but not a production UI.

### Stack

| Component | Version | Rationale |
|-----------|---------|-----------|
| Vite | 8.0.0 | Latest, fast dev server with HMR |
| React | 19.2 | Latest stable with hooks |
| Tailwind CSS | 4.2 | Utility-first CSS, v4 with `@tailwindcss/vite` plugin |
| React Router | 7.13 | SPA routing |
| TypeScript | 5.9 | Strict type checking |

No component library — all components built with Tailwind utility classes.

### Architecture

```
platform/web/
├── src/
│   ├── api/
│   │   ├── types.ts           # TypeScript types mirroring VCP responses
│   │   └── client.ts          # Typed fetch wrapper for all VCP endpoints
│   ├── components/
│   │   ├── layout.tsx         # Header, nav, participant selector
│   │   └── ui.tsx             # Shared primitives (Card, Button, Input, Badge, etc.)
│   ├── hooks/
│   │   ├── use-api.ts         # Data fetching hook with loading/error states
│   │   └── use-participant.ts # Participant context for role-switching
│   ├── pages/
│   │   ├── assembly-list.tsx  # Home page — list + create assemblies
│   │   ├── assembly-dashboard.tsx  # Assembly overview with stats
│   │   ├── members.tsx        # Participant management
│   │   ├── events-list.tsx    # Voting events list + create
│   │   ├── event-detail.tsx   # Tally visualization + voting
│   │   ├── delegations.tsx    # Delegation management + chain visualization
│   │   ├── polls.tsx          # Poll creation + responses + results
│   │   └── awareness.tsx      # Concentration metrics, profiles, history
│   ├── app.tsx                # Router setup + participant context provider
│   ├── main.tsx               # Entry point
│   └── index.css              # Tailwind + brand colors
├── index.html
├── vite.config.ts             # Vite config with API proxy
├── tailwind.config.ts
├── tsconfig.json
└── package.json
```

---

## Views

### 1. Assembly List (Home)
- Lists all assemblies from VCP
- Shows name, preset, status, creation date
- "Create Assembly" form with preset selector (all 6 presets)

### 2. Assembly Dashboard
- Assembly info and governance config summary
- Stats cards: members, events, delegations, quorum threshold
- Governance config details (delegation rules, ballot settings, features)
- Recent events list with links

### 3. Members
- Participant list with IDs
- Add member form
- Remove member with confirmation
- Links to profile and voting history

### 4. Voting Events
- Event list with issue counts and dates
- Create event form (title, issues, auto-opens voting for 7 days)
- All current members auto-added as eligible

### 5. Event Detail
The most important view:
- Event status, timeline
- Per-issue vote buttons (for/against/abstain) — only visible when voting is open
- **Weighted tally bars** showing vote counts with delegation weights
- Winner badge
- **Weight distribution grid** showing each voter's effective weight and how much is delegated
- Quorum status

### 6. Delegations
Split into two panels:
- **Active delegations list** showing source → target with arrows, scope, and revoke buttons
- **Chain resolver**: select a participant + issue, click "Resolve Chain" to see the full delegation chain visualized as connected nodes (source → intermediary → terminal voter)

### 7. Polls
- Create polls with question type selector (yes/no, likert 1-5, direction)
- Respond to polls as the selected participant
- View results with response counts and distributions
- Polls tracked client-side (VCP lacks a list-polls endpoint)

### 8. Awareness
Three panels:
- **Concentration metrics**: select an issue, see Gini coefficient, max weight holder, chain length distribution, and a visual concentration bar
- **Delegate profile**: select a participant, see who delegates to them and their own delegations
- **Voting history**: select a participant, see their complete vote record

---

## Participant Selector

A dropdown in the header that appears when viewing an assembly. Lets you switch which participant you're "acting as":
- Selecting "Alice" means votes and delegations are cast as Alice
- Switching to "Bob" shows Bob's perspective
- The selector populates from the assembly's participant list

This is the key UX feature that makes the client useful for evaluation — you can experience the governance system from multiple viewpoints.

---

## API Connection

- The Vite dev server proxies `/api/*` to `http://localhost:3000` (the VCP), stripping the `/api` prefix
- API key is configured in the client module (default: `vcp_dev_key_00000000`)
- All API calls return typed responses matching VCP response shapes
- Loading and error states are handled by the `useApi` hook

---

## VCP Changes Required

Two changes were made to the VCP to support the web client:

### 1. CORS middleware
Added `hono/cors` middleware to `platform/vcp/src/api/server.ts` to allow cross-origin requests from the web client in development.

### 2. `GET /assemblies` endpoint
Added a list-all-assemblies endpoint and `AssemblyManager.listAssemblies()` method. The web client needs this to show the assembly list on the home page.

Both changes are backward-compatible and don't affect existing tests (all 16 VCP tests still pass).

---

## Design

- **Brand blue**: `#185FA5` used for primary actions, active states, and accents
- **Neutral palette**: Gray tones for structure, white cards on gray-50 background
- **Typography**: System font stack, readable sizing, good hierarchy
- **Layout**: Max-width containers, generous whitespace, responsive grid
- **States**: Loading spinners, error boxes with retry, empty states with CTAs

---

## How to run

```bash
# Terminal 1: Start VCP
cd platform/vcp
pnpm dev

# Terminal 2: Seed data (optional but recommended)
cd platform/vcp
pnpm seed

# Terminal 3: Start web client
cd platform/web
pnpm dev
# Opens at http://localhost:5173
```

---

## Known limitations

- **Polls are tracked client-side** — the VCP lacks a `GET /assemblies/:id/polls` list endpoint, so polls created in one session aren't visible in the next
- **No topic management** — topics can't be created from the UI; issues are created without topic tags
- **Event timeline is auto-set** — voting opens immediately for 7 days; no date picker
- **No real-time updates** — data refreshes on user action, not via WebSocket
- **No prediction flow** — prediction commitment and evaluation are too complex for Phase 1
- **No mobile optimization** — desktop-first layout

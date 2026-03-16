# Votiverse Web Client

A lightweight React SPA for interacting with the Votiverse Cloud Platform. This is a developer and evaluation client — clean, functional, and real, but not the production UI. It connects to a local VCP instance and provides visual access to the full governance system: assemblies, voting, delegations, polls, and awareness metrics.

---

## Prerequisites

Two backend services must be running:

1. **VCP server** at `http://localhost:3000` — the governance engine HTTP API. See the [VCP README](../vcp/README.md) for setup.
2. **Client backend** at `http://localhost:4000` — handles user authentication and proxies governance requests to VCP with participant identity injection. See the [Backend README](../backend/README.md) for setup.

## Quick Start

```bash
# From monorepo root
pnpm install

# Terminal 1 — VCP server (port 3000)
cd platform/vcp
pnpm reset && pnpm dev

# Terminal 2 — Client backend (port 4000)
cd platform/backend
pnpm seed && pnpm dev

# Terminal 3 — Web client (port 5174)
cd platform/web
pnpm dev
# → http://localhost:5174
```

To reset all data: `cd platform/vcp && pnpm reset`, then `cd platform/backend && pnpm seed`.

---

## Voter-Centric UX

The web client is designed as a **voter-centric experience**. The dashboard greets you by name, shows pending votes across all assemblies, and provides one-click access to vote. Key design principles:

- **Login** — On first visit, log in with your email and password. Each participant has a DiceBear avatar that stays consistent across all views.
- **Cross-assembly dashboard** — Aggregates pending votes, nearest deadlines, and assembly summaries across all assemblies where the selected participant is a member.
- **Delegation visibility** — When your vote is delegated, the delegate's name and avatar appear inline. Delegation chains are visualized with arrows.
- **Neutral vote buttons** — For/Against/Abstain are visually identical (no choice is privileged). Tally bars use a rank-based color palette.

## Views

| View | Route | Description |
|------|-------|-------------|
| **Dashboard** | `/` | Cross-assembly: pending votes, deadlines, assembly cards |
| **Assembly List** | `/assemblies` | Browse and create assemblies |
| **Assembly Overview** | `/assembly/:id` | Assembly stats, governance config, recent events |
| **Members** | `/assembly/:id/members` | Participant list with avatars, profile/history links |
| **Events** | `/assembly/:id/events` | Voting events with status badges and vote progress |
| **Event Detail** | `/assembly/:id/events/:eid` | Vote buttons, weighted tally bars, weight distribution grid |
| **Delegations** | `/assembly/:id/delegations` | Active delegations with avatars, chain resolver |
| **Polls** | `/assembly/:id/polls` | Create polls, submit responses, view results |
| **Profile** | `/profile` | Cross-assembly profile: vote count, delegators, history |

---

## Identity & Authentication

The header shows your current identity with a DiceBear avatar. Click to open the identity menu:

- **Profile** — See your cross-assembly voting stats and delegation info
- **Logout** — End your session and return to the login screen

Authentication is handled by the client backend (port 4000). The web client sends JWT access tokens with each request. The backend resolves the authenticated user to the appropriate participant ID per assembly and injects it into VCP requests.

---

## Configuration

The web client talks to the client backend at `http://localhost:4000`, not to VCP directly. The Vite dev server proxies `/api/*` requests to the backend. The proxy target is configured in `vite.config.ts`.

To point at a different backend URL (e.g., in production or Tauri), set the `VITE_API_BASE_URL` environment variable.

---

## Stack

| Component | Version |
|-----------|---------|
| Vite | 8.0 |
| React | 19.2 |
| Tailwind CSS | 4.2 |
| React Router | 7.13 |
| TypeScript | 5.9 |

No component library — all UI components are built with Tailwind utility classes. Brand color: `#185FA5`.

---

## Links

- [Root README](../../README.md) — project overview and quick start
- [VCP README](../vcp/README.md) — governance server setup and API reference
- [Web Client Report](../../docs/web-client-report.md) — implementation details and known limitations

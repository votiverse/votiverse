# Votiverse Web Client

A lightweight React SPA for interacting with the Votiverse Cloud Platform. This is a developer and evaluation client — clean, functional, and real, but not the production UI. It connects to a local VCP instance and provides visual access to the full governance system: assemblies, voting, delegations, polls, and awareness metrics.

---

## Prerequisites

The VCP server must be running at `http://localhost:3000` (the default). See the [VCP README](../vcp/README.md) for setup.

## Quick Start

```bash
# From monorepo root
pnpm install

# Start the VCP (Terminal 1)
cd platform/vcp
pnpm dev

# Seed sample data (Terminal 2)
cd platform/vcp
pnpm seed

# Start the web client (Terminal 3)
cd platform/web
pnpm dev
# → http://localhost:5174
```

To reset the VCP database to fresh seed data at any time: `cd platform/vcp && pnpm reset`.

---

## Voter-Centric UX

The web client is designed as a **voter-centric experience**. The dashboard greets you by name, shows pending votes across all assemblies, and provides one-click access to vote. Key design principles:

- **Identity picker** — On first visit, select who you are from a list of seeded participants. Each participant has a DiceBear avatar that stays consistent across all views.
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

## Identity Switching

The header shows your current identity with a DiceBear avatar. Click to open the identity menu:

- **Profile** — See your cross-assembly voting stats and delegation info
- **Switch Identity** — Return to the identity picker to become a different participant

Cross-assembly participants (e.g. Sofia Reyes in OSC and Youth Advisory) are deduplicated in the picker by name. Selecting one shows data from all assemblies where that name appears.

---

## Configuration

The Vite dev server proxies `/api/*` requests to the VCP at `http://localhost:3000`. The proxy is configured in `vite.config.ts`. To change the VCP URL, edit the proxy target.

The API key is configured in `src/api/client.ts` (default: `vcp_dev_key_00000000`). This matches the VCP's default dev key.

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

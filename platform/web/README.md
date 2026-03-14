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
# → http://localhost:5173
```

---

## Views

| View | Route | Description |
|------|-------|-------------|
| **Assembly List** | `/` | List and create assemblies with preset selector |
| **Dashboard** | `/assembly/:id` | Assembly overview: stats, governance config, recent events |
| **Members** | `/assembly/:id/members` | Add/remove participants, links to profiles and history |
| **Events** | `/assembly/:id/events` | List voting events, create new events with issues |
| **Event Detail** | `/assembly/:id/events/:eid` | Vote buttons, weighted tally bars, weight distribution grid |
| **Delegations** | `/assembly/:id/delegations` | Create/revoke delegations, chain visualization |
| **Polls** | `/assembly/:id/polls` | Create polls, submit responses, view results |
| **Awareness** | `/assembly/:id/awareness` | Concentration metrics, delegate profiles, voting history |
| **Profile** | `/assembly/:id/awareness/profile/:pid` | Individual delegate profile page |

---

## Participant Selector

The header contains a **participant selector** — a dropdown that lets you switch which participant you're acting as. This is the key UX feature for evaluation:

- Select **Alice** → votes, delegations, and polls are submitted as Alice
- Switch to **Carol** → you see Carol's perspective, her delegation weight, her history
- Cast a vote as Carol → watch the weighted tally update, then switch to Alice and see the delegation chain

Without real user authentication, this simulates multiple users interacting with the governance system from a single browser.

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

# Votiverse Testing Guide

Comprehensive reference for all testing approaches: seed data, dev clock, unit tests, integration tests, and manual UI testing.

---

## 1. Quick Start

```bash
# Terminal 1 — VCP (port 3000)
cd platform/vcp && pnpm reset && pnpm dev

# Terminal 2 — Client backend (port 4000)
cd platform/backend && pnpm reset && pnpm dev

# Terminal 3 — Web UI (port 5173)
cd platform/web && pnpm dev
```

Open `http://localhost:5173` and log in with any seeded account (see Section 3).

---

## 2. Test Architecture

```
┌─────────────────────────────────────────────────┐
│  Engine unit tests (319 tests)                  │  vitest, in-memory
│  packages/*/tests/                              │  No server needed
├─────────────────────────────────────────────────┤
│  VCP integration tests (55 tests)               │  vitest, in-memory SQLite
│  platform/vcp/test/                             │  TestClock for time control
├─────────────────────────────────────────────────┤
│  Backend integration tests (13 tests)           │  vitest, in-memory SQLite
│  platform/backend/test/                         │  Auth lifecycle tests
├─────────────────────────────────────────────────┤
│  Seed data + manual UI testing                  │  3 servers running
│  Dev clock widget for time manipulation         │  Browser-based
└─────────────────────────────────────────────────┘
```

### Running all tests

```bash
# Engine packages (319 tests across 12 packages)
pnpm --filter '@votiverse/*' test

# VCP server (55 tests)
cd platform/vcp && pnpm test

# Client backend (13 tests)
cd platform/backend && pnpm test
```

---

## 3. Seed Data

### How seeding works

The seed script creates 5 assemblies with realistic governance configurations, 63 participants, 15 voting events, 27 delegations, 180 votes, and 6 polls with 42 responses.

**VCP seed** (`platform/vcp/scripts/seed.ts`): Creates assemblies, participants, topics, events, delegations, votes, and polls in the VCP database. Uses the dev clock API to set the server time into each event's voting window before casting votes.

**Backend seed** (`platform/backend/scripts/seed.ts`): Reads participants from the VCP and creates matching user accounts with email `{slug}@example.com` and password `password`. Creates membership records linking users to their VCP participant IDs.

### Reseeding

```bash
# Full reset (wipes both databases, reseeds everything)
cd platform/vcp && pnpm reset && pnpm dev     # must start VCP first
cd platform/backend && pnpm reset             # seeds from running VCP

# Backend-only reset (keeps VCP data, recreates user accounts)
cd platform/backend && pnpm reset
```

**When to reseed:**
- After pulling new code that changes the seed data
- When voting events have naturally expired (timelines anchored to seed time)
- When you want a clean slate after testing

### Test credentials

All users: password is `password`.

**Cross-assembly accounts** (best for dashboard testing):

| Email | Name | Assemblies |
|-------|------|------------|
| `sofia-reyes@example.com` | Sofia Reyes | OSC Governance Board, Youth Advisory Panel |
| `marcus-chen@example.com` | Marcus Chen | OSC Governance Board, Municipal Budget Committee |
| `priya-sharma@example.com` | Priya Sharma | Municipal Budget Committee, Youth Advisory Panel |
| `james-okafor@example.com` | James Okafor | Municipal Budget Committee, Board of Directors |

**Single-assembly accounts** (for focused testing):

| Email | Assembly | Good for testing |
|-------|----------|-----------------|
| `elena-vasquez@example.com` | Greenfield | Direct voting (no delegation) |
| `chiara-rossi@example.com` | OSC | Delegation override (delegates globally, votes directly on some) |
| `nadia-boutros@example.com` | OSC | Depth-2 delegation chain (Nadia → Chiara → Mei-Ling) |
| `margaret-ashworth@example.com` | Board | Non-transitive proxy (single delegate) |
| `nina-kowalski@example.com` | Youth | Polls (already responded to some) |

### Assembly configurations

| Assembly | Preset | Delegation | Polls | Ballot | Members |
|----------|--------|-----------|-------|--------|---------|
| Greenfield Community Council | TOWN_HALL | Disabled | No | Public | 12 |
| OSC Governance Board | LIQUID_STANDARD | Transitive, topic-scoped | No | Public | 15 |
| Municipal Budget Committee | CIVIC_PARTICIPATORY | Transitive, depth=3 | Yes | Secret | 18 |
| Youth Advisory Panel | LIQUID_ACCOUNTABLE | Transitive, topic-scoped | Yes | Public | 10 |
| Board of Directors | BOARD_PROXY | Non-transitive, 1 delegate | No | Public | 8 |

---

## 4. Dev Clock — Time Manipulation

### The problem

Voting events have fixed timelines set at seed time. You can't test "what happens when voting closes" without either waiting days or manipulating time.

### The solution

The VCP exposes a **test clock API** (dev-only, never available in production). The web UI includes a floating **Dev Clock widget** in the bottom-right corner.

### UI widget

The widget appears automatically in dev mode (Vite's `import.meta.env.DEV`). It is stripped from production builds.

**Collapsed state:** Small pill showing current server time. Gray = system time, amber = test clock active.

**Expanded state (click the pill):**
- Current server date/time in monospace
- Offset from real time (e.g., "+3d 2h from real time")
- **TEST** badge when test clock is active
- Quick advance buttons: +1h, +6h, +1d, +3d, +7d, +30d
- Reset to real time button

### API endpoints

All endpoints are unauthenticated and only available when `NODE_ENV !== "production"`.

```bash
# Check current clock state
curl http://localhost:3000/dev/clock
# → { "time": 1710612345000, "iso": "2026-03-16T...", "mode": "system", "systemTime": 1710612345000 }

# Advance by 1 day (86400000 ms)
curl -X POST http://localhost:3000/dev/clock/advance \
  -H 'Content-Type: application/json' \
  -d '{"ms": 86400000}'

# Set to a specific timestamp
curl -X POST http://localhost:3000/dev/clock/set \
  -H 'Content-Type: application/json' \
  -d '{"time": 1711843200000}'

# Reset to real system time
curl -X POST http://localhost:3000/dev/clock/reset
```

### What the clock affects

When the dev clock is advanced, ALL time-dependent operations use the test time:

| Operation | Effect |
|-----------|--------|
| Event status computation | Upcoming → Deliberation → Voting → Closed |
| Vote acceptance | Rejected before votingStart, rejected after votingEnd |
| Tally visibility | Sealed results hidden until voting ends |
| Weight distribution | Forbidden under sealed ballot until voting ends |
| Materialization | Triggers on first tally query after voting ends |
| Poll responses | Rejected outside schedule/closesAt window |
| Delegation maxAge | Filters delegations older than config limit |

### Safety

Three independent layers prevent the dev clock from reaching production:

1. **Routes not mounted** when `NODE_ENV=production` (server.ts)
2. **Middleware guard** blocks requests even if routes are somehow mounted
3. **UI widget stripped** from production builds by Vite

### Common dev clock scenarios

**Test vote rejection after deadline:**
1. Login, go to an open voting event
2. Cast a vote (should succeed)
3. Dev clock → advance past `votingEnd` (e.g., +7d)
4. Try to cast another vote → should fail with "Voting has closed"
5. Check tally → results now visible

**Test event lifecycle transitions:**
1. Seed fresh data
2. Go to an event in deliberation phase
3. Dev clock → advance past `votingStart`
4. Refresh → event now shows "Voting Open"
5. Cast votes
6. Dev clock → advance past `votingEnd`
7. Refresh → event shows "Ended" with results

**Test what the dashboard looks like with no pending votes:**
1. Dev clock → +30d (all events will have ended)
2. Refresh dashboard → "You're all caught up!"

**Remember:** Click "Reset to real time" when done, or reseed for a clean state.

---

## 5. Unit Tests

### Engine packages

Each engine package has unit tests in `packages/<name>/tests/`. Run individually or all at once:

```bash
# All engine tests
pnpm --filter '@votiverse/*' test

# Specific package
cd packages/core && pnpm test        # 71 tests (includes TestClock)
cd packages/config && pnpm test      # 50 tests
cd packages/delegation && pnpm test  # 33 tests
cd packages/voting && pnpm test      # 28 tests
cd packages/engine && pnpm test      # 17 tests (includes timeline enforcement)
# ... etc
```

### Writing engine tests

Engine tests use `TestClock` for time-dependent scenarios:

```typescript
import { TestClock, timestamp } from "@votiverse/core";

const DAY = 86_400_000;
const clock = new TestClock();

// Create engine with test clock
const engine = createEngine({
  config: getPreset("LIQUID_STANDARD"),
  eventStore: new InMemoryEventStore(),
  timeProvider: clock,
});

// Create event with voting window
const event = await engine.events.create({
  // ...
  timeline: {
    deliberationStart: timestamp(clock.now() - 7 * DAY),
    votingStart: timestamp(clock.now() - 1 * DAY),
    votingEnd: timestamp(clock.now() + 6 * DAY),
  },
});

// Vote succeeds (within window)
await engine.voting.cast(alice, issueId, "for");

// Advance past voting end
clock.advance(7 * DAY);

// Vote now fails
await expect(engine.voting.cast(bob, issueId, "for"))
  .rejects.toThrow("Voting has closed");
```

### Key test properties

The engine tests verify these formal guarantees:

1. **Sovereignty** — direct vote always has weight 1, overrides delegation
2. **One-person-one-vote** — total weight equals participating voters
3. **Monotonicity** — direct voting never reduces influence
4. **Revocability** — revoking delegation restores original state
5. **Cycle resolution** — cycle members without direct votes have weight 0
6. **Timeline enforcement** — votes rejected outside voting window

---

## 6. VCP Integration Tests

55 tests in `platform/vcp/test/`. Each test creates an in-process VCP with in-memory SQLite and a `TestClock`:

```typescript
import { createTestVCP, type TestVCP } from "./helpers.js";

let vcp: TestVCP;
beforeEach(async () => {
  vcp = await createTestVCP();
});

// Cast vote as a participant
const res = await vcp.requestAs(participantId, "POST", `/assemblies/${id}/votes`, {
  issueId, choice: "for",
});

// Advance clock past voting end for tally queries
vcp.clock.advance(7200000);
```

### Test files

| File | Tests | Focus |
|------|-------|-------|
| `lifecycle.test.ts` | 9 | Full CRUD: assemblies, participants, events, votes, tallies |
| `ballot-secrecy.test.ts` | 8 | Secret vs public ballot, sealed results, choice visibility |
| `participation.test.ts` | 16 | Participation records, delegation chains, secrecy filtering |
| `sovereignty.test.ts` | 7 | Vote casting with sovereignty enforcement |
| `multi-tenancy.test.ts` | 7 | Assembly isolation, cross-assembly data separation |
| `error-handling.test.ts` | 8 | Error responses, validation, not-found handling |

---

## 7. Backend Integration Tests

13 tests in `platform/backend/test/auth.test.ts`:

| Test | What it verifies |
|------|-----------------|
| Register new user | Returns 201 with user + tokens |
| Reject duplicate email | Returns 409 |
| Email normalization | Lowercases email |
| Reject short password | Returns 400 |
| Reject missing name | Returns 400 |
| Login with correct credentials | Returns 200 with tokens |
| Reject wrong password | Returns 401 |
| Reject unknown email | Returns 401 |
| Token refresh + rotation | New tokens, old token invalidated |
| Reject reused refresh token | Returns 401 after rotation |
| Logout revokes token | Refresh after logout fails |
| Unauthenticated request rejected | Returns 401 |
| Valid access token accepted | Returns 200 on /me |

---

## 8. Manual Testing Scenarios

### Scenario 1: Full voting lifecycle

1. Reseed: `pnpm reset` in VCP and backend
2. Login as Sofia Reyes
3. Go to My Groups → OSC Governance Board → Votes
4. Click "Dependency Policy Review" (Voting Open)
5. Scroll to an issue marked "Needs your vote"
6. Click "For" to cast a vote — verify it's recorded
7. Open Dev Clock → click "+7d"
8. Refresh page — event should now show "Ended"
9. Verify results are visible with bar chart
10. Reset dev clock

### Scenario 2: Delegation from event page

1. Login as Sofia Reyes → OSC → Dependency Policy Review
2. Find an issue showing "No delegate for this topic"
3. Click "Delegate"
4. Select a member from the dropdown
5. Choose scope (topic, broader, or all)
6. Click "Delegate" — verify it saves without error
7. Go to Delegates tab — verify the delegation appears
8. Go back to the event — verify issue shows "Delegated to [name]"

### Scenario 3: Delegation override

1. Login as Chiara Rossi → OSC
2. Go to an event — some issues show "Delegated to Mei-Ling Wu"
3. On a delegated issue, click "For" to vote directly
4. Verify the issue now shows "You voted For" (override)
5. Verify Mei-Ling's weight decreased by 1 in the breakdown

### Scenario 4: Cross-assembly dashboard

1. Login as Sofia Reyes (OSC + Youth)
2. Dashboard shows pending votes from BOTH assemblies
3. "X votes need you" count is correct
4. Click "Vote Now" → navigate to nearest deadline event
5. Switch to the other assembly → verify different delegation context

### Scenario 5: Auth lifecycle

1. Click "Sign up" → register a new account
2. Verify you land on the dashboard (empty, no assemblies)
3. Log out → verify login form appears
4. Log back in with the new account
5. Open Dev Tools → Application → Local Storage → verify tokens stored

### Scenario 6: Time-based vote rejection

1. Login as any user
2. Open Dev Clock → "+30d" (advance 30 days)
3. Go to any event that was "Voting Open" — should now show "Ended"
4. Verify no vote buttons are visible
5. Verify results/tally are shown
6. Reset dev clock → event returns to "Voting Open"

### Scenario 7: Poll response

1. Login as Ravi Gupta → Youth Advisory Panel
2. Go to Polls → find "Preferred Community Event Type" (open, hasn't responded)
3. Submit a response
4. Verify results bar chart appears
5. Scroll to "Study Space Survey" → verify closed poll shows results

---

## 9. Seeded Data Reference

### Voting Events (15 total)

Events are created with timelines relative to seed time. Status at seed time:

| Assembly | Event | Issues | Status at seed time |
|----------|-------|--------|-------------------|
| Greenfield | Spring Community Improvement Vote | 3 | Closed |
| Greenfield | Q1 Infrastructure Decisions | 4 | Voting |
| Greenfield | Annual Budget Review 2026 | 2 | Upcoming |
| OSC | 2025 Roadmap Retrospective | 3 | Closed |
| OSC | Dependency Policy Review | 5 | Voting |
| OSC | Community Governance Evolution | 2 | Voting |
| OSC | H2 2026 Roadmap Proposals | 4 | Deliberation |
| OSC | 2026 Maintainer Elections | 3 | Voting |
| Municipal | Participatory Budget Cycle 2025 | 4 | Closed |
| Municipal | Emergency Infrastructure Measures | 3 | Voting |
| Youth | Youth Program Priorities 2026 | 3 | Voting |
| Youth | Digital Citizenship Curriculum | 2 | Deliberation |
| Board | Q4 2025 Board Resolutions | 3 | Closed |
| Board | Q1 2026 Strategic Decisions | 2 | Voting |
| Board | 2026 Board Officer Election | 3 | Closed |

### Timeline decay

Event timelines are anchored to `Date.now()` at seed time:
- **Closed events**: voting ended 1-20 days before seeding
- **Open events**: voting started 1-3 days before seeding, ends 3-10 days after
- **Deliberation events**: voting starts 4-5 days after seeding
- **Upcoming events**: deliberation starts 3-10 days after seeding

**After ~7 days** without reseeding, most "open" events will have closed naturally. Reseed for fresh timelines, or use the dev clock to rewind.

### Delegation graphs

See `platform/web/TESTING.md` for complete delegation graphs with chain diagrams for each assembly.

### Polls

6 polls across Youth Advisory Panel and Municipal Budget Committee. See `platform/web/TESTING.md` for details on questions, response counts, and creators.

---

## 10. Gotchas and Common Pitfalls

### Reseed order matters: VCP first, then backend

The backend seed reads participant data from the running VCP. If you reseed the VCP (which generates new UUIDs), the backend's membership records point to old assembly/participant IDs. **Always reseed the backend after reseeding the VCP:**

```bash
# Correct order:
cd platform/vcp && pnpm reset && pnpm dev      # 1. VCP with fresh UUIDs
cd platform/backend && pnpm reset && pnpm dev   # 2. Backend reads from VCP
```

**Symptom of stale backend:** Dashboard shows "No groups found" even though My Groups lists assemblies. The attention hook filters assemblies by membership IDs, which don't match if the backend was seeded against a different VCP.

### Kill servers before reseeding

`pnpm reset` starts a temporary server, seeds, and stops it. If a server is already running on that port, the reset will fail or seed the wrong instance. Always kill existing servers first:

```bash
lsof -ti :3000 -ti :4000 | xargs kill 2>/dev/null
```

### Stale engine dist/ after code changes

If VCP returns `"X is not a function"` errors (e.g., `hasResponded is not a function`), the engine packages' compiled `dist/` is stale. Rebuild:

```bash
pnpm --filter @votiverse/core build && \
pnpm --filter @votiverse/config build && \
pnpm --filter @votiverse/polling build && \
pnpm --filter @votiverse/engine build
```

Then **restart the VCP** — a running process holds old modules in memory.

### Token expiry

**Dev mode defaults:** Access tokens last 7 days, refresh tokens last 365 days. You should rarely need to re-login during development.

**Production defaults:** Access tokens last 15 minutes (auto-refreshed silently by the client), refresh tokens last 90 days. Users re-login roughly every 3 months.

Override via environment:
```bash
BACKEND_JWT_ACCESS_EXPIRY=1h    # shorter access token
BACKEND_JWT_REFRESH_EXPIRY=30d  # shorter refresh token
```

### Browser autofill interferes with login

Chrome may autofill the password field with a saved (wrong) password. If login fails, clear the field manually and type `password`.

### Dev clock left advanced

If pages show unexpected "Ended" status or votes are rejected, the dev clock may be advanced from a previous test session. Check the clock widget in the bottom-right — if it shows a **TEST** badge or an offset, click "Reset to real time".

---

## 11. Troubleshooting

### "Voting has not started" or "Voting has closed" errors

The engine enforces timeline windows. If you're getting unexpected rejections:
- Check the event's timeline dates (visible in the UI timeline component)
- Check the dev clock — is it offset from real time?
- Reseed if events have naturally expired

### Backend returns 401 on login

- Verify the backend is running (`curl http://localhost:4000/health`)
- Verify the backend was seeded AFTER the VCP (`pnpm reset` in backend directory while VCP is running)
- Verify you're using the correct password (`password` for all seeded users)
- Check email format: `{first-last}@example.com` with hyphens, lowercase

### "No groups found" on dashboard but groups exist in My Groups

The backend was seeded against a different VCP instance (assembly UUIDs don't match). Fix: reseed the backend from the current VCP data:

```bash
lsof -ti :4000 | xargs kill   # kill backend
cd platform/backend && pnpm reset && pnpm dev   # reseed from running VCP
```

### VCP returns 500 on vote or poll

- Check VCP logs for the specific error
- If "VOTING_CLOSED" or "VOTING_NOT_OPEN", see timeline troubleshooting above
- If "is not a function", rebuild engine packages (see "Stale engine dist/" above)

### Dev clock not appearing

- Only shows in Vite dev mode (`pnpm dev`, not production builds)
- Requires VCP running on `localhost:3000` (the widget talks directly to VCP)
- Check browser console for fetch errors to `/dev/clock`

### Stale data after reseeding

- Kill all servers, reseed VCP, then reseed backend, then restart all
- Clear browser localStorage (`localStorage.clear()` in console) to reset auth tokens

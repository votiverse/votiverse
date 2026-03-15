# Phase 3 — Topics System + Delegation UX Improvements

## Task Summary

The Votiverse engine already supports topic-scoped delegation (`topicScope: TopicId[]` on delegations, `topicIds: TopicId[]` on issues), and the `Topic` type exists in `@votiverse/core`. But **no topics actually exist** in the system — no database table, no API endpoints, no seed data. All 19 seeded delegations use `topicScope: []` (global), and all issues use `topicIds: []`.

Your job is to:
1. Add a `topics` table and persistence layer in VCP
2. Add CRUD API routes for topics
3. Create seed data with realistic hierarchical topic taxonomies per assembly
4. Link existing seeded issues to their appropriate topics
5. Add some topic-scoped delegations alongside the existing global ones
6. Add web UI: Topic type, API client, topic picker component, delegation form integration

After your changes, `pnpm reset && pnpm dev` must work cleanly.

---

## Part A — VCP Backend (Database + API + Seed Data)

### A1. Add `topics` table to SQLite schema

**File:** `platform/vcp/src/adapters/database/sqlite.ts`

Add to the `initialize()` method, after the `issues` table:

```sql
CREATE TABLE IF NOT EXISTS topics (
  id            TEXT NOT NULL,
  assembly_id   TEXT NOT NULL,
  name          TEXT NOT NULL,
  parent_id     TEXT,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (assembly_id, id)
);
```

The `sort_order` column controls display ordering within siblings. `parent_id` is null for root topics.

### A2. Add topic persistence to AssemblyManager

**File:** `platform/vcp/src/engine/assembly-manager.ts`

Add a `TopicRow` interface and these methods:

```typescript
interface TopicRow {
  id: string;
  assembly_id: string;
  name: string;
  parent_id: string | null;
  sort_order: number;
}

// In AssemblyManager class:

/** Create a topic in an assembly's taxonomy. */
createTopic(assemblyId: string, topic: { id: string; name: string; parentId: string | null; sortOrder?: number }): void {
  this.db.run(
    `INSERT INTO topics (id, assembly_id, name, parent_id, sort_order) VALUES (?, ?, ?, ?, ?)`,
    [topic.id, assemblyId, topic.name, topic.parentId, topic.sortOrder ?? 0],
  );
}

/** List all topics for an assembly, ordered for tree rendering. */
listTopics(assemblyId: string): Array<{ id: string; name: string; parentId: string | null; sortOrder: number }> {
  return this.db.query<TopicRow>(
    "SELECT * FROM topics WHERE assembly_id = ? ORDER BY sort_order ASC, name ASC",
    [assemblyId],
  ).map((r) => ({
    id: r.id,
    name: r.name,
    parentId: r.parent_id,
    sortOrder: r.sort_order,
  }));
}
```

### A3. Add topics API routes

**Create file:** `platform/vcp/src/api/routes/topics.ts`

Follow the exact pattern of `delegations.ts`. Two routes:

```
GET  /assemblies/:id/topics     → returns { topics: Topic[] }
POST /assemblies/:id/topics     → creates topic, returns the topic
```

The POST body: `{ name: string; parentId?: string | null }`. Generate UUID for the topic ID server-side.

**Wire it into the server:** In `platform/vcp/src/api/server.ts`, import and register `topicRoutes(manager)` the same way other route modules are registered.

### A4. Create topic seed data

**Create file:** `platform/vcp/scripts/seed-data/topics.ts`

Define a `TopicDef` interface and `TOPICS` constant. Each topic needs: `assemblyKey`, `key` (for referencing in issue assignments), `name`, `parentKey` (null for roots). Use a flat array with parent references, same pattern as delegations.

**Proposed taxonomies (all 4 assemblies with delegation — skip Greenfield since it has no delegation):**

**OSC Governance Board:**
```
Technical
├── Dependencies
├── Security
└── Infrastructure
Community
├── Governance
└── Contributors
Roadmap
```

**Municipal Budget Committee:**
```
Infrastructure
├── Transit
├── Buildings
└── Roads
Social Services
├── Health
└── Housing
Environment
├── Energy
└── Parks
```

**Youth Advisory Panel:**
```
Education
├── STEM Programs
└── Digital Literacy
Health & Wellness
├── Mental Health
└── Sports & Recreation
Community
├── Events
└── Environment
```

**Board of Directors:**
```
Strategic
├── Market Expansion
└── Partnerships
Finance
├── Dividends
└── Compensation
Governance
├── Board Officers
└── Committees
```

### A5. Link issues to topics

**File:** `platform/vcp/scripts/seed-data/events.ts`

Add `topicKeys?: string[]` to `IssueDef`. Then map each existing issue to appropriate topics. Examples:

- OSC "Dependencies Audit" issues → `["dependencies"]` topic
- OSC "2026 Maintainer Elections" issues → `["governance"]` or `["contributors"]` topics
- Municipal "Participatory Budget" transit issues → `["transit"]` topic
- Youth "Program Priorities" → various youth topics

**File:** `platform/vcp/scripts/seed.ts`

Update the event creation step to resolve topic keys to topic IDs and pass them as `topicIds` instead of empty arrays. This means topics must be seeded BEFORE events (add a new step between participants and events).

The seeding flow must be:
1. Create assemblies
2. Add participants
3. **Create topics** ← NEW STEP
4. Create voting events (now with topicIds resolved from topic keys)
5. Create delegations (some with topicScope referencing topic IDs)
6. Cast votes
7. Create polls (with topicScope referencing topic IDs)

You'll need a `topicIds` Map in helpers.ts similar to `assemblyIds` and `participantIds`:

**File:** `platform/vcp/scripts/seed-data/helpers.ts`

Add:
```typescript
export const topicIds = new Map<string, string>();
export function tKey(assemblyKey: string, topicKey: string): string {
  return `${assemblyKey}::${topicKey}`;
}
export function tid(assemblyKey: string, topicKey: string): string {
  const id = topicIds.get(tKey(assemblyKey, topicKey));
  if (!id) throw new Error(`Topic "${topicKey}" not found for assembly "${assemblyKey}"`);
  return id;
}
```

### A6. Add topic-scoped delegations to seed data

**File:** `platform/vcp/scripts/seed-data/delegations.ts`

Keep ALL existing global delegations unchanged (don't break existing tests). ADD new topic-scoped delegations alongside them. Good examples:

- OSC: Zara Ibrahim delegates to Anika Patel globally (already exists), but add Kai Andersen delegating to Leo Fernandez on `["technical"]` scope only
- Municipal: Add a delegation from Nkechi Adeyemi to Carmen Delgado scoped to `["infrastructure"]`
- Youth: Add a delegation from Aisha Moyo to Sofia Reyes scoped to `["education"]`

Add a `topicKeys` field to `DelegationDef` alongside `topicScope` — `topicKeys` uses the human-readable keys, `topicScope` is resolved at seed time. Or change the seed to resolve topic keys to IDs, whichever is cleaner.

### A7. Update poll topicScope

**File:** `platform/vcp/scripts/seed-data/polls.ts`

Link existing polls to relevant topics:
- "Transit Priority Sentiment" → `["transit"]`
- "Transit Improvement Priority" → `["transit"]`
- "Neighborhood Priorities" → `["infrastructure"]` (parent)
- Youth polls → appropriate youth topics

---

## Part B — Web Frontend (Types + Client + Components)

### B1. Add Topic type and API client

**File:** `platform/web/src/api/types.ts`

Add:
```typescript
export interface Topic {
  id: string;
  name: string;
  parentId: string | null;
  sortOrder: number;
}
```

**File:** `platform/web/src/api/client.ts`

Add:
```typescript
// ---- Topics ----

export function listTopics(assemblyId: string): Promise<{ topics: Topic[] }> {
  return request("GET", `/assemblies/${assemblyId}/topics`);
}
```

### B2. Create TopicPicker component

**Create file:** `platform/web/src/components/topic-picker.tsx`

A multi-select component that shows topics in a hierarchical tree structure. Design:

- Fetch topics from the API using `listTopics(assemblyId)`
- Display as an indented list with checkboxes
- Root topics are bold, children are indented under their parent
- Selecting a parent does NOT auto-select children (topics are independent scopes)
- Returns selected topic IDs via an `onChange` callback
- Props: `assemblyId: string`, `value: string[]`, `onChange: (topicIds: string[]) => void`, `disabled?: boolean`
- Use existing UI components (Card, Label, etc.) from `../components/ui.js`
- Show a loading state while topics are being fetched
- If no topics exist for the assembly, show a message

Use the `useApi` hook from `../hooks/use-api.js` for data fetching (same pattern used throughout the app).

Tree building logic: sort by `sortOrder`, group by `parentId`, render roots first then children nested under each parent.

Style with Tailwind classes consistent with the rest of the app (gray-50 backgrounds, rounded-md, text-sm, etc.).

### B3. Integrate TopicPicker into delegation form

**File:** `platform/web/src/pages/delegations.tsx`

In `CreateDelegationForm`:

1. Import `useAssembly` from `../hooks/use-assembly.js` and the new `TopicPicker`
2. Add state: `const [topicScope, setTopicScope] = useState<string[]>([]);`
3. Add a "Scope" section between the participant selectors and the submit button:
   - If `config.delegation.topicScoped === true`, show a radio group:
     - "All topics (global delegation)" ← default
     - "Specific topics" → reveals the TopicPicker when selected
   - If `config.delegation.topicScoped === false`, don't show any scope UI (all delegations are global)
4. Replace the hardcoded `topicScope: []` in the submit handler with the actual `topicScope` state
5. Remove the "Topic-scoped delegation coming soon" text (line 149)

### B4. Show topic names in delegation list

**File:** `platform/web/src/pages/delegations.tsx`

In the active delegations list, the current code shows `(N topics)` for topic-scoped delegations. Update it to show actual topic names:

1. Fetch topics via `useApi(() => api.listTopics(assemblyId!), [assemblyId])`
2. Build a `topicNameMap: Map<string, string>` from the response
3. Replace the `(${d.topicScope.length} topic${...})` span with actual topic names joined by commas, e.g., "(Transit, Buildings)" — or "(global)" when `topicScope` is empty

### B5. Show topic context on issues in event-detail

**File:** `platform/web/src/pages/event-detail.tsx`

Add small topic badges/chips on each issue card showing which topics the issue belongs to:

1. Fetch topics: `const { data: topicsData } = useApi(() => api.listTopics(assemblyId!), [assemblyId]);`
2. Build `topicNameMap` from the response
3. In the issue card rendering, after the issue title/description, show topic chips:
   ```tsx
   {issue.topicIds.length > 0 && (
     <div className="flex flex-wrap gap-1 mt-1">
       {issue.topicIds.map((tid) => (
         <span key={tid} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
           {topicNameMap.get(tid) ?? tid.slice(0, 8)}
         </span>
       ))}
     </div>
   )}
   ```

---

## Important Notes

1. **Don't break existing functionality.** All 19 existing global delegations must continue to work. The topic system adds to what's there; it doesn't replace anything.

2. **`pnpm reset && pnpm dev` must work.** The reset script drops the DB and re-runs the seed. Make sure the topic creation step comes before events/delegations/polls in the seed flow.

3. **The engine already handles topic-scoped delegation.** You don't need to modify any `packages/*` code. The engine's `delegation.create()` already accepts `topicScope: TopicId[]`. The engine's `delegation.resolve()` already considers topic scope when finding the matching delegation. You're just providing the data and UI that was missing.

4. **Topic IDs are branded types** (`TopicId = string & { readonly __brand: "TopicId" }`). Cast strings to `TopicId` at the API boundary using `as TopicId`, same pattern used for `ParticipantId` etc.

5. **Sort order matters.** When creating topics in the seed, give root topics sort_order 0, 10, 20 and children 0, 10, 20 within each parent. This gives room to insert topics between existing ones later.

6. **The web app uses Vite** with a proxy to VCP at `localhost:3000`. API calls go through `/api` which is proxied. You don't need to configure CORS or change the proxy.

7. **Commit and push frequently** following the project's commit conventions (`feat(vcp):`, `feat(web):`, etc.). Push after each logical step.

8. **Update `platform/web/TESTING.md`** to document the new topic-scoped delegations you add. Add a "Topics" section showing which topics exist per assembly.

---

## Verification

After implementing, verify with `pnpm reset && pnpm dev`:

1. `GET /api/assemblies/{osc-id}/topics` returns the OSC topic tree
2. `GET /api/assemblies/{greenfield-id}/topics` returns empty array (no topics for Greenfield)
3. Issues in voting events now have `topicIds` populated
4. Some delegations now have non-empty `topicScope`
5. The web delegation form shows topic picker when `topicScoped === true`
6. Topic names display in delegation list instead of raw IDs
7. Issue cards show topic chips

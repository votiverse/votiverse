# Task: Add Multi-Option Ballot Support

## Context

Votiverse is a governance engine with 12 TypeScript packages, a Hono REST server (VCP), and a React web client. The engine already supports 4 ballot methods (SimpleMajority, Supermajority, RankedChoice, ApprovalVoting) and the `VoteChoice` type is `string | readonly string[]` — fully generic. However, there is no way for an issue to declare what choices are available (e.g. candidate names for an election), so the web client hardcodes For/Against/Abstain buttons.

**Read these files before doing anything:**
- `CLAUDE.md` — project instructions (always read first)
- `docs/architecture.md` — engine architecture and module specs
- `packages/core/src/types.ts` — `Issue` interface (missing `choices` field), `VoteChoice` type
- `packages/core/src/events.ts` — `VotingEventCreatedPayload` (needs to carry issue choices)
- `packages/voting/src/ballot-methods.ts` — all 4 methods already work with any string choices
- `packages/voting/src/voting-service.ts` — `VotingService.cast()` and `tally()`
- `packages/config/src/types.ts` — `GovernanceConfig`, `VotingMethod` type
- `packages/config/src/presets.ts` — 6 named presets (all use simple-majority currently)
- `platform/vcp/src/api/routes/voting.ts` — vote casting and tally endpoints
- `platform/vcp/src/api/routes/events.ts` — event creation and listing endpoints
- `platform/web/src/pages/event-detail.tsx` — hardcoded For/Against/Abstain buttons, tally display

## The Problem

1. The `Issue` type has no `choices` field. There's nowhere to say "this issue offers options: Alice, Bob, Carol."
2. The `VotingEventCreatedPayload` doesn't carry per-issue choices either.
3. Without declared choices, the web client can only hardcode For/Against/Abstain.
4. The config presets all use simple-majority, but ranked-choice and approval are fully implemented in the engine.

## What To Do

### Phase A: Engine (packages/)

1. **Add `choices` to `Issue`** in `packages/core/src/types.ts`:
   ```typescript
   export interface Issue {
     readonly id: IssueId;
     readonly title: string;
     readonly description: string;
     readonly topicIds: readonly TopicId[];
     readonly votingEventId: VotingEventId;
     readonly choices?: readonly string[];  // undefined = binary (for/against/abstain)
   }
   ```

2. **Add per-issue choices to the event payload** in `packages/core/src/events.ts`. The `VotingEventCreatedPayload` currently has `issueIds: readonly IssueId[]`. It should also carry the issue metadata (titles, descriptions, choices) since events are the source of truth. Consider an `issues` array alongside or replacing `issueIds`:
   ```typescript
   export interface VotingEventCreatedPayload {
     readonly votingEventId: VotingEventId;
     readonly title: string;
     readonly description: string;
     readonly issues: readonly {
       readonly id: IssueId;
       readonly title: string;
       readonly description: string;
       readonly topicIds: readonly TopicId[];
       readonly choices?: readonly string[];
     }[];
     readonly eligibleParticipantIds: readonly ParticipantId[];
     readonly timeline: EventTimeline;
   }
   ```
   Keep `issueIds` as a derived convenience if needed, or remove it in favor of `issues.map(i => i.id)`. Be careful about backward compatibility with existing events in the event store — the SQLite DB has events with the old shape.

3. **Validate choices in `VotingService.cast()`** in `packages/voting/src/voting-service.ts`. If an issue has declared choices, the cast vote's choice must be one of them (for single-select methods) or a subset/permutation of them (for ranked/approval). If the issue has no declared choices, accept any string (backward compatible).

4. **Update event creation** in `packages/engine/src/` (the orchestration layer) to pass choices through when creating voting events and issues.

5. **Write tests**:
   - Unit test: issue with custom choices, cast a valid choice, cast an invalid choice (should fail)
   - Unit test: ranked-choice with custom choices, verify only declared choices are accepted
   - Integration test: create event with multi-option issue, cast votes, verify tally

### Phase B: VCP Server (platform/vcp/)

6. **Update event creation endpoint** (`POST /assemblies/:id/events`) to accept `choices` per issue in the request body and pass it through to the engine.

7. **Update event response** (`GET /assemblies/:id/events/:eid`) to return `choices` for each issue in the response.

8. **Update the seed script** (`platform/vcp/scripts/seed-data/`) to include at least one assembly with a multi-option event. Good candidate: change the Board of Directors assembly to use ranked-choice or approval voting for its "board election" scenario. Add an event like "Board Officer Election" with issues like "Elect Chairperson" with choices ["Victoria Harrington", "Robert Blackwell", "Catherine Zhao"].

### Phase C: DO NOT DO — Web Client Changes

**Do not modify any files in `platform/web/`.** The web client requires visual verification in a browser, which you cannot do. Leave the UI hardcoded as-is. The web client work will be done separately by a developer with browser access. Just make sure the API contract is clean and documented so the UI work is straightforward.

## Design Constraints

- **Event sourcing**: All state changes must be events. The choices are part of the `VotingEventCreated` event, not mutable state.
- **Backward compatibility**: Existing events in the store don't have choices. The new field must be optional (`choices?: ...`). When replaying old events, missing choices means "binary for/against/abstain".
- **Configuration is data**: The ballot method comes from `GovernanceConfig.ballot.votingMethod`. The issue's choices come from the issue definition. The engine combines them: the method determines HOW to tally, the choices determine WHAT options exist.
- **No circular dependencies**: Follow the dependency graph in `CLAUDE.md`.
- **Abstain is always available**: Even for multi-option ballots, "abstain" should always be a valid choice. It doesn't need to be in the `choices` array — it's implicit. (This is a design decision — document it with a `// DECISION:` comment if you disagree.)

## Commit Strategy

Follow `CLAUDE.md` commit conventions. Commit after each numbered step. Push after every commit. Suggested commits:
1. `feat(core): add choices field to Issue type and VotingEventCreated payload`
2. `feat(voting): validate vote choices against issue-declared options`
3. `test(voting): add multi-option ballot tests`
4. `feat(engine): wire issue choices through event creation`
5. `feat(vcp): accept and return issue choices in event endpoints`
6. `feat(vcp): add multi-option voting event to seed data`
7. `test(engine): integration test for multi-option election workflow`

## What Success Looks Like

After this work:
- `pnpm test` passes in all packages
- `pnpm reset` seeds at least one multi-option election
- `GET /assemblies/:id/events/:eid` returns `choices` per issue
- `POST /assemblies/:id/votes` with a choice not in the declared list returns an error
- The engine can run a full ranked-choice or approval election end-to-end through the API
- Existing binary for/against events continue to work unchanged

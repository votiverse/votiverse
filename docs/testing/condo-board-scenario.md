# Condo Board Role-Play Test Scenario

**Purpose:** End-to-end UX testing from the perspective of real users creating and operating a democratic governance group.

---

## Setting: Maple Heights Condominiums

A 24-unit condominium complex. The board consists of elected owners who make decisions about building maintenance, renovations, and finances. ~15 active owners participate in governance.

## Cast

| Character | Role | Email | Personality |
|-----------|------|-------|-------------|
| **Elena Vasquez** | Board President | elena-vasquez@example.com | Organized, decisive. Creates the assembly, invites others. |
| **Marcus Chen** | Treasurer | marcus-chen@example.com | Detail-oriented, fiscally conservative. Writes proposals with cost breakdowns. |
| **Priya Sharma** | Secretary | priya-sharma@example.com | Collaborative, good at summarizing. Writes community notes. |
| **James Okafor** | Owner (Unit 12) | james-okafor@example.com | Engaged but busy. Delegates to Marcus on financial matters. |
| **Sofia Reyes** | Owner (Unit 8) | sofia-reyes@example.com | New to the building. Gets invited, goes through onboarding. |
| **Kai Andersen** | Owner (Unit 3) | kai-andersen@example.com | Skeptical, writes dissenting community notes. |

All passwords: `password`

---

## Act 1: Assembly Creation

**Scene 1.1 — Elena creates the condo board**
- Elena logs in
- Goes to "My Groups" → creates new assembly
- Name: "Maple Heights Condo Board"
- Preset: Modern Democracy (default)
- Admission mode: approval (default — she wants to verify who joins)

**Scene 1.2 — Elena invites the board**
- Goes to Members page
- Sends direct invitations to Marcus, Priya, James by handle
- Generates an invite link for the broader owner community
- Copies the link

## Act 2: Members Join

**Scene 2.1 — Marcus accepts direct invitation**
- Marcus logs in
- Dashboard shows pending invitation from Elena
- Accepts → sees onboarding dialog
- Steps through: Welcome → Voting → Delegation → Getting Started

**Scene 2.2 — Sofia uses invite link (approval mode)**
- Sofia opens the invite link (logged in)
- Sees group preview: governance rules, Elena as owner
- Clicks "Request to join"
- Sees "Request submitted" confirmation

**Scene 2.3 — Elena approves Sofia**
- Elena goes to Members page
- Sees pending join request from Sofia
- Approves → Sofia is now a member
- Sofia gets a notification: "You've been approved to join Maple Heights Condo Board"

## Act 3: First Voting Event — Emergency Roof Repair

**Scene 3.1 — Elena creates a voting event**
- Topic: Emergency roof repair after storm damage
- Two issues:
  1. "Authorize $45,000 emergency roof repair" (Yes/No)
  2. "Fund from reserve fund vs. special assessment" (Multiple choice)
- Timeline: 2 days deliberation, 0 curation, 3 days voting

**Scene 3.2 — Marcus writes a proposal**
- Marcus opens the deliberation event
- Writes a proposal for Issue 1 with TipTap editor:
  - Title: "Immediate Roof Repair — Cost Analysis"
  - Body: breakdown of 3 contractor quotes, recommendation
- Submits the proposal

**Scene 3.3 — Kai writes a dissenting community note**
- Kai reads Marcus's proposal
- Writes a community note questioning the cost estimate
- "The $45,000 figure doesn't include potential structural damage beneath the membrane. A full assessment should be required first."

**Scene 3.4 — James delegates to Marcus**
- James is busy and trusts Marcus on financial matters
- Sets up delegation: James → Marcus (global or topic-scoped)

**Scene 3.5 — Advance time → Voting opens**
- Use dev clock to advance past deliberation
- Members receive "Voting is open" notifications
- Everyone votes (some directly, James via delegation)

**Scene 3.6 — Advance time → Results**
- Use dev clock to advance past voting window
- Results are published
- Members receive "Results are in" notifications

## Act 4: Renovation Proposal — The Controversial One

**Scene 4.1 — Create a new voting event**
- Topic: Optional lobby renovation
- Issues:
  1. "Approve $120,000 lobby renovation" (Yes/No, supermajority)
  2. "Renovation scope" (Multiple choice: minimal refresh / full redesign / defer to next year)

**Scene 4.2 — Competing proposals**
- Marcus writes a "full redesign" proposal with architect renderings
- Kai writes a "defer" counter-proposal arguing the reserve fund is too low
- Priya adds a community note with a neutral summary of both positions

**Scene 4.3 — Active deliberation**
- Members read proposals, add community notes
- Some evaluate notes as helpful/not helpful
- Notes become visible based on evaluation threshold

## Act 5: Notifications in Action

- Verify all participants received appropriate notifications throughout
- Check the notification bell shows the full history
- Verify admin notifications (Elena) for join requests and new members
- Check notification settings page works for changing preferences

---

## Infrastructure Needed

1. **Group creation flow** — verify POST /assemblies works end-to-end
2. **VCP event creation** — verify creating voting events through the proxy works
3. **Dev clock** — advance time through deliberation → voting → closed
4. **Proposal creation** — verify TipTap editor + backend content storage works
5. **Community notes** — verify note creation and evaluation
6. **Delegation** — verify delegation creation and weight computation

## Known Gaps to Watch For

- Group creation may not have a backend `POST /assemblies` route (proxy gap)
- Admission mode selection may not be in the group creation UI yet
- The onboarding dialog triggers on first visit to a group — need to clear localStorage to re-test
- Event creation through the web UI depends on admin role being recognized

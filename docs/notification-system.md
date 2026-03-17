# Notification System — Design Document

**Status:** Approved design, ready for implementation
**Scope:** Backend notification service with email/SMS delivery

---

## 1. Motivation

Votiverse asks participants to do two things: **decide** (vote on proposals, delegate judgment) and **sense** (respond to polls that capture ground-level observations). Both require timely awareness.

The whitepaper (Section 9) establishes that polls are the channel through which observations flow upward from participants to the system. Participants are "distributed sensors embedded in their local realities." If they don't know a survey exists, the sensing mechanism fails. Similarly, if a participant misses a voting deadline, their voice is lost — whether they vote directly or through delegation.

The notification system ensures participants know when their input is needed, through the channels they prefer, without overwhelming them.

---

## 2. Architecture

### Core Principle: The Backend Already Knows

The client backend (`platform/backend/`) is the service that creates governance events. When an admin creates a voting event or poll, the request flows through the backend's VCP proxy. At that moment, the backend has all the data it needs: event title, assembly, timeline (votingStart, votingEnd), poll schedule and closing time.

The backend captures this data, stores it in its own database, and uses it to drive notifications. **No webhooks. No polling. No VCP consultation.**

```
Admin creates event
  → Backend proxy sends to VCP → VCP confirms (201)
  → Backend stores timeline in tracked_events table
  → Scheduler picks it up → dispatches notifications at the right times
```

### What Gets Tracked

| Trigger | Source | Timing |
|---------|--------|--------|
| New vote created | Proxy intercept on `POST /events` response | Next scheduler tick (~1 min) |
| Voting window opens | Stored `votingStart` timestamp | When scheduler detects transition |
| Deadline approaching | Stored `votingEnd` - 24 hours | When scheduler detects threshold |
| Voting closed / results available | Stored `votingEnd` timestamp | When scheduler detects transition |
| New survey created | Proxy intercept on `POST /polls` response | Next scheduler tick |
| Survey closing soon | Stored `closesAt` - 24 hours | When scheduler detects threshold |

### What Does NOT Get Tracked

- Individual vote casts (private, high-frequency)
- Delegation changes (private)
- Poll responses (private)
- Tally updates (computed on demand)

---

## 3. Database Schema

Three new tables in the backend database:

```sql
-- Events tracked for notification scheduling.
-- Populated when the proxy intercepts POST /assemblies/:id/events responses.
CREATE TABLE tracked_events (
  id              TEXT PRIMARY KEY,           -- VCP event ID
  assembly_id     TEXT NOT NULL,
  title           TEXT NOT NULL,
  voting_start    TEXT NOT NULL,              -- ISO 8601
  voting_end      TEXT NOT NULL,              -- ISO 8601
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  notified_created     INTEGER NOT NULL DEFAULT 0,
  notified_voting_open INTEGER NOT NULL DEFAULT 0,
  notified_deadline    INTEGER NOT NULL DEFAULT 0,
  notified_closed      INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_tracked_events_assembly
  ON tracked_events(assembly_id);

-- Polls tracked for notification scheduling.
-- Populated when the proxy intercepts POST /assemblies/:id/polls responses.
CREATE TABLE tracked_polls (
  id              TEXT PRIMARY KEY,           -- VCP poll ID
  assembly_id     TEXT NOT NULL,
  title           TEXT NOT NULL,
  schedule        TEXT NOT NULL,              -- ISO 8601 (when poll opens)
  closes_at       TEXT NOT NULL,              -- ISO 8601
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  notified_created     INTEGER NOT NULL DEFAULT 0,
  notified_deadline    INTEGER NOT NULL DEFAULT 0,
  notified_closed      INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_tracked_polls_assembly
  ON tracked_polls(assembly_id);

-- User notification preferences.
-- Defaults are applied in application code when a key is absent.
CREATE TABLE notification_preferences (
  user_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key       TEXT NOT NULL,
  value     TEXT NOT NULL,
  PRIMARY KEY (user_id, key)
);
```

---

## 4. User Preferences

Minimal, opinionated defaults. Users can override via a settings API.

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `notify_new_votes` | `"always"` \| `"undelegated_only"` \| `"never"` | `"always"` | Notify when a new voting event is created in your assembly |
| `notify_new_surveys` | `"true"` \| `"false"` | `"true"` | Notify when a new poll is created. Default ON because surveys are the feedback loop — the whitepaper makes this critical |
| `notify_deadlines` | `"true"` \| `"false"` | `"true"` | 24-hour warning before voting or survey closes |
| `notify_results` | `"true"` \| `"false"` | `"false"` | When voting results become available |
| `notify_channel` | `"email"` \| `"sms"` \| `"both"` \| `"none"` | `"email"` | Delivery channel. `"none"` disables all out-of-band notifications |

### The "undelegated_only" option

When `notify_new_votes` is `"undelegated_only"`, the notification service checks whether the user has an active delegation that covers the new event's topics. If fully delegated, no notification. If any issue in the event falls outside existing delegations, the user is notified. This reduces noise for participants who've delegated specific areas while still alerting them to topics they haven't covered.

---

## 5. Notification Service

### Location

`platform/backend/src/services/notification-service.ts`

### Interface

```typescript
interface NotificationService {
  /** Called by the proxy interceptor when a new event/poll is created. */
  trackEvent(event: TrackedEvent): Promise<void>;
  trackPoll(poll: TrackedPoll): Promise<void>;

  /** Called by the scheduler on each tick. Checks all tracked items for pending notifications. */
  processScheduledNotifications(): Promise<void>;

  /** Preference management. */
  getPreferences(userId: string): Promise<NotificationPreferences>;
  setPreference(userId: string, key: string, value: string): Promise<void>;
}
```

### Scheduler

The backend's `main.ts` sets up a `setInterval` that calls `processScheduledNotifications()` every 60 seconds:

```typescript
setInterval(() => {
  notificationService.processScheduledNotifications().catch((err) =>
    logger.error("Notification scheduler failed", { error: String(err) })
  );
}, 60_000);
```

### Processing Logic

On each tick, `processScheduledNotifications()`:

```
1. Query tracked_events WHERE notified_created = 0
   → For each: resolve assembly members, check preferences, dispatch, set flag

2. Query tracked_events WHERE notified_voting_open = 0 AND voting_start <= now
   → For each: dispatch "voting is now open", set flag

3. Query tracked_events WHERE notified_deadline = 0 AND voting_end <= now + 24h
   → For each: dispatch "voting closes tomorrow", set flag

4. Query tracked_events WHERE notified_closed = 0 AND voting_end <= now
   → For each: dispatch "results available", set flag

5. Same 3 checks for tracked_polls (created, deadline, closed)
```

Each flag is a boolean column. Once set, the notification is never re-sent. This is idempotent — restarting the scheduler doesn't re-send old notifications.

### Recipient Resolution

For a tracked event in assembly X:
1. Query `memberships WHERE assembly_id = X` → get user IDs
2. For each user, query `notification_preferences` → apply defaults for missing keys
3. Filter: skip users with `notify_channel = "none"` or preference turned off
4. For `undelegated_only`: query VCP for user's active delegations in assembly, check if event topics are covered
5. Dispatch to remaining users via the appropriate adapter

### Delegation-Aware Filtering

When a user's `notify_new_votes` preference is `"undelegated_only"`:

```
1. Get user's participant ID from memberships table
2. Call VCPClient.listDelegations(assemblyId, participantId)
3. Get the new event's issue topics
4. If ALL issue topics are covered by active delegations → skip notification
5. If ANY topic is uncovered → send notification
```

This is the one place where the notification service queries the VCP. It's a read-only check at notification time, not a polling loop.

---

## 6. Proxy Interceptor

### Location

`platform/backend/src/api/routes/proxy.ts`

### Behavior

The proxy currently forwards requests to VCP and streams responses back unchanged. For notification-relevant operations, the proxy additionally inspects the response and tracks the data:

```typescript
// In the proxy handler for POST /assemblies/:assemblyId/events
if (method === "POST" && path matches /\/assemblies\/[^/]+\/events$/) {
  // Forward to VCP as normal
  const vcpResponse = await forwardToVcp(...);

  // If successful, extract event data and track
  if (vcpResponse.status === 201) {
    const event = await vcpResponse.json();
    await notificationService.trackEvent({
      id: event.id,
      assemblyId,
      title: event.title,
      votingStart: event.timeline.votingStart,
      votingEnd: event.timeline.votingEnd,
    });
  }

  return vcpResponse;
}
```

Same pattern for `POST /assemblies/:assemblyId/polls`.

**Important:** The interceptor reads the response body to extract the ID. Since the body is a stream that can only be consumed once, the implementation needs to clone the response or buffer the body before returning it to the client.

### What the interceptor captures

| Route | Captured fields |
|-------|----------------|
| `POST /assemblies/:id/events` | `id`, `title`, `timeline.votingStart`, `timeline.votingEnd` |
| `POST /assemblies/:id/polls` | `id`, `title`, `schedule`, `closesAt` |

All other routes pass through without interception.

---

## 7. Delivery Adapters

### Interface

```typescript
interface NotificationAdapter {
  send(params: {
    to: string;           // email address or phone number
    subject: string;
    body: string;
    bodyHtml?: string;    // optional HTML version for email
  }): Promise<void>;
}
```

### Implementations

| Adapter | Class | Config | Use case |
|---------|-------|--------|----------|
| Console | `ConsoleNotificationAdapter` | None | Dev — logs to stdout |
| SMTP | `SmtpNotificationAdapter` | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | Self-hosted email |
| SES | `SesNotificationAdapter` | `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `SES_FROM` | AWS email |
| SMS | `TwilioSmsAdapter` | `TWILIO_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM` | SMS via Twilio |

The active adapter is selected by config: `BACKEND_NOTIFICATION_ADAPTER=console|smtp|ses|twilio`

For production, multiple adapters can be active simultaneously (email + SMS). The `notify_channel` preference determines which adapter is used per user.

### Console Adapter (Dev Default)

```typescript
class ConsoleNotificationAdapter implements NotificationAdapter {
  async send({ to, subject, body }) {
    logger.info(`[notification] To: ${to} | ${subject}`, { body });
  }
}
```

This is the default. In dev, notifications appear in the backend's terminal output. No external services required.

---

## 8. API Endpoints

### Preferences

```
GET  /me/notifications          → { preferences: { notify_new_votes, ... } }
PUT  /me/notifications          → body: { key: "notify_new_votes", value: "undelegated_only" }
```

These are authenticated endpoints under the existing `/me` route group.

### No notification history endpoint

We intentionally don't store sent notifications or provide a notification inbox. The dashboard IS the inbox. Email/SMS are outbound-only channels that bring users back to the app.

---

## 9. Configuration

New backend config fields:

```env
# Notification adapter: console (default), smtp, ses, twilio
BACKEND_NOTIFICATION_ADAPTER=console

# SMTP settings (when adapter=smtp)
BACKEND_SMTP_HOST=smtp.example.com
BACKEND_SMTP_PORT=587
BACKEND_SMTP_USER=
BACKEND_SMTP_PASS=
BACKEND_SMTP_FROM=noreply@votiverse.example.com

# AWS SES settings (when adapter=ses)
BACKEND_SES_REGION=us-east-1
BACKEND_SES_FROM=noreply@votiverse.example.com

# Twilio settings (when adapter=twilio)
BACKEND_TWILIO_SID=
BACKEND_TWILIO_AUTH_TOKEN=
BACKEND_TWILIO_FROM=+1234567890

# Scheduler interval in milliseconds (default: 60000 = 1 minute)
BACKEND_NOTIFICATION_INTERVAL=60000
```

---

## 10. Seed Data Consideration

The seed script creates events and polls directly via the VCP, bypassing the backend proxy. These events won't be in `tracked_events`. Two approaches:

**Option A (recommended):** Add a "sync" step to the backend seed script that reads current VCP events/polls and populates `tracked_events`/`tracked_polls` with all notification flags pre-set to 1 (already notified). This prevents the scheduler from sending notifications about historical seeded data.

**Option B:** The scheduler ignores events created more than 1 hour ago (grace period). Simple but less explicit.

---

## 11. Implementation Phases

### Phase 1: Database + Notification Service + Console Adapter

- Add `tracked_events`, `tracked_polls`, `notification_preferences` tables to SQLite schema
- Create `NotificationService` with `trackEvent()`, `trackPoll()`, `processScheduledNotifications()`
- Create `ConsoleNotificationAdapter`
- Wire scheduler in `main.ts`
- Preference API: `GET/PUT /me/notifications`

**Verify:** Create an event via the VCP seed, run backend sync, see console output from scheduler.

### Phase 2: Proxy Interceptor

- Update proxy routes to intercept `POST /events` and `POST /polls` responses
- Extract event/poll data and call `notificationService.trackEvent()`/`trackPoll()`
- Buffer response body for interception without breaking the stream

**Verify:** Create an event through the web UI → see notification in backend console within 1 minute.

### Phase 3: Email Adapter (SMTP)

- Create `SmtpNotificationAdapter` using `nodemailer`
- Notification templates (plain text + HTML) for each notification type
- Config for SMTP settings
- Test with a local SMTP server (e.g., Mailpit)

**Verify:** Set `BACKEND_NOTIFICATION_ADAPTER=smtp`, create an event → receive email.

### Phase 4: User Preferences UI

- Settings page in web client: `/settings/notifications`
- Toggle switches for each preference
- Channel selector (email / sms / both / none)
- Phone number field for SMS

### Phase 5: SES + Twilio Adapters (Production)

- `SesNotificationAdapter` using AWS SDK
- `TwilioSmsAdapter` using Twilio SDK
- Multi-adapter support (email + SMS simultaneously based on user preference)

---

## 12. Notification Templates

### New Vote Created

**Subject:** New vote in [Assembly Name]: [Event Title]
**Body:**
```
A new vote has been created in [Assembly Name].

[Event Title]
[Event Description]

[N] questions to vote on
Voting opens: [votingStart]
Voting closes: [votingEnd]

Go to Votiverse to review and vote: [link]
```

### Voting Now Open

**Subject:** Voting is open: [Event Title]
**Body:**
```
Voting is now open for [Event Title] in [Assembly Name].

[N] questions need your vote.
Deadline: [votingEnd]

Cast your vote: [link]
```

### Deadline Approaching (24h)

**Subject:** Voting closes tomorrow: [Event Title]
**Body:**
```
Voting for [Event Title] in [Assembly Name] closes in less than 24 hours.

You have [N] questions remaining.
Deadline: [votingEnd]

Vote now: [link]
```

### Results Available

**Subject:** Results are in: [Event Title]
**Body:**
```
Voting has closed for [Event Title] in [Assembly Name].

View the results: [link]
```

### New Survey

**Subject:** New survey in [Assembly Name]: [Poll Title]
**Body:**
```
A new survey has been created in [Assembly Name].

[Poll Title]
[N] questions

Your observations matter — surveys help the community understand
what's happening on the ground.

Respond now: [link]
```

### Survey Closing Soon

**Subject:** Survey closes tomorrow: [Poll Title]
**Body:**
```
The survey [Poll Title] in [Assembly Name] closes in less than 24 hours.

If you haven't responded yet, your observations are still needed.

Respond now: [link]
```

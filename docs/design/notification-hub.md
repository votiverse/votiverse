# Notification Hub — Design Document

**Status:** Approved, not yet built (March 2026)

---

## 1. Problem

The current notification system sends emails but has no in-app notification feed. The dashboard shows pending items (votes, invitations, join requests) but there's no unified way to know what happened while you were away. There are also no admin notifications — admins have no way to know someone is waiting to join unless they check the Members page.

In a governance context, missing a notification can mean missing a vote. The stakes are structurally higher than in chat or social apps. The platform needs a persistent notification hub that works across web and mobile (shared React codebase).

## 2. Design Principles

1. **Governance-first, not social-first.** Notifications are about democratic participation, not engagement metrics. Every notification should either require action, be time-sensitive, or record a governance event.
2. **In-app feed is always on.** Notification records are created regardless of email/push preferences. Preferences control only external delivery channels.
3. **Urgency is explicit.** Three levels: action (you need to do something), timely (time-sensitive awareness), info (for your records). Action items surface first.
4. **Role-aware.** Admins see admin events (join requests, new members) alongside participant events. One feed, not two systems.
5. **Assembly-scoped, globally viewable.** Each notification belongs to an assembly. The hub shows all assemblies but supports filtering.
6. **Same data model on web and mobile.** The backend produces notification records. The frontend renders them. Push notifications are just delivery triggers.

## 3. Urgency Model

| Urgency | Meaning | Visual | Examples |
|---------|---------|--------|----------|
| `action` | You need to do something | Bold, prominent | Vote pending, join request to review, invitation to respond to |
| `timely` | Time-sensitive awareness | Normal weight | New voting event created, survey opens, deadline in 48h |
| `info` | For your records | Muted | Results published, member joined, request approved/rejected |

The notification feed sorts by: unread first, then within unread by urgency (action > timely > info), then by recency.

## 4. Notification Types

### Participant notifications

| Type | Urgency | Trigger | Title template |
|------|---------|---------|---------------|
| `vote_created` | timely | New voting event in your assembly | "New vote: {title}" |
| `voting_open` | action | Voting window opens | "Voting is open: {title}" |
| `deadline_approaching` | action | 24h before voting closes (if you haven't voted) | "Voting closes tomorrow: {title}" |
| `results_available` | info | Voting closed | "Results are in: {title}" |
| `survey_created` | timely | New survey in your assembly | "New survey: {title}" |
| `survey_deadline` | action | 24h before survey closes (if you haven't responded) | "Survey closes tomorrow: {title}" |
| `invitation_received` | action | Admin sent you a direct invitation | "You're invited to join {assembly}" |
| `join_request_approved` | info | Admin approved your join request | "You've been approved to join {assembly}" |
| `join_request_rejected` | info | Admin rejected your join request | "Your request to join {assembly} was not approved" |

### Admin notifications

| Type | Urgency | Trigger | Title template |
|------|---------|---------|---------------|
| `join_request` | action | Someone requests to join (approval mode) | "{name} wants to join {assembly}" |
| `member_joined` | info | New member joined (any mode) | "{name} joined {assembly}" |

### Future (not in initial build)

| Type | Urgency | Trigger |
|------|---------|---------|
| `delegation_changed` | info | Someone delegated to or revoked from you |
| `proposal_submitted` | timely | New proposal in a deliberation event |
| `note_added` | info | Community note added to your proposal/candidacy |
| `candidacy_declared` | timely | New candidate declared in candidacy-mode assembly |

## 5. Database Schema

### `notifications` table (new)

```sql
CREATE TABLE IF NOT EXISTS notifications (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  assembly_id     TEXT NOT NULL,
  type            TEXT NOT NULL,
  urgency         TEXT NOT NULL DEFAULT 'info',   -- action | timely | info
  title           TEXT NOT NULL,
  body            TEXT,                            -- optional detail line
  action_url      TEXT,                            -- deep link path (e.g., /assembly/x/events/y)
  read_at         TEXT,                            -- null = unread
  created_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON notifications(user_id, read_at);
CREATE INDEX IF NOT EXISTS idx_notifications_user_created
  ON notifications(user_id, created_at DESC);
```

No `delivered_at` or delivery tracking — email/push delivery is fire-and-forget. The notification record exists whether or not external delivery succeeds.

### No changes to existing tables

The `tracked_events`, `tracked_surveys`, and `notification_preferences` tables remain. The scheduler still uses them for timing. The change is that when the scheduler fires, it creates notification records AND dispatches email.

## 6. User Preferences (extended)

### Existing preferences (unchanged)

| Key | Default | Controls |
|-----|---------|----------|
| `notify_new_votes` | `"always"` | Email for new voting events |
| `notify_new_surveys` | `"true"` | Email for new surveys |
| `notify_deadlines` | `"true"` | Email for 24h deadline warnings |
| `notify_results` | `"false"` | Email for results available |
| `notify_channel` | `"email"` | Delivery channel (email/sms/both/none) |

### New preferences

| Key | Default | Controls |
|-----|---------|----------|
| `notify_admin_join_requests` | `"true"` | Email when someone requests to join (admin only) |
| `notify_admin_new_members` | `"false"` | Email when someone joins (admin only) |

All preferences are **global** (not per-assembly). This keeps the settings page simple. Per-assembly overrides can be added later if users request it.

**In-app notifications are not gated by preferences.** The notification record is always created. Preferences only control external delivery (email, push). You can turn off all emails and still see everything in the hub.

## 7. Backend Architecture

### `NotificationHubService` (new)

```typescript
class NotificationHubService {
  /** Create a notification for a single user. Also dispatches to external channels. */
  async notify(params: {
    userId: string;
    assemblyId: string;
    type: NotificationType;
    urgency: "action" | "timely" | "info";
    title: string;
    body?: string;
    actionUrl?: string;
  }): Promise<void>;

  /** Create notifications for all members of an assembly (batch). */
  async notifyAssemblyMembers(params: {
    assemblyId: string;
    type: NotificationType;
    urgency: "action" | "timely" | "info";
    title: string;
    body?: string;
    actionUrl?: string;
    filter?: (userId: string) => Promise<boolean>;
  }): Promise<void>;

  /** Create notifications for assembly admins only. */
  async notifyAssemblyAdmins(params: {
    assemblyId: string;
    type: NotificationType;
    urgency: "action" | "timely" | "info";
    title: string;
    body?: string;
    actionUrl?: string;
  }): Promise<void>;

  /** List notifications for a user (paginated, with optional filters). */
  async list(userId: string, options?: {
    assemblyId?: string;
    unreadOnly?: boolean;
    limit?: number;
    offset?: number;
  }): Promise<{ notifications: Notification[]; unreadCount: number }>;

  /** Mark a notification as read. */
  async markRead(notificationId: string, userId: string): Promise<void>;

  /** Mark all notifications as read for a user. */
  async markAllRead(userId: string, assemblyId?: string): Promise<void>;

  /** Get unread count for a user (for badge). */
  async getUnreadCount(userId: string): Promise<number>;
}
```

### Integration with existing scheduler

The `NotificationService.processScheduledNotifications()` method currently:
1. Queries tracked events/surveys for pending notifications
2. Resolves recipients based on preferences
3. Sends emails

After this change, it will:
1. Query tracked events/surveys for pending notifications
2. Call `notificationHub.notifyAssemblyMembers()` for each — which creates notification records AND dispatches emails based on preferences
3. The preference filtering moves inside `notifyAssemblyMembers()`

### Integration with invitation/admission routes

When these events occur, the route handler calls the hub directly:

- **Direct invite created** → `notificationHub.notify()` for invitee (type: `invitation_received`, urgency: `action`)
- **Join request created** → `notificationHub.notifyAssemblyAdmins()` (type: `join_request`, urgency: `action`)
- **Join request approved** → `notificationHub.notify()` for requester (type: `join_request_approved`, urgency: `info`)
- **Join request rejected** → `notificationHub.notify()` for requester (type: `join_request_rejected`, urgency: `info`)
- **Member joined** → `notificationHub.notifyAssemblyAdmins()` (type: `member_joined`, urgency: `info`)

## 8. API Endpoints

### Notification feed

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/me/notifications` | Auth | List notifications (paginated, filterable) |
| GET | `/me/notifications/unread-count` | Auth | Unread count for badge |
| POST | `/me/notifications/:id/read` | Auth | Mark single notification as read |
| POST | `/me/notifications/read-all` | Auth | Mark all as read (optional `?assemblyId=`) |

**Note:** The existing `GET /me/notifications` endpoint currently returns notification preferences. This will need to be moved to `GET /me/notification-preferences` (or the notifications feed uses a different path like `GET /me/notifications/feed`). Decision: rename the preferences endpoint to `GET /me/notification-preferences` and `PUT /me/notification-preferences` to avoid collision.

### Query parameters for feed

```
GET /me/notifications?limit=20&offset=0&assemblyId=asm_xyz&unreadOnly=true
```

Response:
```json
{
  "notifications": [
    {
      "id": "ntf_abc",
      "assemblyId": "asm_xyz",
      "assemblyName": "OSC Governance Board",
      "type": "voting_open",
      "urgency": "action",
      "title": "Voting is open: Dependency Policy Review",
      "body": "5 issues to vote on. Voting closes March 25.",
      "actionUrl": "/assembly/asm_xyz/events/evt_123",
      "read": false,
      "createdAt": "2026-03-19T10:30:00Z"
    }
  ],
  "unreadCount": 7,
  "total": 42
}
```

## 9. Frontend Architecture

### Notification bell (header component)

- Bell icon in the top-right header area
- Badge with unread count (fetched via `GET /me/notifications/unread-count`)
- Polls every 30 seconds (or uses SSE/WebSocket in future)
- Click opens dropdown panel

### Notification dropdown

- Shows the 10 most recent notifications
- Grouped visually: action items at top (highlighted), then timely, then info
- Each item: assembly name (small), type icon, title, relative time, read/unread dot
- Click on item: navigates to `actionUrl`, marks as read
- "Mark all read" button at top
- "View all" link at bottom → navigates to `/notifications`

### Full notification page (`/notifications`)

- Complete notification history with pagination
- Filter by assembly (dropdown)
- Filter by unread only (toggle)
- Bulk "Mark all read" action
- Each notification is a clickable card with assembly context, title, body, time
- Responsive: works on mobile (Tauri) as full-width cards

### Shared components

Both dropdown and full page use the same `NotificationItem` component:
```
[icon] [assembly name]              [time ago]
       [title]                      [unread dot]
       [body - if present]
```

## 10. Implementation Phases

### Phase 1: Backend — Schema + Hub Service + Admin Notifications
- Add `notifications` table (SQLite + PostgreSQL)
- Create `NotificationHubService`
- Wire admin notifications into join request and membership routes
- Rename preference endpoints to `/me/notification-preferences`
- Add notification feed endpoints (`GET /me/notifications`, etc.)
- Tests for hub service and admin notification creation

### Phase 2: Backend — Migrate Scheduler to Hub
- Modify `NotificationService.processScheduledNotifications()` to create notification records via the hub
- Participant notifications (vote_created, voting_open, etc.) now produce hub records
- Email dispatch moves inside `notificationHub.notify()`, gated by preferences
- Update existing notification tests

### Phase 3: Frontend — Bell + Dropdown
- Unread count polling (30s interval)
- Bell icon with badge in header
- Dropdown panel with recent notifications
- Mark as read on click
- "View all" link

### Phase 4: Frontend — Full Page + Preferences Update
- `/notifications` page with pagination, assembly filter, unread filter
- Update notification settings page for new admin preferences
- Rename API calls from `/me/notifications` to `/me/notification-preferences`

### Phase 5: Push Notifications (Future — Mobile)
- `PushNotificationAdapter` for APNs/FCM
- Device token registration endpoint
- Push payload format (title + body + action URL)
- Tauri integration

## 11. Migration Strategy

The existing `NotificationService` and its scheduler continue to work throughout the migration. Phase 1 adds the hub alongside. Phase 2 wires the scheduler into the hub. At no point does the existing email delivery break.

The preference endpoint rename (Phase 1) is a breaking change for the web client. Since we haven't deployed to production, this is fine — update both backend and web simultaneously.

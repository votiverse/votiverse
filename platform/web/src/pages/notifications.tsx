/**
 * Notifications page — full notification history with filtering.
 *
 * Accessible via the "View all notifications" link in the bell dropdown
 * and via the /notifications route.
 */

import { useState, useCallback } from "react";
import { useNavigate } from "react-router";
import { useApi } from "../hooks/use-api.js";
import * as api from "../api/client.js";
import type { Notification } from "../api/types.js";
import { Card, CardBody, Button, Badge, Spinner, EmptyState } from "../components/ui.js";
import { Vote, BarChart3, UserPlus, CheckCircle, XCircle, Clock } from "lucide-react";

export function Notifications() {
  const [unreadOnly, setUnreadOnly] = useState(false);
  const { data, loading, refetch } = useApi(
    () => api.listNotifications({ limit: 50, unreadOnly }),
    [unreadOnly],
  );
  const navigate = useNavigate();

  const notifications = data?.notifications ?? [];
  const unreadCount = data?.unreadCount ?? 0;

  const handleClick = useCallback((notif: Notification) => {
    if (!notif.read) {
      void api.markNotificationRead(notif.id).then(() => refetch());
    }
    if (notif.actionUrl) {
      navigate(notif.actionUrl);
    }
  }, [navigate, refetch]);

  const handleMarkAllRead = useCallback(async () => {
    await api.markAllNotificationsRead();
    refetch();
  }, [refetch]);

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-xl sm:text-2xl font-semibold text-gray-900">Notifications</h1>
          {unreadCount > 0 && <Badge color="blue">{unreadCount} unread</Badge>}
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-gray-500 cursor-pointer">
            <input
              type="checkbox"
              checked={unreadOnly}
              onChange={(e) => setUnreadOnly(e.target.checked)}
              className="rounded border-gray-300"
            />
            Unread only
          </label>
          {unreadCount > 0 && (
            <Button variant="secondary" size="sm" onClick={handleMarkAllRead}>
              Mark all read
            </Button>
          )}
        </div>
      </div>

      {loading ? (
        <Spinner />
      ) : notifications.length === 0 ? (
        <EmptyState
          title={unreadOnly ? "No unread notifications" : "No notifications yet"}
          description={unreadOnly ? "Try showing all notifications." : "Notifications will appear here when there's activity in your groups."}
        />
      ) : (
        <div className="space-y-1">
          {notifications.map((notif) => (
            <NotificationCard
              key={notif.id}
              notification={notif}
              onClick={() => handleClick(notif)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function NotificationCard({ notification, onClick }: { notification: Notification; onClick: () => void }) {
  const icon = TYPE_ICONS[notification.type] ?? <Clock size={16} />;
  const urgencyBadge = notification.urgency === "action"
    ? <Badge color="red">Action needed</Badge>
    : notification.urgency === "timely"
      ? <Badge color="blue">New</Badge>
      : null;

  const cardBg = !notification.read && notification.urgency === "action"
    ? "bg-red-50/40 border-red-200 hover:border-red-300"
    : !notification.read && notification.urgency === "timely"
      ? "bg-blue-50/30 hover:border-blue-200"
      : "hover:border-gray-300";

  return (
    <Card
      className={`cursor-pointer transition-colors ${cardBg} ${notification.read ? "opacity-50" : ""}`}
    >
      <CardBody className="py-3">
        <button onClick={onClick} className="w-full text-left">
          <div className="flex items-start gap-3">
            <div className={`mt-0.5 shrink-0 ${notification.read ? "text-gray-300" : "text-gray-500"}`}>
              {icon}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 mb-0.5">
                {notification.assemblyName && (
                  <span className="text-xs text-gray-400 truncate">{notification.assemblyName}</span>
                )}
                {!notification.read && urgencyBadge}
              </div>
              <p className={`text-sm ${notification.read ? "text-gray-500" : "text-gray-900 font-medium"}`}>
                {notification.title}
              </p>
              {notification.body && (
                <p className="text-xs text-gray-400 mt-0.5">{notification.body}</p>
              )}
              <p className="text-xs text-gray-300 mt-1">
                {formatTimeAgo(notification.createdAt)}
              </p>
            </div>
            {!notification.read && (
              <div className="w-2.5 h-2.5 rounded-full bg-brand mt-1.5 shrink-0" />
            )}
          </div>
        </button>
      </CardBody>
    </Card>
  );
}

const TYPE_ICONS: Record<string, React.ReactNode> = {
  vote_created: <Vote size={16} />,
  voting_open: <Vote size={16} />,
  deadline_approaching: <Clock size={16} />,
  results_available: <BarChart3 size={16} />,
  survey_created: <BarChart3 size={16} />,
  survey_deadline: <Clock size={16} />,
  invitation_received: <UserPlus size={16} />,
  join_request: <UserPlus size={16} />,
  member_joined: <UserPlus size={16} />,
  join_request_approved: <CheckCircle size={16} />,
  join_request_rejected: <XCircle size={16} />,
};

function formatTimeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

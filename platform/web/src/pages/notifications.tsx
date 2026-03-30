/**
 * Notifications page — full notification history with filtering.
 *
 * Accessible via the "View all notifications" link in the bell dropdown
 * and via the /notifications route.
 */

import { useState, useCallback } from "react";
import { useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { useApi } from "../hooks/use-api.js";
import * as api from "../api/client.js";
import type { Notification } from "../api/types.js";
import { Card, CardBody, Button, Badge, Spinner, EmptyState } from "../components/ui.js";
import { formatRelativeTime } from "../lib/format.js";
import { Vote, BarChart3, UserPlus, CheckCircle, XCircle, Clock } from "lucide-react";

export function Notifications() {
  const { t } = useTranslation("notifications");
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
          <h1 className="text-xl sm:text-2xl font-bold font-display text-text-primary">{t("title")}</h1>
          {unreadCount > 0 && <Badge color="blue">{t("unreadCount", { count: unreadCount })}</Badge>}
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-text-muted cursor-pointer">
            <input
              type="checkbox"
              checked={unreadOnly}
              onChange={(e) => setUnreadOnly(e.target.checked)}
              className="rounded border-border-strong"
            />
            {t("unreadOnly")}
          </label>
          {unreadCount > 0 && (
            <Button variant="secondary" size="sm" onClick={handleMarkAllRead}>
              {t("markAllRead")}
            </Button>
          )}
        </div>
      </div>

      {loading ? (
        <Spinner />
      ) : notifications.length === 0 ? (
        <EmptyState
          title={unreadOnly ? t("emptyUnread") : t("empty")}
          description={unreadOnly ? t("emptyUnreadDescription") : t("emptyDescription")}
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
  const { t } = useTranslation("notifications");
  const icon = TYPE_ICONS[notification.type] ?? <Clock size={16} />;
  const urgencyBadge = notification.urgency === "action"
    ? <Badge color="red">{t("urgency.action")}</Badge>
    : notification.urgency === "timely"
      ? <Badge color="blue">{t("urgency.timely")}</Badge>
      : null;

  const cardBg = !notification.read && notification.urgency === "action"
    ? "bg-error-subtle border-error hover:border-error"
    : !notification.read && notification.urgency === "timely"
      ? "bg-info-subtle hover:border-info"
      : "hover:border-border-strong";

  return (
    <Card
      className={`cursor-pointer transition-colors ${cardBg} ${notification.read ? "opacity-50" : ""}`}
    >
      <CardBody className="py-3">
        <button onClick={onClick} className="w-full text-left">
          <div className="flex items-start gap-3">
            <div className={`mt-0.5 shrink-0 ${notification.read ? "text-text-tertiary" : "text-text-muted"}`}>
              {icon}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 mb-0.5">
                {notification.groupName && (
                  <span className="text-xs text-text-tertiary truncate">{notification.groupName}</span>
                )}
                {!notification.read && urgencyBadge}
              </div>
              <p className={`text-sm ${notification.read ? "text-text-muted" : "text-text-primary font-medium"}`}>
                {notification.title}
              </p>
              {notification.body && (
                <p className="text-xs text-text-tertiary mt-0.5">{notification.body}</p>
              )}
              <p className="text-xs text-text-tertiary mt-1">
                {formatRelativeTime(notification.createdAt)}
              </p>
            </div>
            {!notification.read && (
              <div className="w-2.5 h-2.5 rounded-full bg-accent mt-1.5 shrink-0" />
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


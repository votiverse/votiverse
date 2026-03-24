/**
 * NotificationBell — header bell icon with unread count badge and dropdown feed.
 *
 * Polls for unread count every 30 seconds. Dropdown shows recent notifications
 * sorted by urgency (action > timely > info), with mark-read on click.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import * as api from "../api/client.js";
import type { Notification } from "../api/types.js";
import { formatRelativeTime } from "../lib/format.js";
import { Bell, Vote, BarChart3, UserPlus, CheckCircle, XCircle, Clock } from "lucide-react";

const POLL_INTERVAL_MS = 30_000;

export function NotificationBell() {
  const { t } = useTranslation("notifications");
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  // Poll for unread count
  useEffect(() => {
    let mounted = true;
    const poll = async () => {
      try {
        const data = await api.getUnreadNotificationCount();
        if (mounted) setUnreadCount(data.unreadCount);
      } catch {
        // ignore — not logged in or server unavailable
      }
    };
    void poll();
    const interval = setInterval(poll, POLL_INTERVAL_MS);
    return () => { mounted = false; clearInterval(interval); };
  }, []);

  // Fetch notifications when dropdown opens
  useEffect(() => {
    if (!open) return;
    let mounted = true;
    setLoading(true);
    api.listNotifications({ limit: 10 })
      .then((data) => {
        if (mounted) {
          setNotifications(data.notifications);
          setUnreadCount(data.unreadCount);
        }
      })
      .catch(() => {})
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, [open]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleClick = useCallback((notif: Notification) => {
    // Mark as read
    if (!notif.read) {
      void api.markNotificationRead(notif.id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === notif.id ? { ...n, read: true } : n)),
      );
      setUnreadCount((c) => Math.max(0, c - 1));
    }
    // Navigate if there's an action URL
    if (notif.actionUrl) {
      navigate(notif.actionUrl);
      setOpen(false);
    }
  }, [navigate]);

  const handleMarkAllRead = useCallback(async () => {
    await api.markAllNotificationsRead();
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnreadCount(0);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="relative p-2 text-text-muted hover:text-text-secondary transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center cursor-pointer"
        aria-label={unreadCount > 0 ? t("ariaLabelUnread", { count: unreadCount }) : t("title")}
      >
        <Bell size={18} strokeWidth={1.5} />
        {unreadCount > 0 && (
          <span className="absolute top-1.5 right-1.5 min-w-[16px] h-4 flex items-center justify-center rounded-full bg-accent text-text-on-accent text-[10px] font-bold px-1">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-1 w-80 sm:w-96 bg-surface-raised border border-border-default rounded-lg shadow-xl z-30 max-h-[70vh] flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border-subtle">
            <h3 className="text-sm font-semibold text-text-primary">{t("title")}</h3>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="text-xs text-accent-text hover:text-accent-text transition-colors"
              >
                {t("markAllRead")}
              </button>
            )}
          </div>

          {/* Notification list */}
          <div className="overflow-y-auto flex-1">
            {loading ? (
              <div className="py-8 text-center text-sm text-text-tertiary">{t("common:loading")}</div>
            ) : notifications.length === 0 ? (
              <div className="py-8 text-center text-sm text-text-tertiary">{t("empty")}</div>
            ) : (
              notifications.map((notif) => (
                <NotificationItem
                  key={notif.id}
                  notification={notif}
                  onClick={() => handleClick(notif)}
                />
              ))
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-border-subtle px-4 py-2">
            <button
              onClick={() => { navigate("/notifications"); setOpen(false); }}
              className="text-xs text-accent-text hover:text-accent-text transition-colors w-full text-center"
            >
              {t("viewAll")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Notification item ────────────────────────────────────────────────

function NotificationItem({ notification, onClick }: { notification: Notification; onClick: () => void }) {
  const icon = TYPE_ICONS[notification.type] ?? <Clock size={14} />;
  const bgClass = !notification.read && notification.urgency === "action"
    ? "bg-error-subtle hover:bg-error-subtle"
    : !notification.read && notification.urgency === "timely"
      ? "bg-info-subtle hover:bg-info-subtle"
      : "hover:bg-interactive-hover";
  const borderClass = notification.urgency === "action"
    ? "border-l-error"
    : notification.urgency === "timely"
      ? "border-l-info"
      : "border-l-transparent";

  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-4 py-3 border-l-2 ${borderClass} ${bgClass} transition-colors cursor-pointer ${
        notification.read ? "opacity-50" : ""
      }`}
    >
      <div className="flex items-start gap-2.5">
        <div className={`mt-0.5 shrink-0 ${notification.read ? "text-text-tertiary" : "text-text-muted"}`}>
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          {notification.assemblyName && (
            <p className="text-[10px] text-text-tertiary uppercase tracking-wide mb-0.5 truncate">
              {notification.assemblyName}
            </p>
          )}
          <p className={`text-sm leading-snug ${notification.read ? "text-text-muted" : "text-text-primary"}`}>
            {notification.title}
          </p>
          {notification.body && (
            <p className="text-xs text-text-tertiary mt-0.5 line-clamp-2">{notification.body}</p>
          )}
          <p className="text-[10px] text-text-tertiary mt-1">
            {formatRelativeTime(notification.createdAt)}
          </p>
        </div>
        {!notification.read && (
          <div className="w-2 h-2 rounded-full bg-accent mt-1.5 shrink-0" />
        )}
      </div>
    </button>
  );
}

// ── Icon mapping ─────────────────────────────────────────────────────

const TYPE_ICONS: Record<string, React.ReactNode> = {
  vote_created: <Vote size={14} />,
  voting_open: <Vote size={14} />,
  deadline_approaching: <Clock size={14} />,
  results_available: <BarChart3 size={14} />,
  survey_created: <BarChart3 size={14} />,
  survey_deadline: <Clock size={14} />,
  invitation_received: <UserPlus size={14} />,
  join_request: <UserPlus size={14} />,
  member_joined: <UserPlus size={14} />,
  join_request_approved: <CheckCircle size={14} />,
  join_request_rejected: <XCircle size={14} />,
};


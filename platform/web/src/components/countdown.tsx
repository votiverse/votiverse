import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";

export function Countdown({ target, className = "" }: { target: string; className?: string }) {
  const { t } = useTranslation();
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(interval);
  }, []);

  const deadline = new Date(target).getTime();
  const diff = deadline - now;

  if (diff <= 0) {
    return <span className={`text-text-tertiary ${className}`}>{t("countdown.ended")}</span>;
  }

  const minutes = Math.floor(diff / 60_000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  let text: string;
  let colorClass: string;

  if (days > 3) {
    text = t("countdown.days", { days });
    colorClass = "text-text-muted";
  } else if (days >= 1) {
    text = t("countdown.daysHours", { days, hours: hours % 24 });
    colorClass = "text-warning-text";
  } else if (hours >= 1) {
    text = t("countdown.hoursMinutes", { hours, minutes: minutes % 60 });
    colorClass = "text-error-text";
  } else {
    text = t("countdown.minutes", { minutes });
    colorClass = "text-error-text font-semibold";
  }

  return <span className={`${colorClass} ${className}`}>{text}</span>;
}

export function formatRelativeTime(target: string): string {
  const diff = new Date(target).getTime() - Date.now();
  if (diff <= 0) return "ended";
  const minutes = Math.floor(diff / 60_000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}d`;
  if (hours > 0) return `${hours}h`;
  return `${minutes}m`;
}

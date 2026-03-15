import { useState, useEffect } from "react";

export function Countdown({ target, className = "" }: { target: string; className?: string }) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(interval);
  }, []);

  const deadline = new Date(target).getTime();
  const diff = deadline - now;

  if (diff <= 0) {
    return <span className={`text-gray-400 ${className}`}>Ended</span>;
  }

  const minutes = Math.floor(diff / 60_000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  let text: string;
  let colorClass: string;

  if (days > 3) {
    text = `in ${days}d`;
    colorClass = "text-gray-500";
  } else if (days >= 1) {
    text = `in ${days}d ${hours % 24}h`;
    colorClass = "text-yellow-600";
  } else if (hours >= 1) {
    text = `in ${hours}h ${minutes % 60}m`;
    colorClass = "text-red-600";
  } else {
    text = `in ${minutes}m`;
    colorClass = "text-red-600 font-semibold";
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

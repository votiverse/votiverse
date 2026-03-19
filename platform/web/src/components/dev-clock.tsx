/**
 * DevClock — floating widget for controlling the VCP test clock.
 *
 * Only rendered when import.meta.env.DEV is true (Vite dev mode).
 * Talks directly to VCP's /dev/clock endpoints (bypasses backend proxy).
 */

import { useState, useEffect, useCallback } from "react";
import { setDevClockOffset } from "../lib/status.js";

const VCP_URL = "http://localhost:3000";

interface ClockState {
  time: number;
  iso: string;
  mode: "system" | "test" | "test-reset";
  systemTime: number;
}

async function fetchClock(): Promise<ClockState | null> {
  try {
    const res = await fetch(`${VCP_URL}/dev/clock`);
    if (!res.ok) return null;
    return res.json() as Promise<ClockState>;
  } catch {
    return null;
  }
}

async function advanceClock(ms: number): Promise<ClockState | null> {
  try {
    const res = await fetch(`${VCP_URL}/dev/clock/advance`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ms }),
    });
    if (!res.ok) return null;
    return res.json() as Promise<ClockState>;
  } catch {
    return null;
  }
}

async function resetClock(): Promise<ClockState | null> {
  try {
    const res = await fetch(`${VCP_URL}/dev/clock/reset`, { method: "POST" });
    if (!res.ok) return null;
    return res.json() as Promise<ClockState>;
  } catch {
    return null;
  }
}

const HOUR = 3_600_000;
const DAY = 86_400_000;

export function DevClock() {
  const [clock, setClock] = useState<ClockState | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [available, setAvailable] = useState(true);

  const refresh = useCallback(async () => {
    const state = await fetchClock();
    if (state) {
      setClock(state);
      setAvailable(true);
    } else {
      setAvailable(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 5000);
    return () => clearInterval(interval);
  }, [refresh]);

  const handleAdvance = async (ms: number) => {
    const result = await advanceClock(ms);
    if (result) setClock(result);
    // Force page data refresh
    window.dispatchEvent(new Event("dev-clock-change"));
  };

  const handleReset = async () => {
    const result = await resetClock();
    if (result) setClock(result);
    window.dispatchEvent(new Event("dev-clock-change"));
  };

  if (!available) return null;

  const isTestMode = clock?.mode === "test";
  const offset = clock ? clock.time - clock.systemTime : 0;
  const offsetLabel = offset === 0 ? "" : formatOffset(offset);

  // Sync dev clock offset to client-side status derivation
  useEffect(() => {
    setDevClockOffset(offset);
  }, [offset]);

  return (
    <div className="fixed bottom-4 right-4 z-50 lg:bottom-6 lg:right-6">
      {/* Collapsed: small pill */}
      {!expanded && (
        <button
          onClick={() => setExpanded(true)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-mono shadow-lg border transition-colors ${
            isTestMode
              ? "bg-amber-50 border-amber-300 text-amber-800 hover:bg-amber-100"
              : "bg-white border-gray-200 text-gray-500 hover:bg-gray-50"
          }`}
          title="Dev Clock"
        >
          <span>{isTestMode ? "⏱" : "⏰"}</span>
          {clock && (
            <span>
              {new Date(clock.time).toLocaleTimeString()}
              {offsetLabel && <span className="ml-1 text-amber-600">{offsetLabel}</span>}
            </span>
          )}
        </button>
      )}

      {/* Expanded: control panel */}
      {expanded && (
        <div className="bg-white border border-gray-200 rounded-xl shadow-xl w-72 overflow-hidden">
          {/* Header */}
          <div className={`px-3 py-2 flex items-center justify-between ${isTestMode ? "bg-amber-50" : "bg-gray-50"}`}>
            <div className="flex items-center gap-1.5">
              <span className="text-sm">{isTestMode ? "⏱" : "⏰"}</span>
              <span className="text-xs font-semibold text-gray-700">Dev Clock</span>
              {isTestMode && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-200 text-amber-800 font-medium">TEST</span>
              )}
            </div>
            <button onClick={() => setExpanded(false)} className="text-gray-400 hover:text-gray-600 text-sm px-1">
              ×
            </button>
          </div>

          {/* Current time */}
          <div className="px-3 py-2 border-b border-gray-100">
            <div className="font-mono text-sm text-gray-900">
              {clock ? new Date(clock.time).toLocaleString() : "Loading..."}
            </div>
            {offsetLabel && (
              <div className="text-xs text-amber-600 mt-0.5">
                {offsetLabel} from real time
              </div>
            )}
          </div>

          {/* Quick advance buttons */}
          <div className="px-3 py-2 border-b border-gray-100">
            <div className="text-[10px] text-gray-400 uppercase tracking-wider mb-1.5">Advance</div>
            <div className="flex gap-1.5 flex-wrap">
              {[
                { label: "1h", ms: HOUR },
                { label: "6h", ms: 6 * HOUR },
                { label: "1d", ms: DAY },
                { label: "3d", ms: 3 * DAY },
                { label: "7d", ms: 7 * DAY },
                { label: "30d", ms: 30 * DAY },
              ].map((btn) => (
                <button
                  key={btn.label}
                  onClick={() => handleAdvance(btn.ms)}
                  className="px-2.5 py-1 text-xs rounded border border-gray-200 bg-white hover:bg-gray-50 hover:border-gray-300 text-gray-700 transition-colors"
                >
                  +{btn.label}
                </button>
              ))}
            </div>
          </div>

          {/* Reset */}
          <div className="px-3 py-2">
            <button
              onClick={handleReset}
              className="w-full text-xs text-center py-1.5 rounded border border-gray-200 text-gray-600 hover:bg-gray-50 hover:border-gray-300 transition-colors"
            >
              Reset to real time
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function formatOffset(ms: number): string {
  const abs = Math.abs(ms);
  const sign = ms >= 0 ? "+" : "-";
  const days = Math.floor(abs / DAY);
  const hours = Math.floor((abs % DAY) / HOUR);
  if (days > 0) return `${sign}${days}d ${hours}h`;
  const minutes = Math.floor((abs % HOUR) / 60_000);
  if (hours > 0) return `${sign}${hours}h ${minutes}m`;
  return `${sign}${minutes}m`;
}

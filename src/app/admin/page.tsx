"use client";

import { useState, useEffect, useCallback } from "react";
import { RefreshCw } from "lucide-react";

const EVENT_KEYS = [
  "signal_refreshed",
  "signal_analysed",
  "strategy_generated",
  "strategy_accepted",
  "strategy_rejected",
  "decision_logged",
  "assessment_generated",
  "report_generated",
] as const;

type EventKey = typeof EVENT_KEYS[number];

const EVENT_META: Record<EventKey, { label: string; color: string }> = {
  signal_refreshed:    { label: "Refresh",    color: "#1b7ff0" },
  signal_analysed:     { label: "Analyse",    color: "#1b7ff0" },
  strategy_generated:  { label: "Strategy",   color: "#CC1F1F" },
  strategy_accepted:   { label: "Accepted",   color: "#34d399" },
  strategy_rejected:   { label: "Rejected",   color: "#555555" },
  decision_logged:     { label: "Decision",   color: "#f59e0b" },
  assessment_generated:{ label: "Assess",     color: "#a78bfa" },
  report_generated:    { label: "Report",     color: "#fb923c" },
};

interface Events7d extends Record<EventKey, number> {}

interface FeedbackRow {
  id: string;
  profile_id: string | null;
  rating: number | null;
  category: string | null;
  message: string;
  page: string | null;
  created_at: string;
}

interface UserRow {
  profile_id: string;
  company_name: string | null;
  industry: string | null;
  joined: string;
  events_7d: Events7d;
  last_seen: string | null;
}

interface StatsData {
  users: UserRow[];
  totals: {
    total_users: number;
    active_7d: number;
    total_events_7d: number;
  };
  feedback: FeedbackRow[];
}

function timeAgo(iso: string | null): string {
  if (!iso) return "never";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function AdminPage() {
  const [password, setPassword] = useState("");
  const [authed, setAuthed] = useState(false);
  const [wrongPw, setWrongPw] = useState(false);
  const [data, setData] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const fetchStats = useCallback(async (pw: string) => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/stats", {
        headers: { "X-Admin-Password": pw },
      });
      if (res.status === 401) {
        setWrongPw(true);
        setAuthed(false);
        return;
      }
      if (!res.ok) {
        setError("Failed to load stats");
        return;
      }
      const json = await res.json() as StatsData;
      setData(json);
      setAuthed(true);
      sessionStorage.setItem("admin_pw", pw);
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }, []);

  // Restore from session on mount
  useEffect(() => {
    const saved = sessionStorage.getItem("admin_pw");
    if (saved) {
      setPassword(saved);
      fetchStats(saved);
    }
  }, [fetchStats]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setWrongPw(false);
    fetchStats(password);
  };

  if (!authed) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <div className="w-full max-w-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#444444] mb-1 text-center">
            VANTAGE
          </p>
          <h1 className="text-xl font-semibold text-[#f5f5f5] mb-6 text-center">Admin Access</h1>
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Admin password"
              autoFocus
              className="w-full rounded-lg border border-[#242424] bg-[#111111] px-4 py-3 text-sm text-[#f5f5f5] placeholder-[#444444] outline-none focus:border-[#1b7ff0]/60 transition-colors"
            />
            {wrongPw && (
              <p className="text-xs text-[#e5463e]">Wrong password</p>
            )}
            <button
              type="submit"
              disabled={loading || !password}
              className="w-full rounded-lg bg-[#CC1F1F] py-3 text-sm font-semibold text-white hover:bg-[#b01818] transition-colors disabled:opacity-40"
            >
              {loading ? "Checking..." : "Enter"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  const storedPw = sessionStorage.getItem("admin_pw") ?? password;

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#f5f5f5] p-8">
      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-xl font-semibold text-[#f5f5f5]">VANTAGE Admin</h1>
          <p className="text-xs text-[#444444] mt-0.5">Internal analytics</p>
        </div>
        <button
          onClick={() => fetchStats(storedPw)}
          disabled={loading}
          className="flex items-center gap-2 rounded-lg border border-[#242424] px-4 py-2 text-xs font-semibold text-[#a0a0a0] hover:border-[#1b7ff0]/40 hover:text-[#1b7ff0] transition-colors disabled:opacity-40"
        >
          <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      {error && (
        <p className="text-xs text-[#e5463e] mb-6">{error}</p>
      )}

      {data && (
        <>
          {/* Totals */}
          <div className="grid grid-cols-3 gap-4 mb-8">
            {[
              { label: "Total Users", value: data.totals.total_users },
              { label: "Active Last 7 Days", value: data.totals.active_7d },
              { label: "Events Last 7 Days", value: data.totals.total_events_7d },
            ].map((stat) => (
              <div key={stat.label} className="rounded-lg border border-[#1a1a1a] bg-[#111111] p-5">
                <p className="text-3xl font-bold text-[#f5f5f5] mb-1">{stat.value}</p>
                <p className="text-xs text-[#555555] uppercase tracking-wider">{stat.label}</p>
              </div>
            ))}
          </div>

          {/* Table */}
          <div className="rounded-lg border border-[#1a1a1a] overflow-hidden">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-[#1a1a1a] bg-[#111111]">
                  <th className="text-left px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-[#444444]">Company</th>
                  <th className="text-left px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-[#444444]">Industry</th>
                  <th className="text-left px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-[#444444]">Joined</th>
                  <th className="text-left px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-[#444444]">Last Seen</th>
                  {EVENT_KEYS.map((key) => (
                    <th key={key} className="text-center px-3 py-3 text-[10px] font-semibold uppercase tracking-wider text-[#444444]">
                      <span style={{ color: EVENT_META[key].color }}>{EVENT_META[key].label}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.users.map((user, i) => (
                  <tr
                    key={user.profile_id}
                    className={`border-b border-[#151515] ${i % 2 === 0 ? "bg-[#0a0a0a]" : "bg-[#0d0d0d]"} hover:bg-[#141414] transition-colors`}
                  >
                    <td className="px-4 py-3 font-semibold text-[#f5f5f5] whitespace-nowrap">
                      {user.company_name ?? <span className="text-[#333333]">—</span>}
                    </td>
                    <td className="px-4 py-3 text-[#666666] whitespace-nowrap text-xs">
                      {user.industry ?? <span className="text-[#333333]">—</span>}
                    </td>
                    <td className="px-4 py-3 font-mono text-[#555555] text-xs whitespace-nowrap">
                      {formatDate(user.joined)}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs whitespace-nowrap">
                      <span className={user.last_seen ? "text-[#a0a0a0]" : "text-[#333333]"}>
                        {timeAgo(user.last_seen)}
                      </span>
                    </td>
                    {EVENT_KEYS.map((key) => {
                      const count = user.events_7d[key];
                      return (
                        <td key={key} className="px-3 py-3 text-center">
                          {count === 0 ? (
                            <span className="text-[#2a2a2a] text-xs">—</span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#f5f5f5]">
                              <span
                                className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                                style={{ backgroundColor: EVENT_META[key].color }}
                              />
                              {count}
                            </span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
                {data.users.length === 0 && (
                  <tr>
                    <td colSpan={4 + EVENT_KEYS.length} className="px-4 py-8 text-center text-xs text-[#444444]">
                      No users yet
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Recent Feedback */}
          <div className="mt-10">
            <h2 className="text-sm font-semibold text-[#f5f5f5] mb-4 uppercase tracking-[0.15em]">
              Recent Feedback
            </h2>
            {data.feedback.length === 0 ? (
              <p className="text-xs text-[#333333]">No feedback submitted yet</p>
            ) : (
              <div className="flex flex-col gap-3">
                {data.feedback.map((fb) => (
                  <div key={fb.id} className="rounded-lg border border-[#1a1a1a] bg-[#111111] p-4">
                    <div className="flex items-center gap-3 mb-2">
                      {/* Stars */}
                      {fb.rating !== null && (
                        <div className="flex items-center gap-0.5">
                          {[1, 2, 3, 4, 5].map((s) => (
                            <span
                              key={s}
                              className={`text-[12px] ${s <= fb.rating! ? "text-[#f59e0b]" : "text-[#2a2a2a]"}`}
                            >
                              ★
                            </span>
                          ))}
                        </div>
                      )}
                      {/* Category */}
                      {fb.category && (
                        <span className="text-[9px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded bg-[#1a1a1a] text-[#666666]">
                          {fb.category.replace("_", " ")}
                        </span>
                      )}
                      {/* Page */}
                      {fb.page && (
                        <span className="text-[9px] font-mono text-[#333333]">{fb.page}</span>
                      )}
                      <span className="ml-auto text-[9px] font-mono text-[#333333]">
                        {timeAgo(fb.created_at)}
                      </span>
                    </div>
                    <p className="text-sm text-[#a0a0a0] leading-relaxed">{fb.message}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * /admin/analytics — the control centre.
 *
 * Auth reuses the existing mechanism exactly: the password is typed once,
 * kept in sessionStorage under `admin_pw` (same key /admin/invites uses, so
 * signing in to one signs you in to both), and sent as X-Admin-Password.
 *
 * Tables and counters only, no charts. Dense on purpose.
 */

interface UserRow {
  profile_id: string;
  email: string | null;
  company_name: string | null;
  product_description: string | null;
  target_customer: string | null;
  top_priority: string | null;
  arr_band: string | null;
  onboarding_completed: boolean;
  signed_up: string;
  last_login: string | null;
  last_active: string | null;
  refreshes_30d: number;
  analyses_30d: number;
  decisions_total: number;
  advisor_msgs_total: number;
}

interface Analytics {
  generated_at: string;
  signups: { all_time: number; this_week: number; today: number };
  users: UserRow[];
  activity: {
    signals_refreshed: number;
    decisions_created: number;
    analyse_clicks: number;
    advisor_messages: number;
  };
  leaderboard: { profile_id: string; company_name: string | null; email: string | null; actions: number }[];
  adoption: {
    total_users: number;
    onboarded: number; onboarded_pct: number;
    with_decision: number; with_decision_pct: number;
    with_advisor: number; with_advisor_pct: number;
    with_analysis: number; with_analysis_pct: number;
  };
  api_usage: {
    cost_tracked: boolean;
    note: string;
    per_day: { day: string; signals_ingested: number; gate_runs: number; analyses: number; advisor_messages: number }[];
    totals_30d: { gate_runs: number; analyses: number; advisor_messages: number; signals_ingested: number };
  };
}

type SortKey = "last_active" | "signed_up" | "company_name";

const C = {
  bg: "#090a0b",
  panel: "#111214",
  line: "#ffffff13",
  text: "#e8eaee",
  muted: "#959ca7",
  dim: "#737d8a",
  accent: "#ff321f",
};

function ago(iso: string | null): string {
  if (!iso) return "—";
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}
const day = (iso: string | null) => (iso ? iso.slice(0, 10) : "—");

function Metric({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div style={{ border: `1px solid ${C.line}`, background: C.panel, borderRadius: 8, padding: "14px 16px" }}>
      <div style={{ fontSize: 10, letterSpacing: 1.2, textTransform: "uppercase", color: C.dim }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 450, color: C.text, marginTop: 6 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginTop: 34 }}>
      <h2 style={{ fontSize: 11, letterSpacing: 1.6, textTransform: "uppercase", color: C.accent, marginBottom: 12 }}>
        {title}
      </h2>
      {children}
    </section>
  );
}

const th: React.CSSProperties = {
  textAlign: "left", fontSize: 10, letterSpacing: 0.8, textTransform: "uppercase",
  color: C.dim, padding: "8px 10px", borderBottom: `1px solid ${C.line}`, whiteSpace: "nowrap",
};
const td: React.CSSProperties = {
  fontSize: 12, color: C.text, padding: "9px 10px", borderBottom: `1px solid ${C.line}`,
  verticalAlign: "top",
};

export default function AdminAnalyticsPage() {
  const [password, setPassword] = useState("");
  const [authed, setAuthed] = useState(false);
  const [wrong, setWrong] = useState(false);
  const [data, setData] = useState<Analytics | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [sort, setSort] = useState<SortKey>("last_active");

  const load = useCallback(async (pw: string) => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/analytics", { headers: { "X-Admin-Password": pw } });
      if (res.status === 401) {
        setWrong(true);
        setAuthed(false);
        return;
      }
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to load");
      sessionStorage.setItem("admin_pw", pw);
      setData(body as Analytics);
      setAuthed(true);
      setWrong(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const stored = sessionStorage.getItem("admin_pw");
    if (stored) void load(stored);
  }, [load]);

  if (!authed) {
    return (
      <div style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <form
          onSubmit={(e) => { e.preventDefault(); void load(password); }}
          style={{ width: 300, background: C.panel, border: `1px solid ${C.line}`, borderRadius: 10, padding: 22 }}
        >
          <div style={{ fontSize: 11, letterSpacing: 1.6, textTransform: "uppercase", color: C.dim, marginBottom: 12 }}>
            Vantage · Analytics
          </div>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Admin password"
            style={{ width: "100%", background: "#0c0d0f", color: C.text, border: `1px solid ${C.line}`, borderRadius: 6, padding: 10, fontSize: 13 }}
          />
          {wrong && <p style={{ color: C.accent, fontSize: 11, marginTop: 8 }}>Wrong password</p>}
          {error && <p style={{ color: C.accent, fontSize: 11, marginTop: 8 }}>{error}</p>}
          <button
            type="submit"
            disabled={loading}
            style={{ width: "100%", marginTop: 12, background: C.accent, color: "#fff", border: 0, borderRadius: 6, padding: "10px 0", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
          >
            {loading ? "Checking…" : "Enter"}
          </button>
        </form>
      </div>
    );
  }

  if (!data) {
    return <div style={{ minHeight: "100vh", background: C.bg, color: C.muted, padding: 40, fontSize: 13 }}>Loading…</div>;
  }

  const users = [...data.users].sort((a, b) => {
    if (sort === "company_name") return (a.company_name ?? "~").localeCompare(b.company_name ?? "~");
    const key = sort === "signed_up" ? "signed_up" : "last_active";
    return String(b[key] ?? "").localeCompare(String(a[key] ?? ""));
  });

  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.text, padding: "28px 30px 80px", fontFamily: "var(--font-inter), system-ui, sans-serif" }}>
      <header style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 16 }}>
        <h1 style={{ fontSize: 20, fontWeight: 500, letterSpacing: -0.3 }}>Analytics</h1>
        <div style={{ fontSize: 11, color: C.dim }}>
          generated {new Date(data.generated_at).toLocaleString()}{" "}
          <button
            onClick={() => void load(sessionStorage.getItem("admin_pw") ?? "")}
            style={{ marginLeft: 10, background: "transparent", color: C.muted, border: `1px solid ${C.line}`, borderRadius: 5, padding: "3px 9px", fontSize: 11, cursor: "pointer" }}
          >
            {loading ? "…" : "Refresh"}
          </button>
        </div>
      </header>

      <Section title="Users">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10, marginBottom: 14 }}>
          <Metric label="Signups all-time" value={data.signups.all_time} />
          <Metric label="This week" value={data.signups.this_week} />
          <Metric label="Today" value={data.signups.today} />
        </div>

        <div style={{ display: "flex", gap: 8, marginBottom: 10, fontSize: 11, color: C.muted }}>
          <span style={{ color: C.dim }}>Sort:</span>
          {(["last_active", "signed_up", "company_name"] as SortKey[]).map((k) => (
            <button
              key={k}
              onClick={() => setSort(k)}
              style={{ background: "transparent", border: 0, cursor: "pointer", padding: 0,
                color: sort === k ? C.accent : C.muted, textDecoration: sort === k ? "underline" : "none" }}
            >
              {k.replace("_", " ")}
            </button>
          ))}
        </div>

        <div style={{ overflowX: "auto", border: `1px solid ${C.line}`, borderRadius: 8, background: C.panel }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1100 }}>
            <thead>
              <tr>
                <th style={th}>Email</th>
                <th style={th}>Company</th>
                <th style={th}>Product</th>
                <th style={th}>Priority</th>
                <th style={th}>ARR</th>
                <th style={th}>Signed up</th>
                <th style={th}>Last login</th>
                <th style={th}>Last active</th>
                <th style={th}>Onb.</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.profile_id}>
                  <td style={td}>{u.email ?? "—"}</td>
                  <td style={td}>{u.company_name ?? <span style={{ color: C.dim }}>—</span>}</td>
                  <td style={{ ...td, maxWidth: 280, color: C.muted }}>
                    {u.product_description ?? <span style={{ color: C.dim }}>—</span>}
                  </td>
                  <td style={td}>{u.top_priority ?? <span style={{ color: C.dim }}>—</span>}</td>
                  <td style={td}>{u.arr_band ?? <span style={{ color: C.dim }}>—</span>}</td>
                  <td style={{ ...td, color: C.muted }}>{day(u.signed_up)}</td>
                  <td style={{ ...td, color: C.muted }}>{ago(u.last_login)}</td>
                  <td style={{ ...td, color: u.last_active ? C.text : C.dim }}>{ago(u.last_active)}</td>
                  <td style={{ ...td, color: u.onboarding_completed ? "#7cc47c" : C.dim }}>
                    {u.onboarding_completed ? "yes" : "no"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Activity · last 30 days">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10, marginBottom: 14 }}>
          <Metric label="Signals refreshed" value={data.activity.signals_refreshed} />
          <Metric label="Decisions created" value={data.activity.decisions_created} />
          <Metric label="Advisor messages" value={data.activity.advisor_messages} sub="user turns, all-time" />
          <Metric label="Analyse impact" value={data.activity.analyse_clicks} />
        </div>

        <div style={{ overflowX: "auto", border: `1px solid ${C.line}`, borderRadius: 8, background: C.panel }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 700 }}>
            <thead>
              <tr>
                <th style={th}>User</th>
                <th style={th}>Refreshes 30d</th>
                <th style={th}>Analyses 30d</th>
                <th style={th}>Decisions</th>
                <th style={th}>Advisor msgs</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.profile_id}>
                  <td style={td}>{u.company_name ?? u.email ?? u.profile_id.slice(0, 8)}</td>
                  <td style={td}>{u.refreshes_30d}</td>
                  <td style={td}>{u.analyses_30d}</td>
                  <td style={td}>{u.decisions_total}</td>
                  <td style={td}>{u.advisor_msgs_total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h3 style={{ fontSize: 11, letterSpacing: 1.2, textTransform: "uppercase", color: C.dim, margin: "18px 0 8px" }}>
          Most active this week
        </h3>
        {data.leaderboard.length === 0 ? (
          <p style={{ fontSize: 12, color: C.dim }}>No activity in the last 7 days.</p>
        ) : (
          <ol style={{ margin: 0, paddingLeft: 18 }}>
            {data.leaderboard.map((l) => (
              <li key={l.profile_id} style={{ fontSize: 12, color: C.text, padding: "3px 0" }}>
                {l.company_name ?? l.email ?? l.profile_id.slice(0, 8)}{" "}
                <span style={{ color: C.muted }}>— {l.actions} actions</span>
              </li>
            ))}
          </ol>
        )}
      </Section>

      <Section title="Feature adoption">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 10 }}>
          <Metric label="Completed onboarding" value={`${data.adoption.onboarded_pct}%`} sub={`${data.adoption.onboarded} of ${data.adoption.total_users}`} />
          <Metric label="Created a decision" value={`${data.adoption.with_decision_pct}%`} sub={`${data.adoption.with_decision} of ${data.adoption.total_users}`} />
          <Metric label="Used the advisor" value={`${data.adoption.with_advisor_pct}%`} sub={`${data.adoption.with_advisor} of ${data.adoption.total_users}`} />
          <Metric label="Clicked analyse" value={`${data.adoption.with_analysis_pct}%`} sub={`${data.adoption.with_analysis} of ${data.adoption.total_users}`} />
        </div>
      </Section>

      <Section title="API usage">
        <p style={{ fontSize: 11, color: C.dim, margin: "0 0 12px", maxWidth: 760, lineHeight: 1.6 }}>
          {data.api_usage.note}
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10, marginBottom: 14 }}>
          <Metric label="Gate runs 30d" value={data.api_usage.totals_30d.gate_runs} sub="one Claude call each" />
          <Metric label="Analyses 30d" value={data.api_usage.totals_30d.analyses} sub="one Claude call each" />
          <Metric label="Advisor msgs 30d" value={data.api_usage.totals_30d.advisor_messages} sub="one Claude call each" />
          <Metric label="Signals ingested 30d" value={data.api_usage.totals_30d.signals_ingested} />
        </div>
        <div style={{ overflowX: "auto", border: `1px solid ${C.line}`, borderRadius: 8, background: C.panel }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 600 }}>
            <thead>
              <tr>
                <th style={th}>Day</th>
                <th style={th}>Signals ingested</th>
                <th style={th}>Gate runs</th>
                <th style={th}>Analyses</th>
                <th style={th}>Advisor msgs</th>
              </tr>
            </thead>
            <tbody>
              {data.api_usage.per_day.map((d) => (
                <tr key={d.day}>
                  <td style={{ ...td, color: C.muted }}>{d.day}</td>
                  <td style={td}>{d.signals_ingested}</td>
                  <td style={td}>{d.gate_runs}</td>
                  <td style={td}>{d.analyses}</td>
                  <td style={td}>{d.advisor_messages}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}

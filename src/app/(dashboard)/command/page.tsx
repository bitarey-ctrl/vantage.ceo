"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  Radio,
  RefreshCw,
  ArrowUpRight,
  ChevronRight,
  X,
} from "lucide-react";
import { toPlainText } from "@/lib/text";

/*
 * Command — rebuilt to the prototype's structure (components/redesign/
 * home.tsx), wired to real Supabase data.
 *
 * Layout follows the prototype: page heading, date strip, the two-up
 * "next action + signal brief" grid, a decision progress strip, and a
 * tabbed queue.
 *
 * Real sources, all pre-existing:
 *   GET  /api/dashboard         priority decision, attention list, context
 *   GET  /api/advisor/read      the advisor's standing read
 *   GET  /api/signals/raw       the signal brief
 *   GET  /api/decisions         progress strip + decisions tab
 *   GET  /api/strategies        strategies tab
 *   POST /api/signals/refresh   refresh control on the brief
 *
 * OMITTED from the prototype: the owner avatar on the next action (the
 * decisions table has no owner column) and the Follow-ups tab (no such
 * table exists). Adding either would mean inventing data.
 */

type Tone = "urgent" | "soon" | "watch";

interface PriorityDecision {
  id: string;
  title: string;
  description: string | null;
  deadline: string | null;
  blindSpotCount: number;
}
interface AttentionItem {
  id: string;
  title: string;
  deadline: string | null;
  tone: Tone;
}
interface OperatingContext {
  focus: string | null;
  decisionVelocityDays: number | null;
}
interface SignalWithConsequence {
  id: string;
  signalId: string;
  title: string;
  category: string;
  soWhat: string;
  confidenceScore: number;
  createdAt: string;
}
interface DashboardData {
  priorityDecision: PriorityDecision | null;
  attention: AttentionItem[];
  operatingContext: OperatingContext;
  signalsWithConsequence: SignalWithConsequence[];
}
interface RawSignal {
  id: string;
  title: string;
  category: string | null;
  urgency: string | null;
  why_it_matters: string | null;
  what_happened: string | null;
  created_at: string;
}
interface DecisionRow {
  id: string;
  title: string;
  status: string;
  created_at: string;
}
interface StrategyRow {
  id: string;
  title: string;
  status: string;
}

const CATEGORY_LABEL: Record<string, string> = {
  pricing: "Pricing",
  cost_base: "Cost Base",
  competition: "Competition",
  compliance: "Compliance",
  capital: "Capital",
};
const URGENCY_LABEL: Record<string, string> = {
  act_this_week: "Act this week",
  decide_this_month: "Decide this month",
  watch: "Watch",
};
const RESOLVED = new Set(["resolved", "archived"]);

function dateLabel(iso: string | null): string {
  if (!iso) return "No deadline";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "No deadline";
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

type Tab = "Decisions" | "Signals" | "Strategies";

export default function CommandPage() {
  const router = useRouter();

  const [data, setData] = useState<DashboardData | null>(null);
  const [signals, setSignals] = useState<RawSignal[]>([]);
  const [decisions, setDecisions] = useState<DecisionRow[]>([]);
  const [strategies, setStrategies] = useState<StrategyRow[]>([]);
  const [advisorQuote, setAdvisorQuote] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [checkedAt, setCheckedAt] = useState("Not checked this session");
  const [notice, setNotice] = useState("");
  const [tab, setTab] = useState<Tab>("Decisions");

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [dashRes, sigRes, decRes, strRes, advRes] = await Promise.all([
        fetch("/api/dashboard"),
        fetch("/api/signals/raw"),
        fetch("/api/decisions?limit=100"),
        fetch("/api/strategies"),
        fetch("/api/advisor/read"),
      ]);
      if (dashRes.ok) setData(await dashRes.json());
      if (sigRes.ok) {
        const s = await sigRes.json();
        setSignals(Array.isArray(s) ? s : []);
      }
      if (decRes.ok) {
        const d = await decRes.json();
        setDecisions(Array.isArray(d) ? d : []);
      }
      if (strRes.ok) {
        const s = await strRes.json();
        setStrategies(Array.isArray(s) ? s : []);
      }
      if (advRes.ok) {
        const a = (await advRes.json()) as { quote?: string | null };
        setAdvisorQuote(a?.quote ?? null);
      }
    } catch {
      /* individual panels degrade to their empty states */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const handleRefresh = async () => {
    setRefreshing(true);
    setCheckedAt("Checking sources...");
    setNotice("");
    try {
      const res = await fetch("/api/signals/refresh", { method: "POST" });
      const body = (await res.json().catch(() => ({}))) as { signalsAdded?: number; error?: string };
      if (!res.ok) {
        setCheckedAt("Check failed");
        setNotice(body.error ?? "Refresh failed.");
        return;
      }
      const added = body.signalsAdded ?? 0;
      setCheckedAt(added > 0 ? "Checked just now · " + added + " new" : "Checked just now · nothing new");
      await loadAll();
    } catch {
      setCheckedAt("Check failed");
      setNotice("Refresh failed. Check your connection.");
    } finally {
      setRefreshing(false);
    }
  };

  const priority = data?.priorityDecision ?? null;
  const attention = data?.attention ?? [];
  const brief = signals[0] ?? null;

  const resolved = useMemo(() => decisions.filter((d) => RESOLVED.has(d.status)).length, [decisions]);
  const openCount = decisions.length - resolved;

  const today = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="vx-calm-page vx-home-operating">
      <div className="vx-page-heading">
        <div>
          <h1>Your day, in focus.</h1>
          <p>Know what to move forward—and what can wait.</p>
        </div>
        <button className="vx-btn" onClick={() => router.push("/decisions")}>
          <Plus size={14} />New decision
        </button>
      </div>

      <div className="vx-home-date">
        <span>{today.toUpperCase()}</span>
        <span>
          {data?.operatingContext?.decisionVelocityDays != null
            ? data.operatingContext.decisionVelocityDays + "d decision velocity"
            : "Command centre"}
        </span>
      </div>

      <div className="vx-command-brief-grid">
        <section className="vx-next-action">
          <div className="vx-next-action-label">
            <span className="vx-dot vx-red" />
            {priority ? "READY FOR REVIEW" : "YOU'RE CAUGHT UP"}
            <span>{priority ? dateLabel(priority.deadline) : ""}</span>
          </div>
          <h2>{priority ? priority.title : "Make room for the next important decision."}</h2>
          <p>
            {priority
              ? priority.description ||
                "Review what you know, resolve the blind spots, and make the call."
              : "Review fresh signals or frame a new decision when something changes."}
          </p>
          {priority && priority.blindSpotCount > 0 && (
            <div className="vx-next-action-context">
              <span>
                {priority.blindSpotCount} blind spot{priority.blindSpotCount === 1 ? "" : "s"} flagged
                <small>Resolve these before committing.</small>
              </span>
            </div>
          )}
          <footer>
            {priority ? (
              <button className="vx-btn vx-primary" onClick={() => router.push("/decisions/" + priority.id)}>
                Continue decision<ArrowUpRight size={15} />
              </button>
            ) : (
              <button className="vx-btn vx-primary" onClick={() => router.push("/signals")}>
                Review signals<ArrowUpRight size={15} />
              </button>
            )}
            {advisorQuote && (
              <button className="vx-text-btn" onClick={() => router.push("/advisor")}>
                Ask the advisor<ArrowUpRight size={14} />
              </button>
            )}
          </footer>
        </section>

        <section className="vx-home-signal-brief" aria-label="Signal brief">
          <div className="vx-signal-brief-heading">
            <span><Radio size={14} /> SIGNAL BRIEF</span>
            <button
              className="vx-text-btn"
              aria-label="Refresh signals"
              title="Refresh signals"
              onClick={handleRefresh}
              disabled={refreshing}
            >
              <RefreshCw size={16} className={refreshing ? "vx-refreshing" : ""} />
            </button>
          </div>
          <h2>One change to look at first.</h2>
          {brief ? (
            <button className="vx-brief-story" onClick={() => router.push("/signals")}>
              <span>
                <strong>{brief.why_it_matters || toPlainText(brief.title)}</strong>
                <small>
                  {CATEGORY_LABEL[brief.category ?? ""] ?? "Signal"} ·{" "}
                  {URGENCY_LABEL[brief.urgency ?? "watch"] ?? "Watch"}
                </small>
              </span>
            </button>
          ) : (
            <p className="vx-quiet-note">
              {loading ? "Loading signals..." : "No signals yet. Refresh to check your sources."}
            </p>
          )}
          <div className="vx-brief-footer">
            <button className="vx-text-btn" onClick={() => router.push("/signals")}>
              Review signals<ArrowUpRight size={15} />
            </button>
            <span role="status">
              {refreshing
                ? "Checking sources..."
                : checkedAt === "Not checked this session"
                ? signals.length + " signal" + (signals.length === 1 ? "" : "s") + " in your field of view"
                : checkedAt}
            </span>
          </div>
        </section>
      </div>

      <section className="vx-progress-strip" aria-label="Decision progress">
        <div className="vx-progress-top">
          <div>
            <strong>{resolved}<span> / {decisions.length}</span></strong>
            <span>decisions resolved</span>
          </div>
          <button className="vx-text-btn" onClick={() => router.push("/decisions")}>
            View decisions<ChevronRight size={13} />
          </button>
        </div>
        <div
          className="vx-decision-progress"
          role="progressbar"
          aria-label="Decisions resolved"
          aria-valuenow={resolved}
          aria-valuemin={0}
          aria-valuemax={decisions.length || 1}
        >
          {decisions.map((d) => (
            <span
              key={d.id}
              className={RESOLVED.has(d.status) ? "is-resolved" : ""}
              title={d.title + ": " + d.status}
            />
          ))}
        </div>
        <div className="vx-progress-caption">
          <span>{openCount} still open</span>
          <span>{signals.length} signal{signals.length === 1 ? "" : "s"} tracked</span>
        </div>
      </section>

      {notice && (
        <div className="vx-notice" role="status">
          {notice}
          <button aria-label="Dismiss update" onClick={() => setNotice("")}>
            <X size={14} />
          </button>
        </div>
      )}

      <section className="vx-home-queue">
        <div className="vx-home-queue-head">
          <div className="vx-tabs">
            {(["Decisions", "Signals", "Strategies"] as const).map((t) => (
              <button key={t} aria-pressed={tab === t} onClick={() => setTab(t)}>
                {t}
                <span>
                  {t === "Decisions" ? attention.length : t === "Signals" ? signals.length : strategies.length}
                </span>
              </button>
            ))}
          </div>
          <button className="vx-text-btn" onClick={() => router.push("/" + tab.toLowerCase())}>
            View all<ChevronRight size={14} />
          </button>
        </div>

        {tab === "Decisions" && (
          attention.length ? (
            attention.map((a) => (
              <button
                key={a.id}
                className="vx-simple-row"
                onClick={() => router.push("/decisions/" + a.id)}
              >
                <span>
                  <small>{dateLabel(a.deadline)}</small>
                  <strong>{a.title}</strong>
                </span>
                <ChevronRight size={15} />
              </button>
            ))
          ) : (
            <div className="vx-empty"><h2>Nothing needs a decision right now</h2></div>
          )
        )}

        {tab === "Signals" && (
          signals.length ? (
            signals.slice(0, 6).map((s) => (
              <button key={s.id} className="vx-simple-row" onClick={() => router.push("/signals")}>
                <span>
                  <small>{CATEGORY_LABEL[s.category ?? ""] ?? "Signal"}</small>
                  <strong>{s.why_it_matters || toPlainText(s.title)}</strong>
                </span>
                <ChevronRight size={15} />
              </button>
            ))
          ) : (
            <div className="vx-empty"><h2>No signals yet</h2></div>
          )
        )}

        {tab === "Strategies" && (
          strategies.length ? (
            strategies.slice(0, 6).map((s) => (
              <button
                key={s.id}
                className="vx-simple-row"
                onClick={() => router.push("/strategies/" + s.id)}
              >
                <span>
                  <small>{s.status}</small>
                  <strong>{s.title}</strong>
                </span>
                <ChevronRight size={15} />
              </button>
            ))
          ) : (
            <div className="vx-empty"><h2>No strategies yet</h2></div>
          )
        )}
      </section>
    </div>
  );
}

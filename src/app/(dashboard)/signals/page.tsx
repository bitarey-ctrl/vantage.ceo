"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  RefreshCw,
  SlidersHorizontal,
  Search,
  ChevronRight,
  ArrowRight,
  ArrowUpRight,
  Link2,
  Plus,
  Loader2,
  Check,
  X,
} from "lucide-react";
import { toPlainText } from "@/lib/text";

/*
 * Signals — rebuilt to the prototype's structure (components/redesign/
 * workspace.tsx, the vx-calm-page block), wired to real Supabase data.
 *
 * Two views, as in the prototype: a calm inbox list, and a reading document
 * for one signal. Every existing API call is preserved:
 *   GET   /api/signals/raw              the feed
 *   GET   /api/signals/analysis-map     which signals already have analysis
 *   POST  /api/signals/refresh          refresh button
 *   POST  /api/signals/:id/review       mark reviewed on first open
 *   GET   /api/signals/:id/consequence  load an existing analysis
 *   POST  /api/signals/:id/analyse      run company-specific analysis
 *   PATCH /api/signals/:id/respond      accept / dismiss
 *   GET   /api/strategies?signalId=     linked strategies
 *   POST  /api/strategies/generate      turn a signal into a strategy
 *
 * OMITTED from the prototype because the gate produces no such data: a
 * per-signal confidence score and an "if you wait" line. Both DO exist on a
 * consequence, so they appear in the analysis block once Analyse has actually
 * run — real data earned by a real call, not a number invented for every card.
 */

type Urgency = "act_this_week" | "decide_this_month" | "watch";
type Category = "pricing" | "cost_base" | "competition" | "compliance" | "capital";

interface RawSignal {
  id: string;
  title: string;
  content: string;
  source: string;
  url: string | null;
  published_at: string | null;
  urgency: Urgency | null;
  category: string | null;
  what_happened: string | null;
  why_it_matters: string | null;
  what_to_consider: string | null;
  created_at: string;
}

interface ConsequenceAnalysis {
  soWhat: string;
  ifYouAct: string;
  ifYouDont: string;
  immediateAction: string;
  status: "pending" | "accepted" | "rejected";
  consequenceId: string;
  confidence_score?: number;
}

interface LinkedStrategy {
  id: string;
  title: string;
  status: "considering" | "deciding" | "decided" | "archived";
}

const CATEGORIES: readonly Category[] = ["pricing", "cost_base", "competition", "compliance", "capital"];
const CATEGORY_LABEL: Record<Category, string> = {
  pricing: "Pricing",
  cost_base: "Cost Base",
  competition: "Competition",
  compliance: "Compliance",
  capital: "Capital",
};
const URGENCIES: readonly Urgency[] = ["act_this_week", "decide_this_month", "watch"];
const URGENCY_LABEL: Record<Urgency, string> = {
  act_this_week: "Act this week",
  decide_this_month: "Decide this month",
  watch: "Watch",
};

const ANALYSE_MSGS = [
  "Mapping consequences for your company...",
  "Cross-referencing your strategic priorities...",
  "Calculating urgency window...",
  "Building your action recommendation...",
];

function isCategory(v: unknown): v is Category {
  return CATEGORIES.includes(v as Category);
}
function signalCategory(s: RawSignal): Category {
  return isCategory(s.category) ? s.category : "capital";
}
function normalizeUrgency(u: Urgency | null | undefined): Urgency {
  return u && URGENCIES.includes(u) ? u : "watch";
}
function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return m + "m";
  const h = Math.floor(m / 60);
  if (h < 24) return h + "h";
  return Math.floor(h / 24) + "d";
}
function sourceLabel(s: RawSignal): string {
  if (!s.url) return s.source ?? "Source";
  try {
    return new URL(s.url).hostname.replace(/^www\./, "");
  } catch {
    return s.source ?? "Source";
  }
}

export default function SignalsPage() {
  const router = useRouter();

  const [signals, setSignals] = useState<RawSignal[]>([]);
  const [analysisMap, setAnalysisMap] = useState<Record<string, ConsequenceAnalysis>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const [openId, setOpenId] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<"All" | Category>("All");
  const [urgency, setUrgency] = useState<"All" | Urgency>("All");

  const [refreshing, setRefreshing] = useState(false);
  const [checkedAt, setCheckedAt] = useState("Not checked this session");
  const [notice, setNotice] = useState("");

  const fetchSignals = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const [sigRes, mapRes] = await Promise.all([
        fetch("/api/signals/raw"),
        fetch("/api/signals/analysis-map"),
      ]);
      if (!sigRes.ok) throw new Error("failed");
      const list = (await sigRes.json()) as RawSignal[];
      setSignals(Array.isArray(list) ? list : []);
      if (mapRes.ok) {
        const map = await mapRes.json();
        setAnalysisMap(map && typeof map === "object" ? map : {});
      }
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSignals();
  }, [fetchSignals]);

  const handleRefresh = async () => {
    setRefreshing(true);
    setCheckedAt("Checking sources...");
    setNotice("");
    try {
      const res = await fetch("/api/signals/refresh", { method: "POST" });
      const body = (await res.json().catch(() => ({}))) as {
        signalsAdded?: number;
        signalsLinked?: number;
        error?: string;
      };
      if (!res.ok) {
        // 429 is the hourly limit, not a failure — say so, and do not
        // dress it up as a broken pipeline.
        setCheckedAt(res.status === 429 ? "Checked recently" : "Check failed");
        setNotice(body.error ?? "Refresh failed.");
        return;
      }
      // "Added" is what the gate surfaced this run; "linked" is what already
      // existed and has now been attached to this account. A new account
      // usually sees the second number, and reporting only the first is what
      // made an ordinary first refresh look like a dead pipeline.
      const added = (body.signalsAdded ?? 0) + (body.signalsLinked ?? 0);
      setCheckedAt(added > 0 ? "Checked just now · " + added + " new" : "Checked just now · nothing new");
      await fetchSignals();
    } catch {
      setCheckedAt("Check failed");
      setNotice("Refresh failed. Check your connection.");
    } finally {
      setRefreshing(false);
    }
  };

  const filtered = useMemo(
    () =>
      signals.filter((s) => {
        if (category !== "All" && signalCategory(s) !== category) return false;
        if (urgency !== "All" && normalizeUrgency(s.urgency) !== urgency) return false;
        if (query.trim()) {
          const hay = (toPlainText(s.title) + " " + (s.why_it_matters ?? "") + " " + (s.what_happened ?? "")).toLowerCase();
          if (!hay.includes(query.toLowerCase().trim())) return false;
        }
        return true;
      }),
    [signals, category, urgency, query]
  );

  const open = signals.find((s) => s.id === openId) ?? null;
  const clearFilters = () => {
    setQuery("");
    setCategory("All");
    setUrgency("All");
  };
  const filtersActive = query !== "" || category !== "All" || urgency !== "All";

  const noticeBar = notice ? (
    <div role="status" className="vx-notice">
      {notice}
      <button aria-label="Dismiss notice" onClick={() => setNotice("")}>
        <X size={14} />
      </button>
    </div>
  ) : null;

  if (open) {
    return (
      <div className="vx-calm-page">
        {noticeBar}
        <SignalDocument
          key={open.id}
          signal={open}
          initialAnalysis={analysisMap[open.id]}
          onBack={() => setOpenId(null)}
          onNotice={setNotice}
          onAnalysed={fetchSignals}
          router={router}
        />
      </div>
    );
  }

  return (
    <div className="vx-calm-page">
      {noticeBar}

      <div className="vx-page-heading">
        <div>
          <h1>Signals</h1>
          <p>Changes that could affect your next decision.</p>
        </div>
        <div className="vx-signals-actions">
          <button className="vx-btn vx-primary" onClick={handleRefresh} disabled={refreshing}>
            <RefreshCw size={15} className={refreshing ? "vx-refreshing" : ""} />
            {refreshing ? "Refreshing..." : "Refresh signals"}
          </button>
          <button className="vx-btn" aria-expanded={filtersOpen} onClick={() => setFiltersOpen(!filtersOpen)}>
            <SlidersHorizontal size={15} />
            Filter
            {filtersActive && <span className="vx-dot vx-red" />}
          </button>
        </div>
      </div>

      <div className="vx-feed-status">
        <span role="status" aria-live="polite">{checkedAt}</span>
        <span>{signals.length} tracked · curated sources</span>
      </div>

      {filtersOpen && (
        <div className="vx-filterbar">
          <label className="vx-search">
            <Search size={16} />
            <input
              aria-label="Search signals"
              placeholder="Search signals..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <label className="vx-select">
            <select
              aria-label="Signal category"
              value={category}
              onChange={(e) => setCategory(e.target.value as "All" | Category)}
            >
              <option value="All">All</option>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>
              ))}
            </select>
          </label>
          <label className="vx-select">
            <select
              aria-label="Signal urgency"
              value={urgency}
              onChange={(e) => setUrgency(e.target.value as "All" | Urgency)}
            >
              <option value="All">All</option>
              {URGENCIES.map((u) => (
                <option key={u} value={u}>{URGENCY_LABEL[u]}</option>
              ))}
            </select>
          </label>
          <button className="vx-text-btn" onClick={clearFilters}>Clear filters</button>
        </div>
      )}

      <div className="vx-calm-inbox">
        {loading ? (
          <div className="vx-empty"><h2>Loading signals...</h2></div>
        ) : error ? (
          <div className="vx-empty">
            <h2>Couldn&apos;t load your signals</h2>
            <button className="vx-btn" onClick={fetchSignals}>Try again</button>
          </div>
        ) : filtered.length ? (
          filtered.map((s) => {
            const cat = signalCategory(s);
            const urg = normalizeUrgency(s.urgency);
            const analysed = Boolean(analysisMap[s.id]);
            return (
              <button
                key={s.id}
                className={"vx-calm-row vx-news-row" + (analysed ? " vx-row-analysed" : "")}
                onClick={() => { setOpenId(s.id); window.scrollTo({ top: 0 }); }}
              >
                <span className={"vx-dot " + (urg === "act_this_week" ? "vx-red" : "")} />
                <span>
                  <div className="vx-news-meta">
                    <span>{CATEGORY_LABEL[cat]}</span>
                    {analysed ? (
                      <span className="vx-analysed-badge">
                        <Check size={11} strokeWidth={3} />Analysed
                      </span>
                    ) : (
                      <span className={urg === "act_this_week" ? "vx-red" : ""}>
                        {URGENCY_LABEL[urg]}
                      </span>
                    )}
                  </div>
                  <h2>{s.why_it_matters ? s.why_it_matters : toPlainText(s.title)}</h2>
                  <p className="vx-news-summary">
                    {s.what_happened ? s.what_happened : toPlainText(s.content)}
                  </p>
                  <small className="vx-news-source">
                    {sourceLabel(s)} <span>· {timeAgo(s.created_at)} ago</span>
                  </small>
                </span>
                <ChevronRight size={16} />
              </button>
            );
          })
        ) : (
          <div className="vx-empty">
            <h2>{signals.length ? "No matching signals" : "No signals yet"}</h2>
            {signals.length ? (
              <button className="vx-btn" onClick={clearFilters}>Clear filters</button>
            ) : (
              <button className="vx-btn" onClick={handleRefresh} disabled={refreshing}>
                Refresh signals
              </button>
            )}
          </div>
        )}
      </div>

      {!loading && !error && filtered.length > 0 && (
        <p className="vx-quiet-note">
          {filtered.length} signal{filtered.length === 1 ? "" : "s"} · Select one to see why it matters.
        </p>
      )}
    </div>
  );
}

/* ── Reading view for one signal ─────────────────────────────────────────── */

function SignalDocument({
  signal,
  initialAnalysis,
  onBack,
  onNotice,
  onAnalysed,
  router,
}: {
  signal: RawSignal;
  initialAnalysis?: ConsequenceAnalysis;
  onBack: () => void;
  onNotice: (s: string) => void;
  onAnalysed: () => void;
  router: ReturnType<typeof useRouter>;
}) {
  const [analysis, setAnalysis] = useState<ConsequenceAnalysis | null>(initialAnalysis ?? null);
  const [analysing, setAnalysing] = useState(false);
  const [msgIdx, setMsgIdx] = useState(0);
  const [analysisError, setAnalysisError] = useState("");
  const [generating, setGenerating] = useState(false);
  const [strategyError, setStrategyError] = useState("");
  const [linked, setLinked] = useState<LinkedStrategy[]>([]);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reviewedRef = useRef(false);

  const cat = signalCategory(signal);
  const urg = normalizeUrgency(signal.urgency);

  // Mark reviewed on first open so it stops counting as a missed urgent signal.
  useEffect(() => {
    if (reviewedRef.current) return;
    reviewedRef.current = true;
    fetch("/api/signals/" + signal.id + "/review", { method: "POST" }).catch(() => {});
  }, [signal.id]);

  useEffect(() => {
    if (analysis) return;
    fetch("/api/signals/" + signal.id + "/consequence")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d && d.consequenceId) setAnalysis(d); })
      .catch(() => {});
  }, [signal.id, analysis]);

  useEffect(() => {
    fetch("/api/strategies?signalId=" + signal.id)
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setLinked(Array.isArray(d) ? d : []))
      .catch(() => {});
  }, [signal.id]);

  useEffect(() => () => { if (intervalRef.current) clearInterval(intervalRef.current); }, []);

  const handleAnalyse = async () => {
    setAnalysing(true);
    setAnalysisError("");
    setMsgIdx(0);
    intervalRef.current = setInterval(() => setMsgIdx((p) => (p + 1) % ANALYSE_MSGS.length), 3000);
    try {
      const res = await fetch("/api/signals/" + signal.id + "/analyse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signalId: signal.id }),
      });
      if (!res.ok) {
        const b = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(b.error ?? "Analysis failed");
      }
      setAnalysis((await res.json()) as ConsequenceAnalysis);
      onAnalysed();
    } catch (err) {
      setAnalysisError(err instanceof Error ? err.message : "Analysis failed. Try again.");
    } finally {
      if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
      setAnalysing(false);
    }
  };

  const handleRespond = async (status: "accepted" | "rejected") => {
    if (!analysis) return;
    try {
      await fetch("/api/signals/" + analysis.consequenceId + "/respond", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      setAnalysis((p) => (p ? { ...p, status } : p));
      onNotice(status === "accepted" ? "Signal accepted." : "Signal dismissed.");
      if (status === "rejected") onBack();
    } catch {
      onNotice("Couldn't save that. Try again.");
    }
  };

  const handleGenerateStrategy = async () => {
    if (!analysis) return;
    setGenerating(true);
    setStrategyError("");
    try {
      const res = await fetch("/api/strategies/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          signalId: signal.id,
          consequenceId: analysis.consequenceId,
          signalTitle: toPlainText(signal.title),
          soWhat: analysis.soWhat,
          actionRecommendation: analysis.immediateAction,
        }),
      });
      if (!res.ok) {
        const b = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(b.error ?? "Strategy generation failed");
      }
      const data = (await res.json()) as { strategy?: { id: string } };
      if (data.strategy?.id) router.push("/strategies/" + data.strategy.id);
    } catch (err) {
      setStrategyError(err instanceof Error ? err.message : "Couldn't create a strategy.");
    } finally {
      setGenerating(false);
    }
  };

  const askAdvisor = () => {
    const msg =
      "I'm looking at a signal: '" + toPlainText(signal.title) + "'. Why it matters: " +
      (signal.why_it_matters ?? "") + " What am I missing, and what would you prioritise?";
    router.push("/advisor?q=" + encodeURIComponent(msg));
  };

  return (
    <>
      <button className="vx-back" onClick={onBack}>← All signals</button>

      <article className="vx-calm-document">
        <div className="vx-reading-meta">
          {analysis ? (
            <span className="vx-analysed-badge">
              <Check size={11} strokeWidth={3} />
              {analysis.status === "accepted" ? "Accepted" : "Analysed"}
            </span>
          ) : (
            <span className={"vx-tag " + (urg === "act_this_week" ? "vx-tag-red" : "")}>
              {URGENCY_LABEL[urg]}
            </span>
          )}
          <span>{CATEGORY_LABEL[cat]}</span>
        </div>

        <h1>{toPlainText(signal.title)}</h1>

        {signal.what_happened && <p className="vx-calm-intro">{signal.what_happened}</p>}

        <div className="vx-article-source">
          <Link2 size={14} />
          {signal.url ? (
            <a href={signal.url} target="_blank" rel="noopener noreferrer">{sourceLabel(signal)}</a>
          ) : (
            sourceLabel(signal)
          )}
          <span>· {timeAgo(signal.created_at)} ago</span>
        </div>

        {signal.why_it_matters && (
          <>
            <h2>Why it matters</h2>
            <p>{signal.why_it_matters}</p>
          </>
        )}

        {signal.what_to_consider && (
          <div className="vx-calm-next">
            <h2>Suggested next step</h2>
            <p>{signal.what_to_consider}</p>
            {analysis ? (
              <button className="vx-btn vx-primary" onClick={handleGenerateStrategy} disabled={generating}>
                {generating ? <Loader2 size={15} className="vx-refreshing" /> : <ArrowRight size={15} />}
                {generating ? "Creating..." : "Explore strategy"}
              </button>
            ) : (
              <button className="vx-btn vx-primary" onClick={handleAnalyse} disabled={analysing}>
                {analysing ? <Loader2 size={15} className="vx-refreshing" /> : <ArrowRight size={15} />}
                {analysing ? "Analysing..." : "Analyse impact for my company"}
              </button>
            )}
            {analysing && <p className="vx-quiet-note">{ANALYSE_MSGS[msgIdx]}</p>}
            {analysisError && <p className="vx-quiet-note vx-red">{analysisError}</p>}
            {strategyError && <p className="vx-quiet-note vx-red">{strategyError}</p>}
          </div>
        )}

        {/* Company-specific analysis. Rendered only once Analyse has actually
            run — confidence and the "if you don't" line are real consequence
            fields, not values invented for every card. */}
        {analysis && (
          <details className="vx-disclosure" open>
            <summary>Company-specific analysis<Plus size={15} /></summary>
            <div className="vx-analysis">
              {/* Four labelled blocks rather than four headed paragraphs:
                  the lead reading, the act/don't-act pair side by side, and
                  the one thing to do, set apart in a callout. */}
              <div className="vx-analysis-lead">
                <span className="vx-section-label">SO WHAT</span>
                <p>{analysis.soWhat}</p>
              </div>

              <div className="vx-outcome-grid">
                <div>
                  <span className="vx-section-label">IF YOU ACT</span>
                  <p>{analysis.ifYouAct}</p>
                </div>
                <div>
                  <span className="vx-section-label">IF YOU DON&apos;T</span>
                  <p>{analysis.ifYouDont}</p>
                </div>
              </div>

              <div className="vx-callout vx-analysis-action">
                <span className="vx-section-label">IMMEDIATE ACTION</span>
                <p>{analysis.immediateAction}</p>
              </div>

              {typeof analysis.confidence_score === "number" && (
                <p className="vx-footnote">Analysis confidence: {analysis.confidence_score}/100</p>
              )}
            </div>
          </details>
        )}

        {linked.length > 0 && (
          <div className="vx-calm-next">
            <h2>Linked strategies</h2>
            {linked.map((s) => (
              <button key={s.id} className="vx-linked-source" onClick={() => router.push("/strategies/" + s.id)}>
                <span className="vx-dot" />
                {s.status}
                <ArrowUpRight size={14} />
                <strong>{s.title}</strong>
              </button>
            ))}
          </div>
        )}

        <footer className="vx-actions">
          <button className="vx-text-btn" onClick={askAdvisor}>
            Ask Advisor<ArrowUpRight size={14} />
          </button>
          {analysis && analysis.status !== "accepted" && (
            <button className="vx-text-btn" onClick={() => handleRespond("accepted")}>Accept signal</button>
          )}
          {analysis && (
            <button className="vx-text-btn" onClick={() => handleRespond("rejected")}>Dismiss</button>
          )}
        </footer>
      </article>
    </>
  );
}

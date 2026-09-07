"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  RefreshCw,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  BarChart2,
  Loader2,
  ExternalLink,
  CheckCircle,
  MessageSquare,
} from "lucide-react";
import { toPlainText } from "@/lib/text";

// ─── Types ────────────────────────────────────────────────────────────────────

type Urgency = "act_this_week" | "decide_this_month" | "watch";

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

type StrategyStatus = "considering" | "deciding" | "decided" | "archived";

interface LinkedStrategy {
  id: string;
  title: string;
  status: StrategyStatus;
}

const STRATEGY_STATUS_STYLE: Record<StrategyStatus, string> = {
  considering: "surf-2 text-muted-foreground hairline",
  deciding: "surf-3 text-foreground hairline-strong",
  decided: "badge-completed",
  archived: "surf-1 text-muted-foreground hairline",
};

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded surf-2 ${className ?? ""}`} />;
}

// ─── Category helpers ─────────────────────────────────────────────────────────

// The five gate categories. Set server-side by the relevance gate — the UI
// no longer guesses from keywords.
type Category = "pricing" | "cost_base" | "competition" | "compliance" | "capital";

const CATEGORIES: readonly Category[] = [
  "pricing",
  "cost_base",
  "competition",
  "compliance",
  "capital",
] as const;

const CATEGORY_LABEL: Record<Category, string> = {
  pricing: "Pricing",
  cost_base: "Cost Base",
  competition: "Competition",
  compliance: "Compliance",
  capital: "Capital",
};

// Reuses the four existing cat-badge-* tokens — no new colors. Cost Base and
// Capital share the macro token, which is the closest existing fit.
function categoryBadgeClass(cat: Category): string {
  switch (cat) {
    case "pricing": return "cat-badge-market";
    case "compliance": return "cat-badge-regulatory";
    case "cost_base": return "cat-badge-macro";
    case "capital": return "cat-badge-macro";
    case "competition": return "cat-badge-competitors";
  }
}

// ─── Urgency helpers ──────────────────────────────────────────────────────────

const URGENCY_TIERS = ["act_this_week", "decide_this_month", "watch"] as const;
const URGENCY_ORDER: Record<Urgency, number> = {
  act_this_week: 0,
  decide_this_month: 1,
  watch: 2,
};
const URGENCY_LABEL: Record<Urgency, string> = {
  act_this_week: "Act this week",
  decide_this_month: "Decide this month",
  watch: "Watch",
};
// Red = act now, amber = decide soon, neutral = watch. Uses the shared
// urgency ladder tokens so all surfaces stay consistent.
const URGENCY_DOT: Record<Urgency, string> = {
  act_this_week: "urgency-dot-act",
  decide_this_month: "urgency-dot-decide",
  watch: "urgency-dot-watch",
};

function normalizeUrgency(u: Urgency | null | undefined): Urgency {
  return u && URGENCY_TIERS.includes(u) ? u : "watch";
}

function isCategory(value: unknown): value is Category {
  return CATEGORIES.includes(value as Category);
}

// Pre-gate rows have no category. They are filtered out upstream, but default
// to "capital" rather than crashing if one slips through.
function signalCategory(s: RawSignal): Category {
  return isCategory(s.category) ? s.category : "capital";
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ─── Signal Card ──────────────────────────────────────────────────────────────

const ANALYSE_MSGS = [
  "Mapping consequences for your company...",
  "Cross-referencing your strategic priorities...",
  "Calculating urgency window...",
  "Building your action recommendation...",
];

function SignalCard({ signal, initialAnalysis, onAnalysisComplete, onExpanded }: {
  signal: RawSignal;
  initialAnalysis?: ConsequenceAnalysis | null;
  onAnalysisComplete?: () => void;
  onExpanded?: (expanded: boolean) => void;
}) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [analysing, setAnalysing] = useState(false);
  const [analyseMsgIdx, setAnalyseMsgIdx] = useState(0);
  const analyseIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [generating, setGenerating] = useState(false);
  const [analysis, setAnalysis] = useState<ConsequenceAnalysis | null>(initialAnalysis ?? null);
  const [analysisError, setAnalysisError] = useState("");
  const [strategyError, setStrategyError] = useState("");
  const [linkedStrategies, setLinkedStrategies] = useState<LinkedStrategy[]>([]);

  const category = signalCategory(signal);
  const urgency = normalizeUrgency(signal.urgency);

  const loadExistingAnalysis = useCallback(async () => {
    try {
      const res = await fetch(`/api/signals/${signal.id}/consequence`);
      if (res.ok) {
        const data = await res.json();
        if (data && data.consequenceId) setAnalysis(data);
      }
    } catch {}
  }, [signal.id]);

  const loadLinkedStrategies = useCallback(async () => {
    try {
      const res = await fetch(`/api/strategies?signalId=${signal.id}`);
      if (res.ok) {
        const data = (await res.json()) as LinkedStrategy[];
        setLinkedStrategies(Array.isArray(data) ? data : []);
      }
    } catch {}
  }, [signal.id]);

  useEffect(() => {
    if (expanded && !analysis) loadExistingAnalysis();
  }, [expanded, analysis, loadExistingAnalysis]);

  // Mark the signal reviewed the first time its detail view is opened, so it
  // stops counting as a "missed" urgent signal for the nudge email.
  const reviewedRef = useRef(false);
  useEffect(() => {
    if (!expanded || reviewedRef.current) return;
    reviewedRef.current = true;
    fetch(`/api/signals/${signal.id}/review`, { method: "POST" }).catch(() => {});
  }, [expanded, signal.id]);

  useEffect(() => {
    if (expanded) loadLinkedStrategies();
  }, [expanded, loadLinkedStrategies]);

  const handleAnalyse = async () => {
    setAnalysing(true);
    setAnalysisError("");
    setAnalyseMsgIdx(0);
    analyseIntervalRef.current = setInterval(() => {
      setAnalyseMsgIdx((prev) => (prev + 1) % ANALYSE_MSGS.length);
    }, 3000);
    try {
      const res = await fetch(`/api/signals/${signal.id}/analyse`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signalId: signal.id }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? "Analysis failed");
      }
      const data = await res.json() as ConsequenceAnalysis;
      setAnalysis(data);
      if (onAnalysisComplete) onAnalysisComplete();
    } catch (err) {
      setAnalysisError(err instanceof Error ? err.message : "Analysis failed. Try again.");
    } finally {
      if (analyseIntervalRef.current) {
        clearInterval(analyseIntervalRef.current);
        analyseIntervalRef.current = null;
      }
      setAnalysing(false);
    }
  };

  const handleAcceptDismiss = async (action: "accepted" | "rejected") => {
    if (!analysis) return;
    try {
      await fetch(`/api/signals/${analysis.consequenceId}/respond`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: action }),
      });
      setAnalysis((prev) => prev ? { ...prev, status: action } : prev);
    } catch {}
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
        const body = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? "Strategy generation failed");
      }
      const data = await res.json() as { success: boolean; strategy?: { id: string; title: string } };
      if (data.strategy?.id) {
        router.push(`/strategies/${data.strategy.id}`);
      } else {
        await loadLinkedStrategies();
        setGenerating(false);
      }
    } catch (err) {
      setStrategyError(err instanceof Error ? err.message : "Failed to generate strategy");
      setGenerating(false);
    }
  };

  return (
    <div
      className={`cx-signal ${expanded ? "cx-selected" : ""} ${analysis ? "signal-analysed" : ""}`}
    >
      <div className="relative z-10">
        {/* Collapsed header — concept `.signal`'s own meta/h3/p/footer
            structure, with the app's real per-category badge system
            (cat-badge-*, already tokenized per-category) kept in place of
            the concept's single ad-hoc blue `.type` example, and the real
            urgency dot (act/decide/watch) kept in place of the concept's
            category-coloured dot — both carry actual meaning here that the
            concept's static demo data didn't need to. */}
        <div
          className="cursor-pointer p-5 transition-colors"
          onClick={() => {
            const next = !expanded;
            setExpanded(next);
            onExpanded?.(next);
          }}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="cx-signal-meta mb-2.5">
                <span
                  className={`inline-flex h-[7px] w-[7px] flex-shrink-0 rounded-full ${URGENCY_DOT[urgency]}`}
                  title={URGENCY_LABEL[urgency]}
                  aria-label={`Urgency: ${URGENCY_LABEL[urgency]}`}
                />
                <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${categoryBadgeClass(category)}`}>
                  {CATEGORY_LABEL[category]}
                </span>
                <span>{timeAgo(signal.created_at)}</span>
                {analysis && (
                  <span
                    className="brand-accent-border brand-accent-bg-soft brand-accent-text rounded-full border px-2 py-0.5 text-[9px] font-bold"
                    style={{ marginLeft: 'auto' }}
                  >
                    {analysis.status === "accepted" ? "Accepted" : analysis.status === "rejected" ? "Dismissed" : "Analysed"}
                  </span>
                )}
              </div>

              <h3>{toPlainText(signal.title)}</h3>

              <p className="line-clamp-2">{toPlainText(signal.content)}</p>

              <footer className="flex-wrap">
                {signal.url ? (
                  <a
                    href={signal.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="cx-signal-source inline-flex items-center gap-1.5 transition-colors hover:text-foreground"
                  >
                    <ExternalLink size={9} />
                    {(() => {
                      try { return new URL(signal.url).hostname.replace(/^www\./, ""); }
                      catch { return "source"; }
                    })()}
                  </a>
                ) : (
                  <span className="cx-signal-source">No source — discard</span>
                )}
                {signal.published_at && (
                  <span>
                    {new Date(signal.published_at).toLocaleDateString("en-US", {
                      month: "short", day: "numeric", year: "numeric"
                    })}
                  </span>
                )}
              </footer>
            </div>

            <div className="mt-1 flex-shrink-0 text-muted-foreground">
              {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </div>
          </div>
        </div>

        {/* Expanded section */}
        {expanded && (
          <div className="border-t hairline surf-1">
            {/* Full content */}
            <div className="px-5 pt-4 pb-4">
              <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-muted-foreground mb-2">
                Full Signal
              </p>
              <p className="text-[13px] text-muted-foreground leading-relaxed">{toPlainText(signal.content)}</p>
            </div>

            {/* Analysis section */}
            {!analysis ? (
              <div className="px-5 pb-5">
                {analysisError && (
                  <p className="hairline surf-2 text-xs text-foreground mb-3 border rounded-xl px-3 py-2">
                    {analysisError}
                  </p>
                )}
                <button
                  onClick={handleAnalyse}
                  disabled={analysing}
                  className="btn-primary w-full flex items-center justify-center gap-2 py-3 rounded-xl text-[11px] font-bold uppercase tracking-wider transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {analysing ? (
                    <>
                      <Loader2 size={13} className="animate-spin" />
                      Analysing with AI...
                    </>
                  ) : (
                    <>
                      <AlertTriangle size={13} />
                      Analyse Impact for My Company
                    </>
                  )}
                </button>
                <p className={`text-center mt-2 transition-colors text-muted-foreground ${analysing ? "text-[11px]" : "text-[10px]"}`}>
                  {analysing ? ANALYSE_MSGS[analyseMsgIdx] : "VANTAGE will map consequences specific to your company and market position"}
                </p>
              </div>
            ) : (
              <div className="border-t hairline">
                {/* SO WHAT */}
                <div className="px-5 pt-4 pb-3">
                  <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-muted-foreground mb-1.5">
                    So What? — For Your Company
                  </p>
                  <p className="text-[13px] text-foreground/80 leading-relaxed">{analysis.soWhat}</p>
                </div>

                {/* Confidence indicator */}
                {analysis.confidence_score != null && (
                  <div className="px-5 pb-3 flex items-center gap-2">
                    <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
                      Confidence
                    </span>
                    <span className={`hairline rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                      analysis.confidence_score >= 70 ? "surf-3 text-foreground" :
                      analysis.confidence_score >= 40 ? "surf-2 text-muted-foreground" :
                      "surf-1 text-muted-foreground"
                    }`}>
                      {analysis.confidence_score >= 70 ? "High" :
                       analysis.confidence_score >= 40 ? "Medium" : "Low"} · {analysis.confidence_score}/100
                    </span>
                    {analysis.confidence_score < 40 && (
                      <span className="text-[10px] text-muted-foreground italic">
                        Indirect link — treat as monitor-only
                      </span>
                    )}
                  </div>
                )}

                {/* IF YOU ACT / IF YOU DON'T */}
                <div className="px-5 pb-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="hairline surf-2 rounded-xl border p-3">
                    <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-muted-foreground mb-1.5">
                      If You Act
                    </p>
                    <p className="text-[12px] text-muted-foreground leading-relaxed">{analysis.ifYouAct}</p>
                  </div>
                  <div className="hairline-strong surf-3 rounded-xl border p-3">
                    <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-foreground mb-1.5">
                      If You Don&apos;t
                    </p>
                    <p className="text-[12px] text-muted-foreground leading-relaxed">{analysis.ifYouDont}</p>
                  </div>
                </div>

                {/* IMMEDIATE ACTION */}
                <div className="px-5 pb-4">
                  <div className="hairline-strong surf-3 rounded-xl border p-3">
                    <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-foreground mb-1.5">
                      Immediate Action
                    </p>
                    <p className="text-[12px] text-foreground/80 leading-relaxed">{analysis.immediateAction}</p>
                  </div>
                </div>

                {/* Accept / Dismiss */}
                {analysis.status === "pending" && (
                  <div className="px-5 pb-4 flex items-center gap-2">
                    <button
                      onClick={() => handleAcceptDismiss("accepted")}
                      className="hairline-strong surf-3 inset-sheen surf-hover flex items-center gap-1.5 px-4 py-1.5 rounded-xl border text-[11px] font-bold text-foreground hover:text-foreground transition-colors uppercase tracking-wider"
                    >
                      <CheckCircle size={11} />
                      Accept
                    </button>
                    <button
                      onClick={() => handleAcceptDismiss("rejected")}
                      className="hairline surf-hover flex items-center gap-1.5 px-4 py-1.5 rounded-xl border text-[11px] font-bold text-muted-foreground hover:text-foreground transition-colors uppercase tracking-wider"
                    >
                      Dismiss
                    </button>
                  </div>
                )}

                {/* Strategy error */}
                {strategyError && (
                  <div className="hairline surf-2 mx-5 mb-3 px-4 py-2.5 rounded-xl border text-[11px] font-bold text-foreground">
                    {strategyError}
                  </div>
                )}

                {/* Discuss with Advisor */}
                <div className="px-5 pb-3">
                  <button
                    onClick={() => {
                      const msg = `I'm looking at a signal: '${toPlainText(signal.title)}'. Here's what VANTAGE mapped for my company: ${analysis.soWhat}. The immediate action recommended is: ${analysis.immediateAction}. I want to think through whether to act on this — what's your take? What am I missing, and what would you prioritise?`;
                      sessionStorage.setItem("advisor_prefill", JSON.stringify({ message: msg, source: "signal" }));
                      router.push("/advisor");
                    }}
                    className="hairline surf-hover w-full flex items-center justify-center gap-2 py-3 rounded-xl border text-[11px] font-bold text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors"
                  >
                    <MessageSquare size={13} />
                    Discuss with Advisor →
                  </button>
                </div>

                {/* Linked strategies */}
                {linkedStrategies.length > 0 && (
                  <div className="px-5 pb-3">
                    <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-muted-foreground mb-2">
                      Linked Strategies
                    </p>
                    <div className="flex flex-col gap-1.5">
                      {linkedStrategies.map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => router.push(`/strategies/${s.id}`)}
                          className="hairline surf-1 surf-hover flex items-center gap-2.5 rounded-xl border px-3 py-2 text-left transition-colors"
                        >
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider border flex-shrink-0 ${STRATEGY_STATUS_STYLE[s.status]}`}
                          >
                            {s.status}
                          </span>
                          <span className="text-[12px] text-foreground leading-snug truncate flex-1">
                            {toPlainText(s.title)}
                          </span>
                          <span className="text-muted-foreground flex-shrink-0">→</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Generate strategy from this signal */}
                <div className="px-5 pb-5">
                  <button
                    onClick={handleGenerateStrategy}
                    disabled={generating}
                    className="hairline-strong surf-3 inset-sheen surf-hover w-full flex items-center justify-center gap-2 py-3 rounded-xl border text-[11px] font-bold text-foreground uppercase tracking-wider transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed"
                    type="button"
                  >
                    {generating ? (
                      <>
                        <Loader2 size={13} className="animate-spin" />
                        Generating Strategy...
                      </>
                    ) : (
                      "↗ Generate Strategy from This Signal →"
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SignalsPage() {
  const [signals, setSignals] = useState<RawSignal[]>([]);
  const [analysisMap, setAnalysisMap] = useState<Record<string, ConsequenceAnalysis>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshMsg, setRefreshMsg] = useState("");
  const [activeFilter, setActiveFilter] = useState<"all" | Category>("all");
  const [urgencyFilter, setUrgencyFilter] = useState<"all" | Urgency>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedSignalId, setExpandedSignalId] = useState<string | null>(null);

  const fetchSignals = useCallback(async () => {
    setLoading(true);
    setError(false);
    setSessionExpired(false);
    try {
      const [signalsRes, mapRes] = await Promise.all([
        fetch("/api/signals/raw"),
        fetch("/api/signals/analysis-map"),
      ]);
      if (signalsRes.status === 401) { setSessionExpired(true); return; }
      if (!signalsRes.ok) throw new Error("failed");
      const data = await signalsRes.json() as RawSignal[];
      setSignals(data ?? []);

      if (mapRes.ok) {
        const map = await mapRes.json() as Record<string, ConsequenceAnalysis>;
        setAnalysisMap(map);
      }
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchSignals(); }, [fetchSignals]);

  const handleRefresh = async () => {
    setRefreshing(true);
    setRefreshMsg("");
    try {
      const res = await fetch("/api/signals/refresh", { method: "POST" });
      const body = await res.json().catch(() => ({})) as { signalsAdded?: number; error?: string };
      if (!res.ok) {
        setRefreshMsg(body.error ?? "Refresh failed");
      } else {
        const added = body.signalsAdded ?? 0;
        setRefreshMsg(added > 0 ? `${added} new signals fetched` : "No new signals found");
        await fetchSignals();
      }
    } catch {
      setRefreshMsg("Refresh failed. Check your connection.");
    } finally {
      setRefreshing(false);
    }
  };

  // Filter by category + urgency + search, then sort by urgency tier
  // (act-this-week first), and recency within each tier.
  const filteredSignals = signals
    .filter((s) => {
      const category = signalCategory(s);
      if (activeFilter !== "all" && category !== activeFilter) return false;
      if (urgencyFilter !== "all" && normalizeUrgency(s.urgency) !== urgencyFilter)
        return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const hay = `${toPlainText(s.title)} ${toPlainText(s.content)}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    })
    .sort((a, b) => {
      const ua = URGENCY_ORDER[normalizeUrgency(a.urgency)];
      const ub = URGENCY_ORDER[normalizeUrgency(b.urgency)];
      if (ua !== ub) return ua - ub;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

  // Counts per category for the tab labels
  const counts: Record<"all" | Category, number> = {
    all: signals.length,
    pricing: 0,
    cost_base: 0,
    competition: 0,
    compliance: 0,
    capital: 0,
  };
  for (const s of signals) {
    counts[signalCategory(s)]++;
  }

  // Counts per urgency tier for the chip labels
  const urgencyCounts: Record<"all" | Urgency, number> = {
    all: signals.length,
    act_this_week: 0,
    decide_this_month: 0,
    watch: 0,
  };
  for (const s of signals) {
    urgencyCounts[normalizeUrgency(s.urgency)]++;
  }

  return (
    <div className="px-8 py-10 text-foreground">
      <div className="mx-auto max-w-[1400px]">
        {/* ── Headline — concept `.headline`: hard three-line h1, live-chip
            showing a real count instead of the concept's static "48". ── */}
        <header className="cx-headline flex flex-wrap items-end justify-between gap-4" style={{ margin: '11px 0 27px' }}>
          <div>
            <p className="cx-eyebrow">Signal Intelligence</p>
            <h1>What changed<br />outside your<br />business.</h1>
            <p className="cx-headline-sub">
              Filter the noise. Keep the movement that changes your next decision.
            </p>
          </div>
          <div className="flex flex-shrink-0 items-center gap-3">
            {refreshMsg && (
              <p className="text-xs text-muted-foreground">{refreshMsg}</p>
            )}
            <span className="cx-live-chip">
              <b>•</b> {signals.length} SIGNALS TRACKED
            </span>
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              aria-label="Refresh signals"
              title="Refresh signals"
              className="hairline surf-2 surf-hover flex h-9 w-9 items-center justify-center rounded-xl border text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
            >
              <RefreshCw size={14} className={refreshing ? "animate-spin brand-accent-text" : ""} />
            </button>
          </div>
        </header>

        {/* ── Toolbar — concept `.signal-toolbar`: filters left, search
            right. Urgency is a real second filter dimension the concept
            doesn't have (its filters are category-only); kept as a second
            row using the same `.cx-filter` treatment rather than dropped. ── */}
        {!loading && !error && !sessionExpired && signals.length > 0 && (
          <div className="mb-6 flex flex-col gap-3">
            <div className="flex flex-col items-stretch justify-between gap-[18px] min-[561px]:flex-row min-[561px]:items-center">
              <div className="scroll-x-pane flex flex-nowrap gap-2">
                {(["all", ...CATEGORIES] as const).map((filter) => {
                  const label = filter === "all" ? "All" : CATEGORY_LABEL[filter];
                  const count = counts[filter];
                  const isActive = activeFilter === filter;
                  return (
                    <button
                      key={filter}
                      onClick={() => setActiveFilter(filter)}
                      className={`cx-filter flex-shrink-0 whitespace-nowrap ${isActive ? "cx-active" : ""}`}
                      type="button"
                    >
                      {label} · {count}
                    </button>
                  );
                })}
              </div>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search signals…"
                className="cx-search w-full min-[561px]:w-[245px]"
              />
            </div>

            {/* Urgency chips — same `.cx-filter` shape, a second row so they
                read as a distinct filter dimension from category. */}
            <div className="scroll-x-pane flex flex-nowrap gap-2">
              {(["all", "act_this_week", "decide_this_month", "watch"] as const).map((tier) => {
                const label = tier === "all" ? "All" : URGENCY_LABEL[tier];
                const count = urgencyCounts[tier];
                const isActive = urgencyFilter === tier;
                return (
                  <button
                    key={tier}
                    onClick={() => setUrgencyFilter(tier)}
                    className={`cx-filter flex-shrink-0 inline-flex items-center gap-1.5 ${isActive ? "cx-active" : ""}`}
                    type="button"
                  >
                    {tier !== "all" && (
                      <span className={`inline-flex h-[6px] w-[6px] rounded-full ${URGENCY_DOT[tier]}`} />
                    )}
                    {label} · {count}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {sessionExpired ? (
          <div className="glass rounded-2xl p-8 text-center">
            <div className="relative z-10">
              <p className="text-sm font-semibold text-foreground mb-1">Session expired</p>
              <p className="text-[13px] text-muted-foreground mb-4">
                Your session expired. Please sign out and sign back in.
              </p>
              <a
                href="/login"
                className="hairline-strong surf-3 inset-sheen surf-hover inline-block px-5 py-2 rounded-xl border text-[11px] font-bold text-foreground uppercase tracking-wider transition-colors"
              >
                Sign In
              </a>
            </div>
          </div>
        ) : loading ? (
          <div className="flex flex-col gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="glass rounded-2xl p-5 animate-pulse">
                <div className="flex items-center gap-3 mb-3">
                  <Skeleton className="h-5 w-24 rounded-full" />
                  <Skeleton className="h-4 w-16" />
                </div>
                <Skeleton className="h-5 w-3/4 mb-2" />
                <Skeleton className="h-4 w-full mb-1" />
                <Skeleton className="h-4 w-4/5" />
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="glass rounded-2xl p-8 text-center">
            <div className="relative z-10">
              <p className="text-sm text-muted-foreground mb-3">Unable to load signals</p>
              <button onClick={fetchSignals} className="text-[11px] font-bold uppercase tracking-wider text-foreground hover:underline">
                Retry
              </button>
            </div>
          </div>
        ) : signals.length === 0 ? (
          <div className="glass rounded-2xl p-12 text-center">
            <div className="relative z-10">
              <div className="flex justify-center mb-4">
                <div className="surf-2 w-12 h-12 rounded-full flex items-center justify-center">
                  <BarChart2 size={20} className="text-muted-foreground" />
                </div>
              </div>
              <p className="text-sm font-semibold text-foreground mb-1">No signals yet</p>
              <p className="text-[12px] text-muted-foreground mb-5">
                Click Refresh Signals to fetch the latest business intelligence.
              </p>
              <button
                onClick={handleRefresh}
                disabled={refreshing}
                className="hairline surf-hover inline-flex items-center gap-2 px-5 py-2 rounded-xl border text-[11px] font-bold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
              >
                <RefreshCw
                size={11}
                className={refreshing ? "animate-spin brand-accent-text" : ""}
              />
                Refresh Signals
              </button>
            </div>
          </div>
        ) : filteredSignals.length === 0 ? (
          <div className="glass rounded-2xl p-8 text-center">
            <div className="relative z-10">
              <p className="text-sm text-muted-foreground mb-1">No signals match your filter</p>
              <p className="text-[12px] text-muted-foreground mb-3">Try a different category or clear your search.</p>
              <button
                onClick={() => { setActiveFilter("all"); setUrgencyFilter("all"); setSearchQuery(""); }}
                className="text-[11px] font-bold uppercase tracking-wider text-foreground hover:underline"
              >
                Clear filters
              </button>
            </div>
          </div>
        ) : (
          /* Single stacked column — no grid, so an expanded card simply grows
             in place instead of needing a col-span override to avoid reflow. */
          <div className="flex flex-col gap-4">
            {filteredSignals.map((signal) => (
              <div key={signal.id}>
                <SignalCard
                  signal={signal}
                  initialAnalysis={analysisMap[signal.id] ?? null}
                  onAnalysisComplete={fetchSignals}
                  onExpanded={(exp) => setExpandedSignalId(exp ? signal.id : null)}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Plus,
  Search,
  Zap,
  LayoutGrid,
  PenLine,
  Calendar,
  AlertTriangle,
  ScanSearch,
  Check,
  Archive,
  Loader2,
  HelpCircle,
  GitBranch,
  ArrowLeft,
} from "lucide-react";
import type {
  Decision,
  DecisionSource,
  DecisionConfidence,
  BlindSpot,
  BlindSpotCategory,
} from "@/types/database";
import DecisionForm from "@/components/decisions/DecisionForm";

// ─── Constants ──────────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<BlindSpotCategory, string> = {
  financial: "Financial",
  regulatory: "Regulatory",
  competitive: "Competitive",
  operational: "Operational",
  reputational: "Reputational",
  market_timing: "Market Timing",
  team_capacity: "Team Capacity",
  customer_perception: "Customer Perception",
};

const CONFIDENCE_LABELS: Record<DecisionConfidence, string> = {
  confident: "Pretty sure — sanity check",
  torn: "Genuinely torn",
  exploring: "Just exploring",
};

const SEVERITY_STYLES: Record<BlindSpot["severity"], string> = {
  high: "urgency-act",
  medium: "urgency-decide",
  low: "hairline text-muted-foreground",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function daysUntil(deadline: string | null): number | null {
  if (!deadline) return null;
  return (new Date(deadline).getTime() - Date.now()) / 86400000;
}

function deadlineClass(days: number | null): string {
  if (days === null) return "text-muted-foreground";
  if (days < 3) return "text-[var(--urgency-act)]";
  if (days < 14) return "text-[var(--urgency-decide)]";
  return "text-muted-foreground";
}

function formatDeadline(deadline: string): string {
  return new Date(deadline).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function toDateInput(deadline: string | null): string {
  if (!deadline) return "";
  return new Date(deadline).toISOString().slice(0, 10);
}

function SourceBadge({ source }: { source: DecisionSource | null }) {
  const config: Record<DecisionSource, { label: string; icon: React.ElementType }> = {
    signal: { label: "Signal", icon: Zap },
    strategy: { label: "Strategy", icon: LayoutGrid },
    manual: { label: "Manual", icon: PenLine },
  };
  const c = config[source ?? "manual"];
  const Icon = c.icon;
  return (
    <span className="hairline surf-2 inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
      <Icon size={9} />
      {c.label}
    </span>
  );
}

function SourceLink({ decision }: { decision: Decision }) {
  if (decision.source === "signal" && decision.source_id) {
    return (
      <Link
        href={`/signals?focus=${decision.source_id}`}
        className="inline-flex items-center gap-1.5 hover:text-foreground transition-colors"
      >
        <Zap size={12} />
        From a signal
      </Link>
    );
  }
  if (decision.source === "strategy" && decision.source_id) {
    return (
      <Link
        href={`/strategies/${decision.source_id}`}
        className="inline-flex items-center gap-1.5 hover:text-foreground transition-colors"
      >
        <LayoutGrid size={12} />
        From a strategy
      </Link>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5">
      <PenLine size={12} />
      Entered manually
    </span>
  );
}

function BlindSpotCard({ spot }: { spot: BlindSpot }) {
  return (
    <div className={`rounded-xl border surf-1 px-4 py-3 ${SEVERITY_STYLES[spot.severity]}`}>
      <div className="flex items-center justify-between gap-3 mb-1.5">
        <span className="text-[10px] font-bold uppercase tracking-[0.18em]">
          {CATEGORY_LABELS[spot.category] ?? spot.category}
        </span>
        <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border">
          {spot.severity}
        </span>
      </div>
      <p className="text-[13px] text-muted-foreground leading-relaxed">{spot.description}</p>
    </div>
  );
}

// ─── List row ───────────────────────────────────────────────────────────────

function DecisionListRow({
  decision,
  active,
  onSelect,
}: {
  decision: Decision;
  active: boolean;
  onSelect: () => void;
}) {
  const days = daysUntil(decision.deadline);
  const count = decision.blind_spots?.length ?? 0;
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full text-left px-4 py-3.5 border-b hairline transition-colors ${
        active ? "surf-3" : "surf-hover"
      }`}
    >
      <p className="text-[13px] font-semibold text-foreground leading-snug truncate mb-1.5">
        {decision.title}
      </p>
      <div className="flex items-center gap-2 flex-wrap">
        <SourceBadge source={decision.source} />
        {decision.status === "open" ? (
          decision.deadline ? (
            <span className={`inline-flex items-center gap-1 text-[10px] font-medium ${deadlineClass(days)}`}>
              <Calendar size={10} />
              {formatDeadline(decision.deadline)}
              {days !== null && days < 0 && " · overdue"}
            </span>
          ) : (
            <span className="text-[10px] text-muted-foreground">No deadline</span>
          )
        ) : (
          <span
            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider border ${
              decision.status === "decided"
                ? "badge-completed"
                : "surf-1 text-muted-foreground hairline"
            }`}
          >
            {decision.status}
          </span>
        )}
        {count > 0 && (
          <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
            <AlertTriangle size={10} />
            {count}
          </span>
        )}
      </div>
    </button>
  );
}

// ─── Workspace ──────────────────────────────────────────────────────────────

type Tab = "open" | "closed";

export default function DecisionsWorkspace({ initialSelectedId }: { initialSelectedId?: string }) {
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [tab, setTab] = useState<Tab>("open");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(initialSelectedId ?? null);
  const [showModal, setShowModal] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState(false);
  const [notAnalyzable, setNotAnalyzable] = useState<string | null>(null);
  const [savingDeadline, setSavingDeadline] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [notFoundId, setNotFoundId] = useState<string | null>(null);

  const fetchDecisions = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await fetch("/api/decisions?limit=100");
      if (!res.ok) throw new Error("failed");
      const data = (await res.json()) as Decision[];
      setDecisions(Array.isArray(data) ? data : []);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDecisions();
  }, [fetchDecisions]);

  // If a deep-linked decision isn't in the fetched list (e.g. older than the
  // default page size), fetch it directly so the detail pane still resolves.
  useEffect(() => {
    if (!initialSelectedId || loading) return;
    if (decisions.some((d) => d.id === initialSelectedId)) return;
    (async () => {
      try {
        const res = await fetch(`/api/decisions/${initialSelectedId}`);
        if (res.status === 404) {
          setNotFoundId(initialSelectedId);
          return;
        }
        if (!res.ok) return;
        const data = (await res.json()) as Decision;
        setDecisions((prev) => [data, ...prev]);
      } catch {}
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSelectedId, loading]);

  useEffect(() => {
    setAnalyzing(false);
    setAnalyzeError(false);
    setNotAnalyzable(null);
  }, [selectedId]);

  const selected = decisions.find((d) => d.id === selectedId) ?? null;

  const updateSelected = useCallback((patch: Partial<Decision>) => {
    setDecisions((prev) => prev.map((d) => (d.id === selectedId ? { ...d, ...patch } : d)));
  }, [selectedId]);

  const open = decisions
    .filter((d) => d.status === "open")
    .sort((a, b) => {
      const da = a.deadline ? new Date(a.deadline).getTime() : Infinity;
      const db = b.deadline ? new Date(b.deadline).getTime() : Infinity;
      return da - db;
    });
  const closed = decisions.filter((d) => d.status !== "open");
  const baseList = tab === "open" ? open : closed;
  const list = search.trim()
    ? baseList.filter((d) => d.title.toLowerCase().includes(search.trim().toLowerCase()))
    : baseList;

  const runAnalysis = async () => {
    if (!selected || analyzing) return;
    setAnalyzing(true);
    setAnalyzeError(false);
    setNotAnalyzable(null);
    try {
      const res = await fetch(`/api/decisions/${selected.id}/analyze`, { method: "POST" });
      if (!res.ok) throw new Error("failed");
      const data = (await res.json()) as
        | { analyzable: true; blind_spots: BlindSpot[] }
        | { analyzable: false; reason: string };
      if (!data.analyzable) {
        setNotAnalyzable(data.reason);
        updateSelected({ blind_spots: [] });
      } else {
        updateSelected({ blind_spots: data.blind_spots });
      }
    } catch {
      setAnalyzeError(true);
    } finally {
      setAnalyzing(false);
    }
  };

  const saveDeadline = async (value: string) => {
    if (!selected || savingDeadline) return;
    const iso = value ? new Date(value).toISOString() : null;
    setSavingDeadline(true);
    const prev = selected.deadline;
    updateSelected({ deadline: iso });
    try {
      const res = await fetch(`/api/decisions/${selected.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deadline: iso }),
      });
      if (!res.ok) throw new Error("failed");
    } catch {
      updateSelected({ deadline: prev });
    } finally {
      setSavingDeadline(false);
    }
  };

  const setStatus = async (status: Decision["status"]) => {
    if (!selected || updatingStatus || selected.status === status) return;
    setUpdatingStatus(true);
    const prev = selected.status;
    updateSelected({ status });
    try {
      const res = await fetch(`/api/decisions/${selected.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error("failed");
    } catch {
      updateSelected({ status: prev });
    } finally {
      setUpdatingStatus(false);
    }
  };

  const spots = selected?.blind_spots ?? [];
  const days = daysUntil(selected?.deadline ?? null);

  return (
    <div className="min-h-screen bg-background text-foreground">
      {showModal && (
        <DecisionForm
          mode="create"
          onClose={() => setShowModal(false)}
          onSaved={(decision) => {
            setShowModal(false);
            setDecisions((prev) => [decision, ...prev]);
            setTab("open");
            setSelectedId(decision.id);
          }}
        />
      )}
      {showEdit && selected && (
        <DecisionForm
          mode="edit"
          decisionId={selected.id}
          initial={{
            title: selected.title,
            description: selected.description,
            rationale: selected.rationale,
            confidence: selected.confidence,
            deadline: selected.deadline,
            knownContext: selected.known_context,
            openQuestions: selected.open_questions,
          }}
          onClose={() => setShowEdit(false)}
          onSaved={(updated) => {
            updateSelected(updated);
            setShowEdit(false);
            setNotAnalyzable(null);
          }}
        />
      )}

      {/* Header */}
      <div className="px-8 pt-10 pb-8 border-b hairline">
        <p className="rule-label mb-3">
          Intelligence
        </p>
        <div className="flex flex-col items-start gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="display-hero text-foreground mb-2">
              Decisions
            </h1>
            <p className="text-sm text-muted-foreground">
              Every call you&apos;re weighing — analyzed for blind spots, tracked to a deadline.
            </p>
          </div>
          {/* Secondary — capturing a decision isn't the one primary action on
              this screen; resolving one (below) is. */}
          <button
            onClick={() => setShowModal(true)}
            className="btn-secondary flex items-center gap-2 rounded-xl px-4 py-2 text-[11px] font-bold uppercase tracking-wider transition-all flex-shrink-0"
          >
            <Plus size={13} />
            New Decision
          </button>
        </div>
      </div>

      {/* Two-pane workspace — below md this becomes a single-pane push flow:
          the list and detail panes are both always mounted (state, scroll
          position, and any in-flight fetch survive), just toggled with
          hidden/flex so switching is instant and nothing refetches. */}
      <div className="px-8 py-8">
        <div className="glass rounded-2xl overflow-hidden" style={{ minHeight: "calc(100vh - 260px)" }}>
          <div className="relative z-10 flex" style={{ minHeight: "calc(100vh - 260px)" }}>
            {/* Left rail */}
            <div className={`w-full md:w-[380px] flex-shrink-0 border-r hairline flex-col ${selectedId ? "hidden md:flex" : "flex"}`}>
              <div className="p-4 border-b hairline">
                <div className="hairline surf-1 relative flex items-center rounded-xl border px-3 py-2 mb-3">
                  <Search size={13} className="text-muted-foreground flex-shrink-0" strokeWidth={1.8} />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search decisions..."
                    className="bg-transparent border-none outline-none flex-1 ml-2 text-[12px] text-foreground placeholder:text-muted-foreground min-w-0"
                  />
                </div>
                <div className="flex items-center gap-5 border-b hairline">
                  {([
                    { value: "open", label: "Open", count: open.length },
                    { value: "closed", label: "Decided", count: closed.length },
                  ] as const).map((t) => (
                    <button
                      key={t.value}
                      onClick={() => setTab(t.value)}
                      className={`relative py-2 text-[11px] font-semibold uppercase tracking-wider transition-colors ${
                        tab === t.value
                          ? "text-foreground tab-active-bar"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {t.label}
                      {t.count > 0 && (
                        <span
                          className={`ml-1.5 ${
                            tab === t.value ? "text-foreground/70" : "text-muted-foreground"
                          }`}
                        >
                          {t.count}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex-1 overflow-y-auto">
                {loading ? (
                  <div className="p-4 flex flex-col gap-3">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="animate-pulse">
                        <div className="h-4 w-3/4 surf-2 rounded mb-2" />
                        <div className="h-3 w-1/2 surf-2 rounded" />
                      </div>
                    ))}
                  </div>
                ) : error ? (
                  <div className="p-6 text-center">
                    <p className="text-[12px] text-muted-foreground mb-2">Unable to load decisions</p>
                    <button onClick={fetchDecisions} className="text-[11px] font-bold uppercase tracking-wider text-foreground hover:underline">
                      Retry
                    </button>
                  </div>
                ) : list.length === 0 ? (
                  <div className="p-6 text-center">
                    <p className="text-[12px] text-muted-foreground">
                      {tab === "open" ? "No open decisions" : "Nothing decided or archived yet"}
                    </p>
                  </div>
                ) : (
                  list.map((d) => (
                    <DecisionListRow
                      key={d.id}
                      decision={d}
                      active={d.id === selectedId}
                      onSelect={() => setSelectedId(d.id)}
                    />
                  ))
                )}
              </div>
            </div>

            {/* Right pane */}
            <div className={`flex-1 min-w-0 overflow-y-auto ${!selectedId ? "hidden md:block" : ""}`}>
              {selectedId && (
                <div className="md:hidden px-8 pt-6">
                  <button
                    type="button"
                    onClick={() => setSelectedId(null)}
                    className="inline-flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
                    style={{ minHeight: 44 }}
                  >
                    <ArrowLeft size={14} />
                    All decisions
                  </button>
                </div>
              )}
              {!selected ? (
                <div className="h-full flex flex-col items-center justify-center text-center px-8 py-20">
                  <div className="surf-2 rounded-2xl flex items-center justify-center mb-6" style={{ width: 96, height: 96 }}>
                    <GitBranch size={36} className="text-muted-foreground" strokeWidth={1.5} />
                  </div>
                  {notFoundId && notFoundId === initialSelectedId ? (
                    <>
                      <p className="text-sm font-semibold text-foreground mb-1.5">
                        This decision doesn&apos;t exist
                      </p>
                      <p className="text-[12px] text-muted-foreground max-w-xs">
                        It may have been removed, or the link is wrong.
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="text-sm font-semibold text-foreground mb-1.5">
                        Select a decision
                      </p>
                      <p className="text-[12px] text-muted-foreground max-w-xs">
                        Pick one from the list, or capture a new decision you&apos;re weighing.
                      </p>
                    </>
                  )}
                </div>
              ) : (
                <div className="px-8 py-8 max-w-3xl">
                  <div className="flex items-center gap-2 mb-3">
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                        selected.status === "decided"
                          ? "badge-completed"
                          : selected.status === "archived"
                            ? "surf-1 text-muted-foreground hairline"
                            : "surf-3 text-foreground hairline-strong"
                      }`}
                    >
                      {selected.status}
                    </span>
                  </div>
                  <h2 className="display-font text-[1.5rem] tracking-tight text-foreground leading-tight mb-2">
                    {selected.title}
                  </h2>
                  <div className="text-[12px] text-muted-foreground mb-6">
                    <SourceLink decision={selected} />
                  </div>

                  <div className="flex flex-col gap-5">
                    {/* Context */}
                    <div className="hairline surf-1 rounded-2xl border p-5 flex flex-col gap-4">
                      {selected.description && (
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-muted-foreground mb-2">
                            What you&apos;re deciding
                          </p>
                          <p className="text-[14px] text-muted-foreground leading-relaxed whitespace-pre-line">
                            {selected.description}
                          </p>
                        </div>
                      )}
                      {selected.rationale && (
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-muted-foreground mb-2">
                            Why you&apos;re considering it
                          </p>
                          <p className="text-[14px] text-muted-foreground leading-relaxed whitespace-pre-line">
                            {selected.rationale}
                          </p>
                        </div>
                      )}
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-muted-foreground mb-2">
                          Confidence
                        </p>
                        <p className="text-[14px] text-muted-foreground">
                          {CONFIDENCE_LABELS[selected.confidence] ?? selected.confidence}
                        </p>
                      </div>
                      {selected.known_context && (
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-muted-foreground mb-2">
                            What you already know
                          </p>
                          <p className="text-[14px] text-muted-foreground leading-relaxed whitespace-pre-line">
                            {selected.known_context}
                          </p>
                        </div>
                      )}
                      {selected.open_questions && (
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-muted-foreground mb-2">
                            What you&apos;re unsure about
                          </p>
                          <p className="text-[14px] text-muted-foreground leading-relaxed whitespace-pre-line">
                            {selected.open_questions}
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Deadline */}
                    <div className="hairline surf-1 rounded-2xl border p-5">
                      <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-muted-foreground mb-3">
                        Deadline
                      </p>
                      <div className="flex items-center gap-3 flex-wrap">
                        <div className="relative inline-flex items-center">
                          <Calendar size={13} className={`absolute left-3 ${deadlineClass(days)}`} />
                          <input
                            type="date"
                            value={toDateInput(selected.deadline)}
                            onChange={(e) => saveDeadline(e.target.value)}
                            disabled={savingDeadline}
                            className="hairline surf-2 rounded-xl border pl-8 pr-3 py-2 text-[13px] text-foreground focus:outline-none focus:hairline-strong disabled:opacity-50"
                          />
                        </div>
                        {selected.deadline && (
                          <span className={`text-[12px] font-medium ${deadlineClass(days)}`}>
                            {formatDeadline(selected.deadline)}
                            {days !== null && days < 0 && " · overdue"}
                            {days !== null && days >= 0 && ` · ${Math.ceil(days)} day${Math.ceil(days) === 1 ? "" : "s"} left`}
                          </span>
                        )}
                        {savingDeadline && <Loader2 size={13} className="animate-spin text-muted-foreground" />}
                      </div>
                    </div>

                    {/* Blind spot analysis */}
                    <div className="hairline surf-1 rounded-2xl border p-5">
                      <div className="flex items-center justify-between gap-3 mb-4">
                        <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-muted-foreground">
                          Blind Spot Analysis
                        </p>
                        <button
                          type="button"
                          onClick={runAnalysis}
                          disabled={analyzing}
                          className="hairline surf-hover inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-[10px] font-bold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                        >
                          {analyzing ? <Loader2 size={11} className="animate-spin" /> : <ScanSearch size={11} />}
                          {analyzing ? "Analyzing…" : spots.length > 0 ? "Re-run" : "Run analysis"}
                        </button>
                      </div>

                      {analyzeError && (
                        <p className="hairline surf-2 text-[12px] text-foreground mb-4 border rounded-xl px-3 py-2">
                          Analysis failed — try again.
                        </p>
                      )}

                      {analyzing && spots.length === 0 ? (
                        <div className="flex flex-col gap-3">
                          {[1, 2, 3].map((i) => (
                            <div key={i} className="rounded-xl border hairline surf-2 px-4 py-3 animate-pulse">
                              <div className="h-3 w-1/4 surf-3 rounded mb-2" />
                              <div className="h-3 w-full surf-3 rounded" />
                            </div>
                          ))}
                        </div>
                      ) : notAnalyzable && spots.length === 0 ? (
                        <div className="flex flex-col items-center text-center py-6">
                          <HelpCircle size={22} className="text-[var(--urgency-decide)] mb-2.5" />
                          <p className="text-[14px] font-semibold text-foreground mb-1.5">
                            Not enough context to analyze yet
                          </p>
                          <p className="text-[13px] text-muted-foreground max-w-sm mb-5">{notAnalyzable}</p>
                          <button
                            type="button"
                            onClick={() => setShowEdit(true)}
                            className="hairline-strong surf-3 inset-sheen surf-hover inline-flex items-center gap-2 px-5 py-2 rounded-xl border text-[11px] font-bold text-foreground uppercase tracking-wider transition-all"
                          >
                            Add more context
                          </button>
                        </div>
                      ) : spots.length === 0 ? (
                        <div className="flex flex-col items-center text-center py-6">
                          <AlertTriangle size={20} className="text-muted-foreground mb-2" />
                          <p className="text-[13px] text-muted-foreground">
                            No analysis yet. Run a scan to surface the risks and angles you may be overlooking.
                          </p>
                        </div>
                      ) : (
                        <div className="flex flex-col gap-2.5">
                          {spots.map((spot, i) => (
                            <BlindSpotCard key={i} spot={spot} />
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Lifecycle actions */}
                    <div className="flex items-center gap-2 flex-wrap">
                      {/* The one primary CTA for this pane — resolving a
                          decision is the point of the tool (§2, §6). */}
                      <button
                        type="button"
                        onClick={() => setStatus("decided")}
                        disabled={updatingStatus || selected.status === "decided"}
                        className="btn-primary inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-[11px] font-bold uppercase tracking-wider transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <Check size={13} />
                        Mark as decided
                      </button>
                      <button
                        type="button"
                        onClick={() => setStatus("archived")}
                        disabled={updatingStatus || selected.status === "archived"}
                        className="btn-secondary inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-[11px] font-bold uppercase tracking-wider transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <Archive size={13} />
                        Archive
                      </button>
                      {selected.status !== "open" && (
                        <button
                          type="button"
                          onClick={() => setStatus("open")}
                          disabled={updatingStatus}
                          className="btn-secondary inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-[11px] font-bold uppercase tracking-wider transition-colors disabled:opacity-50"
                        >
                          Reopen
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

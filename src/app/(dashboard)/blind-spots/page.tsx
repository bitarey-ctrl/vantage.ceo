"use client";

import { useCallback, useEffect, useState } from "react";
import { Eye, Loader2, MessageSquare } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

// ─── Types ────────────────────────────────────────────────────────────────────

interface BlindSpotPattern {
  id: string;
  profile_id: string;
  pattern_type: string;
  alert_message: string;
  confidence: number;
  detection_data: {
    decision_ids?: string[];
    data_points?: string[];
    quantified_cost?: number | null;
    pattern_description?: string;
  };
  is_active: boolean;
  detected_at: string;
  acknowledged_at: string | null;
  created_at: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PATTERN_LABELS: Record<string, string> = {
  optimism_inflation: "Optimism Inflation",
  avoidance: "Decision Avoidance",
  recency_bias: "Recency Bias",
  confirmation_bias: "Confirmation Bias",
  risk_aversion: "Risk Aversion",
  sunk_cost: "Sunk Cost Trap",
};

function daysAgo(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days === 0) return "today";
  if (days === 1) return "1 day ago";
  return `${days} days ago`;
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded surf-2 ${className ?? ""}`} />;
}

// ─── Pattern Card ─────────────────────────────────────────────────────────────

function PatternCard({
  pattern,
  muted,
  onAcknowledge,
}: {
  pattern: BlindSpotPattern;
  muted: boolean;
  onAcknowledge?: () => void;
}) {
  const [acking, setAcking] = useState(false);
  const router = useRouter();
  const label = PATTERN_LABELS[pattern.pattern_type] ?? pattern.pattern_type;
  const dataPoints = pattern.detection_data?.data_points ?? [];
  const quantifiedCost = pattern.detection_data?.quantified_cost;

  const handleAck = async () => {
    if (!onAcknowledge) return;
    setAcking(true);
    try {
      const res = await fetch(`/api/blindspot/${pattern.id}`, { method: "PATCH" });
      if (!res.ok) throw new Error("failed");
      onAcknowledge();
    } finally {
      setAcking(false);
    }
  };

  const handleDiscuss = () => {
    const evidenceList = dataPoints.length > 0
      ? `\n\nEvidence VANTAGE flagged:\n${dataPoints.map(p => `- ${p}`).join('\n')}`
      : '';
    const costNote = quantifiedCost && quantifiedCost > 0
      ? `\n\nEstimated cost: $${quantifiedCost.toLocaleString()}`
      : '';
    const msg = `VANTAGE flagged a pattern in my decision-making: "${label}" (${pattern.confidence}% confidence).\n\nWhat it said: ${pattern.alert_message}${evidenceList}${costNote}\n\nI want to think through this with you — is this pattern real, what's the underlying cause, and what should I change about how I decide things going forward?`;
    sessionStorage.setItem("advisor_prefill", JSON.stringify({ message: msg, source: "blindspot" }));
    router.push("/advisor");
  };

  return (
    <div className={`glass glass-sheen rounded-2xl p-5 transition-all duration-200 ${muted ? "card-completed" : ""}`}>
      <div className="relative z-10">
      {/* Top row: badge + confidence */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-[10px] font-semibold uppercase tracking-wider px-2.5 py-1 rounded-full border hairline-strong surf-3 text-foreground">
          {label}
        </span>
        {muted ? (
          <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded border hairline surf-1 text-muted-foreground">
            Acknowledged
          </span>
        ) : (
          <span className="surf-1 hairline border rounded-full px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
            {pattern.confidence}% confidence
          </span>
        )}
      </div>

      {/* Alert message */}
      <p className="text-sm leading-relaxed mb-3 text-muted-foreground">
        {pattern.alert_message}
      </p>

      {/* Estimated cost */}
      {!muted && quantifiedCost != null && quantifiedCost > 0 && (
        <div className="mb-3 rounded-xl border hairline-strong surf-3 px-3 py-2 inline-flex">
          <span className="text-sm font-semibold text-foreground">
            Estimated cost: ${quantifiedCost.toLocaleString()}
          </span>
        </div>
      )}

      {/* Evidence */}
      {!muted && dataPoints.length > 0 && (
        <div className="mb-3">
          <p className="text-[10px] font-semibold uppercase tracking-widest mb-1.5 text-muted-foreground">
            Evidence
          </p>
          <ul className="flex flex-col gap-1">
            {dataPoints.map((point, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="mt-1.5 w-1 h-1 rounded-full flex-shrink-0 surf-4" />
                <span className="text-xs text-muted-foreground leading-relaxed">{point}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Bottom row */}
      <div className="flex items-center justify-between pt-2 border-t hairline gap-2">
        <span className="text-[10px] font-mono text-muted-foreground">
          Detected {daysAgo(pattern.detected_at)}
        </span>
        <div className="flex items-center gap-2">
          {!muted && (
            <button
              onClick={handleDiscuss}
              className="hairline surf-hover flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold text-muted-foreground transition-all hover:text-foreground"
              type="button"
            >
              <MessageSquare size={10} strokeWidth={2} />
              Discuss with Advisor
            </button>
          )}
          {!muted && onAcknowledge && (
            <button
              onClick={handleAck}
              disabled={acking}
              className="flex items-center gap-1.5 rounded-xl border hairline surf-hover px-3 py-1.5 text-xs font-semibold text-muted-foreground transition-all hover:text-foreground disabled:opacity-40"
            >
              {acking ? (
                <Loader2 size={10} className="animate-spin" />
              ) : null}
              Acknowledge
            </button>
          )}
        </div>
      </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function BlindSpotsPage() {
  const [active, setActive] = useState<BlindSpotPattern[]>([]);
  const [acknowledged, setAcknowledged] = useState<BlindSpotPattern[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [toast, setToast] = useState<{ message: string; color: string } | null>(null);
  const [showAcknowledged, setShowAcknowledged] = useState(false);

  const fetchPatterns = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await fetch("/api/blindspot/active");
      if (!res.ok) throw new Error("failed");
      const data: BlindSpotPattern[] = await res.json();
      setActive(data.filter((p) => p.is_active && !p.acknowledged_at));
      setAcknowledged(data.filter((p) => !p.is_active || !!p.acknowledged_at));
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPatterns();
  }, [fetchPatterns]);

  const handleScan = async () => {
    setScanning(true);
    setToast(null);
    try {
      const res = await fetch("/api/blindspot/active", { method: "POST" });
      if (!res.ok) throw new Error("failed");
      const result: { patternsDetected: number; patterns: BlindSpotPattern[] } = await res.json();

      if (result.patternsDetected > 0) {
        setActive((prev) => {
          const existingIds = new Set(prev.map((p) => p.id));
          const newOnes = result.patterns.filter((p) => !existingIds.has(p.id));
          return [...newOnes, ...prev];
        });
        setToast({
          message: `${result.patternsDetected} new pattern${result.patternsDetected > 1 ? "s" : ""} detected`,
          color: "var(--foreground)",
        });
      } else {
        setToast({
          message: "No new patterns found — keep logging decisions.",
          color: "var(--muted-foreground)",
        });
      }
    } catch {
      setToast({ message: "Scan failed. Please try again.", color: "var(--foreground)" });
    } finally {
      setScanning(false);
      setTimeout(() => setToast(null), 4000);
    }
  };

  const handleAcknowledge = (id: string) => {
    const pattern = active.find((p) => p.id === id);
    if (!pattern) return;
    setActive((prev) => prev.filter((p) => p.id !== id));
    setAcknowledged((prev) => [{ ...pattern, is_active: false, acknowledged_at: new Date().toISOString() }, ...prev]);
  };

  const isEmpty = active.length === 0 && acknowledged.length === 0;

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* ── Header ── */}
      <div className="sticky top-0 z-20 border-b hairline glass px-6 py-4 flex items-start justify-between">
        <div className="relative z-10">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground mb-0.5">
            Intelligence
          </p>
          <h1 className="display-font text-lg text-foreground">Blind Spots</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Patterns VANTAGE has detected in your decision-making
          </p>
        </div>
        <div className="relative z-10 flex flex-col items-end gap-2">
          <button
            onClick={handleScan}
            disabled={scanning}
            className="flex items-center gap-2 rounded-xl border hairline-strong surf-3 inset-sheen surf-hover px-4 py-2 text-xs font-semibold uppercase tracking-wider text-foreground transition-all disabled:opacity-40"
          >
            {scanning ? (
              <>
                <Loader2 size={12} className="animate-spin" />
                Scanning...
              </>
            ) : (
              <>
                <Eye size={12} />
                Scan for Patterns
              </>
            )}
          </button>
          {toast && (
            <span className="text-[11px] font-medium" style={{ color: toast.color }}>
              {toast.message}
            </span>
          )}
        </div>
      </div>

      <div className="px-6 py-6 max-w-3xl mx-auto flex flex-col gap-5">

        {/* ── Loading ── */}
        {loading && (
          <div className="flex flex-col gap-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="glass rounded-2xl p-5">
                <div className="flex justify-between mb-3">
                  <Skeleton className="h-6 w-28 rounded-full" />
                  <Skeleton className="h-4 w-20" />
                </div>
                <Skeleton className="h-3 w-full mb-2" />
                <Skeleton className="h-3 w-4/5 mb-2" />
                <Skeleton className="h-3 w-2/3 mb-4" />
                <div className="flex justify-between pt-2 border-t hairline">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-7 w-24 rounded" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Error ── */}
        {!loading && error && (
          <div className="glass rounded-2xl p-8 text-center">
            <p className="text-sm text-muted-foreground mb-3">Unable to load blind spot patterns</p>
            <button
              onClick={fetchPatterns}
              className="text-[11px] font-semibold uppercase tracking-wider text-foreground hover:underline"
            >
              Retry
            </button>
          </div>
        )}

        {/* ── Empty state ── */}
        {!loading && !error && isEmpty && (
          <div className="glass rounded-2xl p-12 text-center">
            <div className="relative z-10">
            <div className="flex justify-center mb-4">
              <div className="w-14 h-14 rounded-full surf-2 flex items-center justify-center">
                <Eye size={22} className="text-muted-foreground" />
              </div>
            </div>
            <p className="text-sm font-semibold text-foreground mb-1">
              No blind spots detected yet
            </p>
            <p className="text-xs text-muted-foreground mb-6 max-w-xs mx-auto leading-relaxed">
              Blind spot detection requires at least 5 logged decisions. The more you log, the more
              patterns VANTAGE can surface.
            </p>
            <Link
              href="/decisions"
              className="inline-flex items-center gap-1 text-xs font-semibold text-foreground border hairline-strong surf-3 inset-sheen surf-hover rounded-xl px-4 py-2 transition-colors"
            >
              Go to Decisions →
            </Link>
            </div>
          </div>
        )}

        {/* ── Active patterns ── */}
        {!loading && !error && active.length > 0 && (
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-3">
              Active Patterns
            </p>
            <div className="section-container">
              <div className="flex flex-col gap-3">
                {active.map((pattern) => (
                  <PatternCard
                    key={pattern.id}
                    pattern={pattern}
                    muted={false}
                    onAcknowledge={() => handleAcknowledge(pattern.id)}
                  />
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Acknowledged patterns ── */}
        {!loading && !error && acknowledged.length > 0 && (
          <div>
            <button
              onClick={() => setShowAcknowledged((v) => !v)}
              className="flex items-center gap-2 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors mb-3"
            >
              <span
                className="text-[10px] transition-transform duration-200"
                style={{ display: "inline-block", transform: showAcknowledged ? "rotate(90deg)" : "rotate(0deg)" }}
              >
                ▶
              </span>
              Acknowledged Patterns ({acknowledged.length})
            </button>

            {showAcknowledged && (
              <div className="section-container">
                <div className="flex flex-col gap-3">
                  {acknowledged.map((pattern) => (
                    <PatternCard
                      key={pattern.id}
                      pattern={pattern}
                      muted={true}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

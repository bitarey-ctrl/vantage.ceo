"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Check, MessageSquare, Zap, X, Loader2 } from "lucide-react";
import type { Strategy, StrategyStatus } from "@/types/database";

// ─── Types ────────────────────────────────────────────────────────────────────

type StrategyDetail = Strategy & {
  signal?: { id: string; title: string } | null;
};

const STATUS_FLOW: { value: StrategyStatus; label: string }[] = [
  { value: "considering", label: "Considering" },
  { value: "deciding", label: "Deciding" },
  { value: "decided", label: "Decided" },
  { value: "archived", label: "Archived" },
];

const STATUS_STYLES: Record<StrategyStatus, string> = {
  considering: "surf-2 text-muted-foreground hairline",
  deciding: "surf-3 text-foreground hairline-strong",
  decided: "badge-completed",
  archived: "surf-1 text-muted-foreground hairline",
};

const OUTCOME_OPTIONS: {
  value: NonNullable<Strategy["outcome_status"]>;
  label: string;
}[] = [
  { value: "worked", label: "Worked" },
  { value: "didnt_work", label: "Didn't work" },
  { value: "too_early", label: "Too early" },
  { value: "unclear", label: "Unclear" },
];

// ─── Building blocks ──────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: StrategyStatus }) {
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${STATUS_STYLES[status]}`}
    >
      {status}
    </span>
  );
}

function TimelineItem({ label, text }: { label: string; text: string }) {
  return (
    <div className="flex gap-4">
      <div className="flex flex-col items-center">
        <div className="w-2 h-2 rounded-full surf-3 mt-1.5 flex-shrink-0" />
        <div className="w-px flex-1 hairline border-l mt-1" />
      </div>
      <div className="pb-5 flex-1 min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground mb-1">
          {label}
        </p>
        <p className="text-[13px] text-muted-foreground leading-relaxed">{text}</p>
      </div>
    </div>
  );
}

function OutcomeCapture({
  strategyId,
  onRecorded,
}: {
  strategyId: string;
  onRecorded: () => void;
}) {
  const [selected, setSelected] = useState<
    NonNullable<Strategy["outcome_status"]> | null
  >(null);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(false);

  const submit = async () => {
    if (!selected || saving) return;
    setSaving(true);
    setErr(false);
    try {
      const res = await fetch(`/api/strategies/${strategyId}/outcome`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ outcome_status: selected, outcome_notes: notes }),
      });
      if (!res.ok) throw new Error("failed");
      onRecorded();
    } catch {
      setErr(true);
      setSaving(false);
    }
  };

  return (
    <div className="mt-3 w-full rounded-xl border hairline surf-1 px-4 py-3">
      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground mb-2.5">
        Did this work out?
      </p>
      <div className="flex flex-wrap items-center gap-1.5 mb-2.5">
        {OUTCOME_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => setSelected(opt.value)}
            className={`px-3 py-1 rounded-full border text-[11px] font-bold uppercase tracking-wider transition-all ${
              selected === opt.value
                ? "surf-3 inset-sheen text-foreground hairline-strong"
                : "hairline surf-hover text-muted-foreground hover:text-foreground"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
      {selected && (
        <>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional — what happened?"
            rows={2}
            className="w-full rounded-lg border hairline surf-1 px-3 py-2 text-[13px] text-foreground placeholder:text-muted-foreground resize-none focus:outline-none focus:hairline-strong"
          />
          <div className="flex items-center gap-2 mt-2">
            <button
              type="button"
              onClick={submit}
              disabled={saving}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl border hairline-strong surf-3 inset-sheen surf-hover text-[11px] font-bold text-foreground uppercase tracking-wider transition-all disabled:opacity-50"
            >
              <Check size={11} />
              {saving ? "Saving…" : "Record outcome"}
            </button>
            {err && (
              <span className="text-[11px] text-muted-foreground">
                Failed — try again
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function DeadlineModal({
  strategy,
  onClose,
  onCreated,
}: {
  strategy: StrategyDetail;
  onClose: () => void;
  onCreated: (decisionId: string) => void;
}) {
  const [deadline, setDeadline] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const submit = async () => {
    if (saving) return;
    setSaving(true);
    setErr("");
    try {
      const res = await fetch("/api/decisions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: strategy.title,
          description: strategy.description ?? null,
          deadline: deadline ? new Date(deadline).toISOString() : null,
          source: "strategy",
          sourceId: strategy.id,
        }),
      });
      if (!res.ok) {
        const b = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(b.error ?? "Failed to create decision");
      }
      const created = (await res.json()) as { id: string };
      onCreated(created.id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to create decision");
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="glass glass-sheen w-full max-w-md rounded-2xl overflow-hidden">
        <div className="relative z-10 p-6">
          <div className="flex items-center justify-between mb-2">
            <h2 className="display-font text-[1.25rem] tracking-tight text-foreground">
              By when?
            </h2>
            <button
              onClick={onClose}
              className="text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Close"
            >
              <X size={18} />
            </button>
          </div>
          <p className="text-[12px] text-muted-foreground mb-5">
            Moving this to deciding creates a tracked decision. Set a deadline to
            keep it on the radar.
          </p>

          <label className="block text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground mb-1.5">
            Deadline <span className="text-muted-foreground/60">(optional)</span>
          </label>
          <input
            type="date"
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
            className="hairline surf-1 w-full rounded-xl border px-3 py-2.5 text-[14px] text-foreground focus:outline-none focus:hairline-strong mb-5"
          />

          {err && (
            <p className="hairline surf-2 text-[12px] text-foreground mb-4 border rounded-xl px-3 py-2">
              {err}
            </p>
          )}

          <div className="flex items-center justify-end gap-2">
            <button
              onClick={onClose}
              className="hairline surf-hover px-4 py-2 rounded-xl border text-[11px] font-bold text-muted-foreground hover:text-foreground uppercase tracking-wider transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={submit}
              disabled={saving}
              className="hairline-strong surf-3 inset-sheen surf-hover flex items-center gap-2 px-5 py-2 rounded-xl border text-[11px] font-bold text-foreground uppercase tracking-wider transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
              Create decision
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function StrategyDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params.id;

  const [strategy, setStrategy] = useState<StrategyDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [showDeadlineModal, setShowDeadlineModal] = useState(false);

  const fetchStrategy = useCallback(async () => {
    setLoading(true);
    setNotFound(false);
    try {
      const res = await fetch(`/api/strategies/${id}`);
      if (res.status === 404) {
        setNotFound(true);
        return;
      }
      if (!res.ok) throw new Error("failed");
      const data = (await res.json()) as StrategyDetail;
      setStrategy(data);
    } catch {
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchStrategy();
  }, [fetchStrategy]);

  const setStatus = async (status: StrategyStatus) => {
    if (!strategy || updating || strategy.status === status) return;
    // Moving from "considering" to "deciding" spins up a tracked decision.
    if (status === "deciding" && strategy.status === "considering") {
      setShowDeadlineModal(true);
      return;
    }
    setUpdating(true);
    const prev = strategy.status;
    setStrategy({ ...strategy, status });
    try {
      const res = await fetch(`/api/strategies/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error("failed");
    } catch {
      setStrategy((s) => (s ? { ...s, status: prev } : s));
    } finally {
      setUpdating(false);
    }
  };

  const onDecisionCreated = async (decisionId: string) => {
    if (strategy) {
      setStrategy({ ...strategy, status: "deciding" });
      fetch(`/api/strategies/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "deciding" }),
      }).catch(() => {});
    }
    setShowDeadlineModal(false);
    router.push(`/decisions/${decisionId}`);
  };

  const discuss = () => {
    if (!strategy) return;
    const msg = `I'm weighing a strategy: '${strategy.title}'. The recommendation is: '${strategy.description}'. The cost of inaction is: '${strategy.cost_of_inaction ?? "not specified"}'. Help me think through whether to commit to this and what I might be missing.`;
    sessionStorage.setItem(
      "advisor_prefill",
      JSON.stringify({ message: msg, source: "strategy" })
    );
    router.push("/advisor");
  };

  const hasTimeline =
    strategy &&
    (strategy.timeline_30d || strategy.timeline_90d || strategy.timeline_6m);

  return (
    <div className="min-h-screen bg-background text-foreground">
      {showDeadlineModal && strategy && (
        <DeadlineModal
          strategy={strategy}
          onClose={() => setShowDeadlineModal(false)}
          onCreated={onDecisionCreated}
        />
      )}
      <div className="px-8 pt-10 pb-8 border-b hairline">
        <Link
          href="/strategies"
          className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors mb-4"
        >
          <ArrowLeft size={13} />
          All strategies
        </Link>

        {loading ? (
          <div className="animate-pulse">
            <div className="h-7 w-2/3 surf-2 rounded mb-3" />
            <div className="h-4 w-1/3 surf-2 rounded" />
          </div>
        ) : strategy ? (
          <>
            <div className="flex items-center gap-2 mb-3">
              <StatusBadge status={strategy.status} />
              {strategy.outcome_status && (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border hairline surf-2 text-muted-foreground">
                  {OUTCOME_OPTIONS.find((o) => o.value === strategy.outcome_status)
                    ?.label ?? strategy.outcome_status}
                </span>
              )}
            </div>
            <h1 className="display-font text-[1.75rem] tracking-tight text-foreground leading-tight mb-2">
              {strategy.title}
            </h1>
            <div className="text-[12px] text-muted-foreground">
              {strategy.signal ? (
                <Link
                  href={`/signals?focus=${strategy.signal.id}`}
                  className="inline-flex items-center gap-1.5 hover:text-foreground transition-colors"
                >
                  <Zap size={12} />
                  Derived from signal: {strategy.signal.title}
                </Link>
              ) : (
                <span>Manually created strategy</span>
              )}
            </div>
          </>
        ) : (
          <h1 className="display-font text-[1.75rem] tracking-tight text-foreground leading-tight">
            Strategy not found
          </h1>
        )}
      </div>

      <div className="px-8 py-8 max-w-3xl">
        {notFound ? (
          <div className="glass rounded-2xl p-12 text-center">
            <p className="text-sm font-semibold text-foreground mb-1">
              This strategy doesn&apos;t exist
            </p>
            <p className="text-[12px] text-muted-foreground mb-5">
              It may have been removed, or the link is wrong.
            </p>
            <Link
              href="/strategies"
              className="hairline-strong surf-3 inset-sheen surf-hover inline-block px-5 py-2 rounded-xl border text-[11px] font-bold text-foreground uppercase tracking-wider transition-colors"
            >
              Back to strategies
            </Link>
          </div>
        ) : loading || !strategy ? (
          <div className="glass rounded-2xl p-8 animate-pulse">
            <div className="h-4 w-full surf-2 rounded mb-2" />
            <div className="h-4 w-5/6 surf-2 rounded mb-2" />
            <div className="h-4 w-2/3 surf-2 rounded" />
          </div>
        ) : (
          <div className="flex flex-col gap-5">
            {/* Status control */}
            <div className="glass glass-sheen rounded-2xl overflow-hidden">
              <div className="relative z-10 px-6 py-5">
                <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-muted-foreground mb-3">
                  Status
                </p>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {STATUS_FLOW.map((s) => {
                    const active = strategy.status === s.value;
                    return (
                      <button
                        key={s.value}
                        type="button"
                        disabled={updating}
                        onClick={() => setStatus(s.value)}
                        className={`px-3.5 py-1.5 rounded-full border text-[11px] font-bold uppercase tracking-wider transition-all disabled:opacity-50 ${
                          active
                            ? "surf-3 inset-sheen text-foreground hairline-strong"
                            : "hairline surf-hover text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {s.label}
                      </button>
                    );
                  })}
                </div>

                {strategy.status === "decided" && !strategy.outcome_status && (
                  <OutcomeCapture
                    strategyId={strategy.id}
                    onRecorded={fetchStrategy}
                  />
                )}
              </div>
            </div>

            {/* Description */}
            <div className="glass glass-sheen rounded-2xl overflow-hidden">
              <div className="relative z-10 px-6 py-5">
                <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-muted-foreground mb-3">
                  Recommendation
                </p>
                <p className="text-[14px] text-muted-foreground leading-relaxed whitespace-pre-line">
                  {strategy.description}
                </p>
              </div>
            </div>

            {/* Timeline */}
            {hasTimeline && (
              <div className="glass glass-sheen rounded-2xl overflow-hidden">
                <div className="relative z-10 px-6 py-5">
                  <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-muted-foreground mb-4">
                    Execution Timeline
                  </p>
                  {strategy.timeline_30d && (
                    <TimelineItem label="30 Days" text={strategy.timeline_30d} />
                  )}
                  {strategy.timeline_90d && (
                    <TimelineItem label="90 Days" text={strategy.timeline_90d} />
                  )}
                  {strategy.timeline_6m && (
                    <TimelineItem label="6+ Months" text={strategy.timeline_6m} />
                  )}
                </div>
              </div>
            )}

            {/* Cost of inaction */}
            {strategy.cost_of_inaction && (
              <div className="rounded-2xl border hairline-strong surf-3 px-6 py-5">
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-foreground mb-1.5">
                  If You Ignore This
                </p>
                <p className="text-[14px] text-muted-foreground leading-relaxed">
                  {strategy.cost_of_inaction}
                </p>
              </div>
            )}

            {/* Discuss */}
            <button
              type="button"
              onClick={discuss}
              className="hairline surf-hover w-full flex items-center justify-center gap-2 py-3 rounded-xl border text-[11px] font-bold text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors"
            >
              <MessageSquare size={13} />
              Discuss with Advisor →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

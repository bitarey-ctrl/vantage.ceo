"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowUpRight, Check, Plus, X, Loader2 } from "lucide-react";
import type { Strategy, StrategyStatus } from "@/types/database";
import { toPlainText } from "@/lib/text";

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

  const timeline: [string, string][] = strategy
    ? ([
        ["30 days", strategy.timeline_30d],
        ["90 days", strategy.timeline_90d],
        ["6+ months", strategy.timeline_6m],
      ].filter((x) => Boolean(x[1])) as [string, string][])
    : [];

  /*
   * Detail view, rebuilt to the prototype's strategy document: toolbar with a
   * status select, then a reading column — eyebrow, title, lede, the linked
   * originating signal, a disclosure holding the timeline and the cost of
   * inaction, and the actions footer.
   *
   * Every mutation is the one that was already here: the status PATCH (with
   * its considering -> deciding detour through DeadlineModal), the outcome
   * capture, and the advisor prefill handoff.
   */
  return (
    <div className="vx-split vx-focused">
      {showDeadlineModal && strategy && (
        <DeadlineModal
          strategy={strategy}
          onClose={() => setShowDeadlineModal(false)}
          onCreated={onDecisionCreated}
        />
      )}

      <article className="vx-panel vx-document">
        <div className="vx-detail-toolbar">
          <Link className="vx-back" href="/strategies">← All strategies</Link>
          {strategy && (
            <select
              aria-label="Strategy status"
              value={strategy.status}
              disabled={updating}
              onChange={(e) => setStatus(e.target.value as StrategyStatus)}
            >
              {STATUS_FLOW.map((x) => (
                <option key={x.value} value={x.value}>{x.label}</option>
              ))}
            </select>
          )}
        </div>

        {notFound ? (
          <div className="vx-empty">
            <h2>This strategy doesn&apos;t exist</h2>
            <p>It may have been removed, or the link is wrong.</p>
            <Link className="vx-btn" href="/strategies">Back to strategies</Link>
          </div>
        ) : loading || !strategy ? (
          <div className="vx-empty"><h2>Loading strategy…</h2></div>
        ) : (
          <div className="vx-reading">
            <span className="vx-eyebrow">STRATEGIC RESPONSE</span>
            <h2>{toPlainText(strategy.title)}</h2>
            <p className="vx-lede">{strategy.description}</p>

            {strategy.signal && (
              <Link className="vx-linked-source" href={`/signals?focus=${strategy.signal.id}`}>
                <span className="vx-dot" />
                Originating signal
                <ArrowUpRight size={14} />
                <strong>{toPlainText(strategy.signal.title)}</strong>
              </Link>
            )}

            {(timeline.length > 0 || strategy.cost_of_inaction) && (
              <details className="vx-disclosure">
                <summary>Timeline &amp; longer-term impact<Plus size={15} /></summary>
                <div>
                  {timeline.length > 0 && (
                    <div className="vx-timeline">
                      {timeline.map(([when, text], i) => (
                        <div key={when}>
                          <span className={i === 0 ? "vx-red" : ""}>{when}</span>
                          <p>{text}</p>
                        </div>
                      ))}
                    </div>
                  )}
                  {strategy.cost_of_inaction && (
                    <div className="vx-callout">
                      <span className="vx-section-label">IF YOU DO NOTHING</span>
                      <p>{strategy.cost_of_inaction}</p>
                    </div>
                  )}
                </div>
              </details>
            )}

            {strategy.status === "decided" && !strategy.outcome_status && (
              <OutcomeCapture strategyId={strategy.id} onRecorded={fetchStrategy} />
            )}

            {strategy.outcome_status && (
              <div className="vx-callout">
                <span className="vx-section-label">OUTCOME</span>
                <p>
                  {OUTCOME_OPTIONS.find((o) => o.value === strategy.outcome_status)?.label ??
                    strategy.outcome_status}
                </p>
              </div>
            )}

            <footer className="vx-actions">
              <button
                className="vx-btn vx-primary"
                type="button"
                disabled={updating}
                onClick={() => setShowDeadlineModal(true)}
              >
                Frame a decision<ArrowUpRight size={14} />
              </button>
              <button className="vx-btn" type="button" onClick={discuss}>
                Discuss with Advisor<ArrowUpRight size={14} />
              </button>
            </footer>
          </div>
        )}
      </article>
    </div>
  );
}

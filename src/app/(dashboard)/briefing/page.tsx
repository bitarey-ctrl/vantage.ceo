'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Zap, ChevronDown, ChevronUp, Calendar, BarChart2, Layers, CheckSquare } from 'lucide-react';
import { toPlainText } from "@/lib/text";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Brief {
  id: string;
  type: 'DAILY' | 'WEEKLY';
  createdAt: string;
  healthScore: number;
  healthScoreDelta: number | null;
  healthScoreRationale: string | null;
  signalCount: number;
  actionCount: number;
  topSignals?: { title: string; soWhat: string; actionRequired: boolean; urgencyDays: number }[];
  requiredActions?: { text: string; timeWindow: string; category: string }[];
}

// ─── DB → UI transform ────────────────────────────────────────────────────────

type TopSignal = NonNullable<Brief['topSignals']>[number];
type RequiredAction = NonNullable<Brief['requiredActions']>[number];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapBriefRow(row: Record<string, any>): Brief {
  const topSignals: TopSignal[] = (row.top_signals ?? []).map(
    (s: Record<string, unknown>) => ({
      title: String(s.signal_title ?? ''),
      soWhat: String(s.so_what ?? ''),
      actionRequired: Boolean(s.action_required),
      urgencyDays: Number(s.urgency_days ?? 7),
    })
  );
  const requiredActions: RequiredAction[] = (row.required_actions ?? []).map(
    (a: Record<string, unknown>) => ({
      text: String(a.description ?? ''),
      timeWindow: String(a.time_window ?? ''),
      category: String(a.category ?? ''),
    })
  );
  return {
    id: row.id,
    type: (String(row.type ?? 'daily').toUpperCase()) as 'DAILY' | 'WEEKLY',
    createdAt: row.generated_at ?? row.created_at,
    healthScore: Number(row.health_score ?? 50),
    healthScoreDelta: row.health_score_delta != null ? Number(row.health_score_delta) : null,
    healthScoreRationale: row.health_score_rationale ?? null,
    signalCount: topSignals.length,
    actionCount: requiredActions.length,
    topSignals,
    requiredActions,
  };
}

// ─── Skeleton ────────────────────────────────────────────────────────────────

function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-[#1a1a1a] ${className ?? ''}`} />;
}

// ─── Health Score Badge ───────────────────────────────────────────────────────

function HealthBadge({ score }: { score: number }) {
  const color =
    score >= 80
      ? 'text-[#34d399] border-[#34d399]/20 bg-[#34d399]/5'
      : score >= 60
      ? 'text-[#f59e0b] border-[#f59e0b]/20 bg-[#f59e0b]/5'
      : 'text-[#e5463e] border-[#e5463e]/20 bg-[#e5463e]/5';
  return (
    <span className={`text-[11px] font-bold px-2 py-0.5 rounded border ${color}`}>
      {score}
    </span>
  );
}

// ─── Brief Card ───────────────────────────────────────────────────────────────

function BriefCard({ brief, defaultOpen }: { brief: Brief; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen ?? false);

  const dateStr = new Date(brief.createdAt).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <motion.div
      layout
      className={`rounded-lg border bg-[#111111] transition-colors ${
        open ? 'border-[#1b7ff0]/20' : 'border-[#1a1a1a] hover:border-[#242424]'
      }`}
    >
      {/* Header row */}
      <div
        className="flex items-center gap-4 px-5 py-4 cursor-pointer select-none"
        onClick={() => setOpen((v) => !v)}
      >
        {/* Type badge */}
        <span
          className={`flex-shrink-0 text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded border ${
            brief.type === 'WEEKLY'
              ? 'text-[#a78bfa] border-[#a78bfa]/20 bg-[#a78bfa]/5'
              : 'text-[#1b7ff0] border-[#1b7ff0]/20 bg-[#1b7ff0]/5'
          }`}
        >
          {brief.type}
        </span>

        {/* Date */}
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          <Calendar size={12} className="text-[#444444] flex-shrink-0" />
          <span className="text-sm font-medium text-[#f5f5f5] truncate">{dateStr}</span>
        </div>

        {/* Health */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <BarChart2 size={11} className="text-[#444444]" />
          <HealthBadge score={brief.healthScore} />
          {brief.healthScoreDelta != null && brief.healthScoreDelta !== 0 && (
            <span className={`text-[10px] font-semibold ${brief.healthScoreDelta > 0 ? 'text-[#34d399]' : 'text-[#e5463e]'}`}>
              {brief.healthScoreDelta > 0 ? `+${brief.healthScoreDelta}` : brief.healthScoreDelta}
            </span>
          )}
        </div>

        {/* Signal count */}
        <div className="hidden sm:flex items-center gap-1.5 flex-shrink-0">
          <Layers size={11} className="text-[#444444]" />
          <span className="text-[11px] text-[#666666]">{brief.signalCount} signals</span>
        </div>

        {/* Action count */}
        <div className="hidden sm:flex items-center gap-1.5 flex-shrink-0">
          <CheckSquare size={11} className="text-[#444444]" />
          <span className="text-[11px] text-[#666666]">{brief.actionCount} actions</span>
        </div>

        {/* Expand */}
        <span className="flex-shrink-0 text-[#444444]">
          {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </span>
      </div>

      {/* Expanded content */}
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="content"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
            style={{ overflow: 'hidden' }}
          >
            <div className="border-t border-[#1a1a1a] px-5 py-5 flex flex-col gap-6">
              {/* Health Score Rationale */}
              {brief.healthScoreRationale && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-[#666666] mb-2">
                    Health Assessment
                  </p>
                  <p className="text-sm text-[#a0a0a0] leading-relaxed">{brief.healthScoreRationale}</p>
                </div>
              )}

              {/* Top Signals */}
              {brief.topSignals && brief.topSignals.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-[#666666] mb-3">
                    Top Signals
                  </p>
                  <div className="flex flex-col gap-2">
                    {brief.topSignals.map((s, i) => (
                      <div
                        key={i}
                        className="rounded-md border border-[#1a1a1a] bg-[#0d0d0d] p-3"
                      >
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <p className="text-[10px] font-semibold uppercase tracking-widest text-[#555555]">
                            {toPlainText(s.title)}
                          </p>
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            {s.actionRequired && (
                              <span className="text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded border text-[#f59e0b] border-[#f59e0b]/20 bg-[#f59e0b]/5">
                                Action Required
                              </span>
                            )}
                            <span className="text-[9px] font-mono text-[#444444]">{s.urgencyDays}d</span>
                          </div>
                        </div>
                        <p className="text-sm text-[#a0a0a0]">{s.soWhat}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Required Actions */}
              {brief.requiredActions && brief.requiredActions.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-[#666666] mb-3">
                    Required Actions
                  </p>
                  <div className="flex flex-col gap-2">
                    {brief.requiredActions.map((action, i) => (
                      <div
                        key={i}
                        className="flex items-start gap-3 rounded-md border border-[#1a1a1a] bg-[#0d0d0d] p-3"
                      >
                        <span className="flex-shrink-0 mt-0.5 h-5 w-5 rounded-full bg-[#1a1a1a] border border-[#242424] flex items-center justify-center text-[10px] font-bold text-[#666666]">
                          {i + 1}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-[#f5f5f5]">{action.text}</p>
                          <div className="flex items-center gap-1.5 mt-1">
                            <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-[#1a1a1a] border border-[#242424] text-[#666666]">
                              {action.timeWindow}
                            </span>
                            {action.category && (
                              <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-[#1b7ff0]/5 border border-[#1b7ff0]/20 text-[#1b7ff0]">
                                {action.category}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Stats row */}
              <div className="flex items-center gap-4 pt-2 border-t border-[#1a1a1a]">
                <div className="flex items-center gap-1.5">
                  <BarChart2 size={11} className="text-[#444444]" />
                  <span className="text-[11px] text-[#555555]">
                    Health: <span className="text-[#a0a0a0] font-semibold">{brief.healthScore}</span>
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Layers size={11} className="text-[#444444]" />
                  <span className="text-[11px] text-[#555555]">
                    <span className="text-[#a0a0a0] font-semibold">{brief.signalCount}</span> signals processed
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <CheckSquare size={11} className="text-[#444444]" />
                  <span className="text-[11px] text-[#555555]">
                    <span className="text-[#a0a0a0] font-semibold">{brief.actionCount}</span> actions identified
                  </span>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function BriefingPage() {
  const [briefs, setBriefs] = useState<Brief[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState('');

  const fetchBriefs = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await fetch('/api/brief');
      if (!res.ok) throw new Error('failed');
      const data = await res.json();
      const rows: Record<string, unknown>[] = Array.isArray(data) ? data : (data.briefs ?? []);
      setBriefs(rows.map(mapBriefRow));
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBriefs();
  }, [fetchBriefs]);

  const handleGenerate = async () => {
    setGenerating(true);
    setGenerateError('');
    try {
      const res = await fetch('/api/brief/generate', { method: 'POST' });
      if (!res.ok) throw new Error('failed');
      await fetchBriefs();
    } catch {
      setGenerateError('Generation failed. Try again.');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#f5f5f5]">
      {/* Header */}
      <div className="sticky top-0 z-20 border-b border-[#1a1a1a] bg-[#0a0a0a]/95 backdrop-blur-sm px-6 py-4 flex items-center justify-between">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#666666] mb-0.5">
            Intelligence Briefs
          </p>
          <h1 className="text-lg font-semibold text-[#f5f5f5]">Brief Archive</h1>
        </div>
        <div className="flex items-center gap-3">
          {generateError && (
            <p className="text-xs text-[#e5463e]">{generateError}</p>
          )}
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="flex items-center gap-2 rounded-lg border border-[#1b7ff0]/30 bg-[#1b7ff0]/5 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-[#1b7ff0] transition-all hover:bg-[#1b7ff0]/10 hover:border-[#1b7ff0]/50 disabled:opacity-40"
          >
            {generating ? (
              <span className="h-3 w-3 animate-spin rounded-full border border-[#1b7ff0] border-t-transparent" />
            ) : (
              <Zap size={12} />
            )}
            Generate Today's Brief
          </button>
        </div>
      </div>

      <div className="px-6 py-6 max-w-4xl mx-auto">
        {loading ? (
          <div className="flex flex-col gap-3">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full" />)}
          </div>
        ) : error ? (
          <div className="rounded-lg border border-[#1a1a1a] p-8 text-center">
            <p className="text-sm text-[#666666] mb-3">Unable to load briefs</p>
            <button
              onClick={fetchBriefs}
              className="text-[11px] font-semibold uppercase tracking-wider text-[#1b7ff0] hover:underline"
            >
              Retry
            </button>
          </div>
        ) : briefs.length === 0 ? (
          <div className="rounded-lg border border-[#1a1a1a] p-10 text-center">
            <p className="text-sm text-[#444444] mb-3">No briefs generated yet</p>
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="text-[11px] font-semibold uppercase tracking-wider text-[#1b7ff0] hover:underline disabled:opacity-40"
            >
              Generate your first brief
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {briefs.map((brief, i) => (
              <BriefCard key={brief.id} brief={brief} defaultOpen={i === 0} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

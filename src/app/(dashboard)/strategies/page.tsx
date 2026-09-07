"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ChevronRight, Zap, LayoutGrid } from "lucide-react";
import type { Strategy, StrategyStatus } from "@/types/database";
import { toPlainText } from "@/lib/text";

// ─── Types ────────────────────────────────────────────────────────────────────

type StrategyRow = Strategy & {
  signal?: { id: string; title: string } | null;
};

type FilterTab = StrategyStatus;

const SEGMENTS: { value: FilterTab; label: string }[] = [
  { value: "considering", label: "Considering" },
  { value: "deciding", label: "Deciding" },
  { value: "decided", label: "Decided" },
];

// ─── Status badge ─────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<StrategyStatus, string> = {
  considering: "surf-2 text-muted-foreground hairline",
  deciding: "surf-3 text-foreground hairline-strong",
  decided: "badge-completed",
  archived: "surf-1 text-muted-foreground hairline",
};

function StatusBadge({ status }: { status: StrategyStatus }) {
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${STATUS_STYLES[status]}`}
    >
      {status}
    </span>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded surf-2 ${className ?? ""}`} />;
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

// ─── Row ──────────────────────────────────────────────────────────────────────

function StrategyRowItem({ strategy }: { strategy: StrategyRow }) {
  return (
    <div className="glass glass-sheen rounded-2xl overflow-hidden">
      <div className="relative z-10 flex items-center gap-4 px-5 py-4">
        <div className="flex-1 min-w-0">
          <Link
            href={`/strategies/${strategy.id}`}
            className="block text-[15px] font-medium text-foreground leading-snug truncate hover:underline"
          >
            {strategy.title}
          </Link>
          <div className="mt-1.5 flex items-center gap-2 text-[11px] text-muted-foreground">
            {strategy.signal ? (
              <Link
                href={`/signals?focus=${strategy.signal.id}`}
                className="inline-flex items-center gap-1 hover:text-foreground transition-colors truncate max-w-[18rem]"
                title={toPlainText(strategy.signal.title)}
              >
                <Zap size={11} className="flex-shrink-0" />
                <span className="truncate">From: {toPlainText(strategy.signal.title)}</span>
              </Link>
            ) : (
              <span className="inline-flex items-center gap-1">Manual</span>
            )}
          </div>
          {/* Below sm, the status + timestamp move here (under the title)
              instead of competing for width on the right with the chevron. */}
          <div className="sm:hidden mt-2 flex items-center gap-2">
            <StatusBadge status={strategy.status} />
            <span className="text-[11px] font-mono text-muted-foreground">
              {timeAgo(strategy.updated_at)}
            </span>
          </div>
        </div>

        <div className="hidden sm:flex items-center gap-4 flex-shrink-0">
          <StatusBadge status={strategy.status} />
          <span className="text-[11px] font-mono text-muted-foreground whitespace-nowrap">
            {timeAgo(strategy.updated_at)}
          </span>
        </div>

        <Link
          href={`/strategies/${strategy.id}`}
          className="flex-shrink-0 text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Open strategy"
          style={{ minWidth: 44, minHeight: 44, display: "flex", alignItems: "center", justifyContent: "center" }}
        >
          <ChevronRight size={16} />
        </Link>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function StrategiesPage() {
  const [strategies, setStrategies] = useState<StrategyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [filter, setFilter] = useState<FilterTab>("considering");

  const fetchStrategies = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await fetch("/api/strategies");
      if (!res.ok) throw new Error("failed");
      const data = await res.json();
      setStrategies(Array.isArray(data) ? data : []);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStrategies();
  }, [fetchStrategies]);

  const filtered = strategies.filter((s) => s.status === filter);

  const counts: Record<FilterTab, number> = {
    considering: strategies.filter((s) => s.status === "considering").length,
    deciding: strategies.filter((s) => s.status === "deciding").length,
    decided: strategies.filter((s) => s.status === "decided").length,
    archived: strategies.filter((s) => s.status === "archived").length,
  };

  return (
    <div className="min-h-screen text-foreground px-8 py-10">
      <div className="glass max-w-[1200px] mx-auto p-10">
        <div className="relative z-10">
          {/* Header */}
          <div className="mb-8">
            <p className="rule-label mb-3">
              Intelligence
            </p>
            <h1 className="display-hero text-foreground mb-2">
              Strategies
            </h1>
            <p className="text-sm text-muted-foreground">
              Recommendations derived from your signals.
            </p>
          </div>

          {/* Segmented tab bar + archived link — glass pills, per the
              concept. Scrolls below md (a forced 1/3 grid column is narrower
              than "CONSIDERING" + its count, which used to overlap the next
              label); at md+ it's an even 3-way split. */}
          <div className="glass-pill scroll-x-pane flex items-center gap-1 p-1 mb-8 flex-nowrap w-full md:w-fit">
            <div className="flex flex-nowrap md:grid md:grid-cols-3 gap-1">
              {SEGMENTS.map((seg) => {
                const count = counts[seg.value];
                const isActive = filter === seg.value;
                return (
                  <button
                    key={seg.value}
                    onClick={() => setFilter(seg.value)}
                    className={`flex-shrink-0 whitespace-nowrap rounded-full px-4 py-2 md:text-center text-[13px] font-semibold uppercase tracking-wider transition-colors ${
                      isActive
                        ? "glass-pill-active"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {seg.label}
                    {count > 0 && (
                      <span
                        className={`ml-1.5 ${
                          isActive ? "text-foreground/70" : "text-muted-foreground"
                        }`}
                      >
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            <button
              onClick={() => setFilter("archived")}
              className={`flex-shrink-0 rounded-full px-4 py-2 text-[13px] font-semibold uppercase tracking-wider transition-colors ${
                filter === "archived"
                  ? "glass-pill-active"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Archived
              {counts.archived > 0 && (
                <span className="ml-1.5 text-muted-foreground">
                  {counts.archived}
                </span>
              )}
            </button>
          </div>

          {/* Content */}
          {loading ? (
            <div className="flex flex-col gap-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="glass rounded-2xl px-5 py-4">
                  <Skeleton className="h-5 w-3/4 mb-2" />
                  <Skeleton className="h-4 w-1/3" />
                </div>
              ))}
            </div>
          ) : error ? (
            <div className="text-center py-16">
              <p className="text-sm text-muted-foreground mb-3">
                Unable to load strategies
              </p>
              <button
                onClick={fetchStrategies}
                className="text-[11px] font-bold uppercase tracking-wider text-foreground hover:underline"
              >
                Retry
              </button>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center text-center py-20">
              <div className="surf-2 rounded-2xl flex items-center justify-center mb-6" style={{ width: 96, height: 96 }}>
                <LayoutGrid size={36} className="text-muted-foreground" strokeWidth={1.5} />
              </div>
              <p className="text-sm font-semibold text-foreground mb-1.5">
                No {filter} strategies
              </p>
              <p className="text-[12px] text-muted-foreground max-w-xs">
                Generate one from a signal, or change the tab to see other strategies.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {filtered.map((strategy) => (
                <StrategyRowItem key={strategy.id} strategy={strategy} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

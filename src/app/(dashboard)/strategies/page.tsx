"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { Strategy, StrategyStatus } from "@/types/database";
import { toPlainText } from "@/lib/text";

/*
 * Strategies — rebuilt to the prototype's structure (components/redesign/
 * screens.tsx, the `area==='Strategies'` block): eyebrow + heading, status
 * tabs with counts, then a single reading-width panel of vx-simple-rows.
 *
 * The prototype held the detail inline. Here each row still links to
 * /strategies/[id], which is a real route with real handlers (status change,
 * outcome recording, decision framing) — collapsing it into this page would
 * have meant deleting working mutations.
 *
 * OMITTED from the prototype: the "DEC–0x" style id and the source name.
 * Strategies have no display id, and the signal's source is not returned by
 * /api/strategies. The originating signal title is real, so it stays.
 */

type StrategyRow = Strategy & {
  signal?: { id: string; title: string } | null;
};

const TABS: { value: StrategyStatus; label: string }[] = [
  { value: "considering", label: "Considering" },
  { value: "deciding", label: "Deciding" },
  { value: "decided", label: "Decided" },
  { value: "archived", label: "Archived" },
];

function timeAgo(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function StrategiesPage() {
  const [strategies, setStrategies] = useState<StrategyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [tab, setTab] = useState<StrategyStatus>("considering");

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

  const filtered = strategies.filter((s) => s.status === tab);

  return (
    <>
      <div className="vx-page-heading">
        <div>
          <span className="vx-eyebrow">FROM SIGNAL TO DIRECTION</span>
          <h1>Strategies</h1>
          <p>Understand the move before making the commitment.</p>
        </div>
      </div>

      <div className="vx-tabs">
        {TABS.map((t) => (
          <button key={t.value} aria-pressed={tab === t.value} onClick={() => setTab(t.value)}>
            {t.label}
            <span>{strategies.filter((s) => s.status === t.value).length}</span>
          </button>
        ))}
      </div>

      <div className="vx-split vx-focused">
        <section className="vx-panel">
          {loading ? (
            <div className="vx-empty"><h2>Loading strategies…</h2></div>
          ) : error ? (
            <div className="vx-empty">
              <h2>Couldn&apos;t load your strategies</h2>
              <button className="vx-btn" onClick={fetchStrategies}>Try again</button>
            </div>
          ) : filtered.length ? (
            filtered.map((s) => (
              <Link className="vx-simple-row" key={s.id} href={`/strategies/${s.id}`}>
                <span>
                  <small>{timeAgo(s.updated_at)}</small>
                  <strong>{toPlainText(s.title)}</strong>
                  <small>
                    {s.signal ? `From ${toPlainText(s.signal.title)}` : "Framed by you"}
                  </small>
                </span>
                <ChevronRight size={15} />
              </Link>
            ))
          ) : (
            <div className="vx-empty">
              <h2>No {tab} strategies</h2>
              <p>A strategy appears here when it reaches this stage.</p>
              <Link className="vx-btn" href="/signals">Review signals</Link>
            </div>
          )}
        </section>
      </div>
    </>
  );
}

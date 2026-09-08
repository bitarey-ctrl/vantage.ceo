"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Search, ChevronRight, Plus, Loader2 } from "lucide-react";
import type { Decision, BlindSpot, BlindSpotCategory, DecisionConfidence, DecisionLifecycle } from "@/types/database";
import DecisionForm from "@/components/decisions/DecisionForm";

/*
 * Decisions — rebuilt to the prototype's structure (components/redesign/
 * screens.tsx, the `area==='Decisions'` block), wired to real Supabase data.
 *
 * Prototype layout, kept: eyebrow + heading, status tabs with counts, and a
 * vx-split list/detail where the list hides once a decision is open. The
 * detail is a vx-document with THE CHOICE, a disclosure holding WHY NOW and
 * the known/uncertain pair, a blind-spot review, and an actions footer.
 *
 * Real API calls, all preserved:
 *   GET   /api/decisions?limit=100      the list
 *   GET   /api/decisions/:id            deep link
 *   POST  /api/decisions/:id/analyze    blind-spot analysis
 *   PATCH /api/decisions/:id            deadline and status mutations
 *   DecisionForm handles create and edit.
 *
 * OMITTED from the prototype: `owner` and `area` — the decisions table has
 * neither. Everything else maps to a real column: due -> deadline,
 * confidence -> confidence, known -> known_context, unknown ->
 * open_questions, risks -> blind_spots, analyzed -> blind_spots.length > 0.
 */

const CONFIDENCE_LABELS: Record<DecisionConfidence, string> = {
  confident: "Pretty sure — sanity check",
  torn: "Genuinely torn",
  exploring: "Just exploring",
};

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

const TABS: { key: DecisionLifecycle; label: string }[] = [
  { key: "open", label: "Open" },
  { key: "decided", label: "Decided" },
  { key: "archived", label: "Archived" },
];

function dateLabel(iso: string | null): string {
  if (!iso) return "No deadline";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "No deadline";
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}
function toDateInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
}

export default function DecisionsWorkspace({ initialSelectedId }: { initialSelectedId?: string }) {
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [tab, setTab] = useState<DecisionLifecycle>("open");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(initialSelectedId ?? null);
  const [detailOpen, setDetailOpen] = useState(Boolean(initialSelectedId));
  const [showCreate, setShowCreate] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState(false);
  const [notAnalyzable, setNotAnalyzable] = useState<string | null>(null);
  const [savingDeadline, setSavingDeadline] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  const load = useCallback(async () => {
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
    load();
  }, [load]);

  // Deep link: /decisions/:id renders this with initialSelectedId.
  useEffect(() => {
    if (!initialSelectedId) return;
    fetch("/api/decisions/" + initialSelectedId)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: Decision | null) => {
        if (!d) return;
        setDecisions((prev) => (prev.some((x) => x.id === d.id) ? prev : [d, ...prev]));
        setTab(d.status);
        setDetailOpen(true);
      })
      .catch(() => {});
  }, [initialSelectedId]);

  const selected = decisions.find((d) => d.id === selectedId) ?? null;

  const updateSelected = (patch: Partial<Decision>) => {
    setDecisions((prev) => prev.map((d) => (d.id === selectedId ? { ...d, ...patch } : d)));
  };

  const runAnalysis = async () => {
    if (!selected || analyzing) return;
    setAnalyzing(true);
    setAnalyzeError(false);
    setNotAnalyzable(null);
    try {
      const res = await fetch("/api/decisions/" + selected.id + "/analyze", { method: "POST" });
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
      const res = await fetch("/api/decisions/" + selected.id, {
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

  const setStatus = async (status: DecisionLifecycle) => {
    if (!selected || updatingStatus || selected.status === status) return;
    setUpdatingStatus(true);
    const prev = selected.status;
    updateSelected({ status });
    setTab(status);
    try {
      const res = await fetch("/api/decisions/" + selected.id, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error("failed");
    } catch {
      updateSelected({ status: prev });
      setTab(prev);
    } finally {
      setUpdatingStatus(false);
    }
  };

  const inTab = useMemo(
    () =>
      decisions.filter(
        (d) => d.status === tab && d.title.toLowerCase().includes(search.toLowerCase())
      ),
    [decisions, tab, search]
  );

  const spots = selected?.blind_spots ?? [];

  return (
    <>
      <div className="vx-page-heading">
        <div>
          <span className="vx-eyebrow">CLARITY BEFORE COMMITMENT</span>
          <h1>Decisions</h1>
          <p>Every call, its evidence, and what happens next.</p>
        </div>
        <button className="vx-btn vx-primary" onClick={() => setShowCreate(true)}>
          <Plus size={15} />New decision
        </button>
      </div>

      <div className="vx-tabs">
        {TABS.map((t) => (
          <button
            key={t.key}
            aria-pressed={tab === t.key}
            onClick={() => {
              setDetailOpen(false);
              setTab(t.key);
            }}
          >
            {t.label}
            <span>{decisions.filter((d) => d.status === t.key).length}</span>
          </button>
        ))}
      </div>

      <div className="vx-split vx-focused">
        <section className="vx-panel" hidden={detailOpen}>
          <label className="vx-search vx-inset">
            <Search size={15} />
            <input
              placeholder="Search decisions…"
              aria-label="Search decisions"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>

          {loading ? (
            <div className="vx-empty"><h2>Loading decisions…</h2></div>
          ) : error ? (
            <div className="vx-empty">
              <h2>Couldn&apos;t load your decisions</h2>
              <button className="vx-btn" onClick={load}>Try again</button>
            </div>
          ) : inTab.length ? (
            inTab.map((d) => (
              <button
                className={"vx-simple-row " + (selectedId === d.id ? "vx-selected" : "")}
                key={d.id}
                onClick={() => {
                  setSelectedId(d.id);
                  setDetailOpen(true);
                }}
              >
                <span>
                  <small>{CONFIDENCE_LABELS[d.confidence]}</small>
                  <strong>{d.title}</strong>
                  <small>{dateLabel(d.deadline)}</small>
                </span>
                <ChevronRight size={15} />
              </button>
            ))
          ) : (
            <div className="vx-empty">
              <h2>{search ? "No matching decisions" : "No " + tab + " decisions"}</h2>
              <p>
                {search
                  ? "Try another search or start a new decision."
                  : "A decision appears here when it reaches this stage."}
              </p>
              <button className="vx-btn" onClick={() => setShowCreate(true)}>New decision</button>
            </div>
          )}
        </section>

        {detailOpen && selected && (
          <article className="vx-panel vx-document">
            <div className="vx-detail-toolbar">
              <button className="vx-back" onClick={() => setDetailOpen(false)}>← All decisions</button>
              <span className="vx-tag">{selected.status}</span>
            </div>

            <div className="vx-reading">
              <div className="vx-reading-meta">
                <span>{CONFIDENCE_LABELS[selected.confidence]}</span>
                <span>{dateLabel(selected.deadline)}</span>
              </div>

              <h2>{selected.title}</h2>

              <div className="vx-decision-facts">
                <span className="vx-tag">{selected.status}</span>
                <label className="vx-select">
                  <input
                    type="date"
                    aria-label="Decision deadline"
                    value={toDateInput(selected.deadline)}
                    onChange={(e) => saveDeadline(e.target.value)}
                    disabled={savingDeadline}
                  />
                </label>
                {selected.category && <span>{selected.category}</span>}
              </div>

              <div className="vx-section-label">THE CHOICE</div>
              <p>{selected.description || "No description yet."}</p>

              <details className="vx-disclosure">
                <summary>Context &amp; supporting evidence<Plus size={15} /></summary>
                <div>
                  <div className="vx-section-label">WHY NOW</div>
                  <p>{selected.rationale || "Not recorded."}</p>
                  <div className="vx-outcome-grid">
                    <div>
                      <span className="vx-section-label">WHAT WE KNOW</span>
                      <p>{selected.known_context || "Not recorded."}</p>
                    </div>
                    <div>
                      <span className="vx-section-label">WHAT&rsquo;S UNCERTAIN</span>
                      <p>{selected.open_questions || "Not recorded."}</p>
                    </div>
                  </div>
                </div>
              </details>

              <div className="vx-section-label">BLIND SPOT REVIEW</div>
              {spots.length ? (
                spots.map((s, i) => (
                  <details className="vx-risk" key={i}>
                    <summary>
                      <span className="vx-tag">{s.severity}</span>
                      {CATEGORY_LABELS[s.category] ?? s.category}
                      <Plus size={14} />
                    </summary>
                    <p>{s.description}</p>
                  </details>
                ))
              ) : (
                <div className="vx-callout">
                  <p>
                    {notAnalyzable
                      ? notAnalyzable
                      : analyzeError
                      ? "The analysis failed. Try again."
                      : "Give this decision a second perspective before you commit."}
                  </p>
                  <button className="vx-btn" onClick={runAnalysis} disabled={analyzing}>
                    {analyzing ? <Loader2 size={15} className="vx-refreshing" /> : null}
                    {analyzing ? "Analysing…" : "Run blind-spot analysis"}
                  </button>
                </div>
              )}

              {selected.status === "decided" && selected.actual_outcome && (
                <div className="vx-callout">
                  <span className="vx-section-label">DECISION RECORDED</span>
                  <p>{selected.actual_outcome}</p>
                </div>
              )}

              <footer className="vx-actions">
                <button
                  className="vx-btn vx-primary"
                  disabled={updatingStatus}
                  onClick={() => setStatus(selected.status === "open" ? "decided" : "open")}
                >
                  {selected.status === "open" ? "Mark as decided" : "Reopen decision"}
                </button>
                <button className="vx-btn" onClick={() => setShowEdit(true)}>Edit</button>
                {selected.status !== "archived" && (
                  <button className="vx-btn" disabled={updatingStatus} onClick={() => setStatus("archived")}>
                    Archive
                  </button>
                )}
              </footer>
            </div>
          </article>
        )}
      </div>

      {showCreate && (
        <DecisionForm
          mode="create"
          onClose={() => setShowCreate(false)}
          onSaved={(decision) => {
            setShowCreate(false);
            setDecisions((prev) => [decision, ...prev]);
            setTab("open");
            setSelectedId(decision.id);
            setDetailOpen(true);
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
          onSaved={(decision) => {
            setShowEdit(false);
            setDecisions((prev) => prev.map((d) => (d.id === decision.id ? decision : d)));
          }}
        />
      )}
    </>
  );
}

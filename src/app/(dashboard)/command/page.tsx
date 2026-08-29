"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";

// ─── Types ────────────────────────────────────────────────────────────────────

type Tone = "urgent" | "soon" | "watch";

interface PriorityDecision {
  id: string;
  title: string;
  description: string | null;
  deadline: string | null;
  blindSpotCount: number;
}

interface AttentionItem {
  id: string;
  title: string;
  deadline: string | null;
  tone: Tone;
}

interface OperatingContext {
  focus: string | null;
  decisionVelocityDays: number | null;
}

interface SignalWithConsequence {
  id: string;
  signalId: string;
  title: string;
  category: string;
  soWhat: string;
  confidenceScore: number;
  createdAt: string;
}

interface DashboardData {
  priorityDecision: PriorityDecision | null;
  attention: AttentionItem[];
  operatingContext: OperatingContext;
  signalsWithConsequence: SignalWithConsequence[];
}

interface AdvisorRead {
  quote: string | null;
  sourceCount: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Same thresholds used on the decisions page: <3 days = urgent, <14 = soon.
function toneFor(deadline: string | null): Tone {
  if (!deadline) return "watch";
  const days = (new Date(deadline).getTime() - Date.now()) / 86400000;
  if (days < 3) return "urgent";
  if (days < 14) return "soon";
  return "watch";
}

function formatDueDate(deadline: string | null): string {
  if (!deadline) return "No deadline";
  const days = (new Date(deadline).getTime() - Date.now()) / 86400000;
  if (days < 0) return "Overdue";
  const label = new Date(deadline).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  return `Due ${label}`;
}

function formatShortDate(deadline: string | null): string {
  if (!deadline) return "Watch";
  return new Date(deadline).toLocaleDateString("en-US", { month: "short", day: "numeric" }).toUpperCase();
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

function confidenceLabel(score: number): string {
  if (score >= 70) return "High confidence";
  if (score >= 40) return "Medium confidence";
  return "Low confidence";
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CommandPage() {
  const router = useRouter();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshMsg, setRefreshMsg] = useState("");
  const [advisorRead, setAdvisorRead] = useState<AdvisorRead | null>(null);
  const [advisorReadLoading, setAdvisorReadLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/dashboard");
      if (res.ok) setData(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetched independently — a cache-miss triggers an LLM generation that can
  // take a few seconds, and it shouldn't hold up the rest of the page.
  const fetchAdvisorRead = useCallback(async () => {
    try {
      const res = await fetch("/api/advisor/read");
      if (res.ok) setAdvisorRead(await res.json());
    } finally {
      setAdvisorReadLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { fetchAdvisorRead(); }, [fetchAdvisorRead]);

  const handleRefresh = async () => {
    setRefreshing(true);
    setRefreshMsg("Fetching new signals — this takes ~10s");
    try {
      const res = await fetch("/api/signals/refresh", { method: "POST" });
      const body = await res.json().catch(() => ({})) as { signalsAdded?: number; error?: string };

      if (!res.ok) {
        setRefreshMsg(body.error ?? "Refresh failed");
      } else {
        const added = body.signalsAdded ?? 0;
        setRefreshMsg(added > 0 ? `${added} new signals fetched` : "No new signals found");
        const dashRes = await fetch("/api/dashboard");
        if (dashRes.ok) setData(await dashRes.json());
      }
    } catch {
      setRefreshMsg("Refresh failed. Check your connection.");
    } finally {
      setRefreshing(false);
    }
  };

  const priorityTone: Tone | null = data?.priorityDecision ? toneFor(data.priorityDecision.deadline) : null;

  return (
    <div className="px-8 py-10">
      <div className="mx-auto max-w-[1400px]">

        {/* ── Headline — concept `.headline`: hard two-line h1, live-chip ── */}
        <header className="cx-headline flex flex-wrap items-end justify-between gap-4" style={{ margin: '11px 0 27px' }}>
          <div>
            <p className="cx-eyebrow">
              COMMAND CENTER · {new Date().toLocaleDateString('en-US', { day: '2-digit', month: 'long', year: 'numeric' }).toUpperCase()}
            </p>
            <h1>
              The decision<br />in front of you.
            </h1>
            <p className="cx-headline-sub">
              Signals with consequence, ready to become an operating choice.
            </p>
          </div>
          <div className="flex flex-shrink-0 items-center gap-3">
            {refreshMsg && (
              <p className="text-xs text-muted-foreground">{refreshMsg}</p>
            )}
            <span className="cx-live-chip">
              <b>•</b> MONITORING LIVE
            </span>
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              aria-label="Refresh intelligence"
              title="Refresh intelligence"
              className="hairline surf-2 surf-hover flex h-9 w-9 items-center justify-center rounded-xl border text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
            >
              <RefreshCw size={14} className={refreshing ? "animate-spin brand-accent-text" : ""} />
            </button>
          </div>
        </header>

        {/* ── Loading ──────────────────────────────────────── */}
        {loading && (
          <div className="grid grid-cols-1 gap-[18px] min-[901px]:grid-cols-[1.5fr_.85fr]">
            <div className="glass h-[404px] animate-pulse rounded-[25px]" />
            <div className="glass h-[404px] animate-pulse rounded-[25px]" />
          </div>
        )}

        {!loading && data && (
          <>
            {/* ── command-grid: Priority Decision + Decision Pulse ── */}
            <div className="grid grid-cols-1 gap-[18px] min-[901px]:grid-cols-[1.5fr_.85fr]">

              {/* Priority Decision — the one red focal point of this view.
                  bloom-corner = concept `.priority:after`'s soft radial bloom. */}
              <article className="glass bloom-corner cx-priority relative overflow-hidden rounded-[25px] p-[27px_30px] min-h-[404px]">
                <div className="relative z-10">
                  {data.priorityDecision ? (
                    <>
                      <div className="flex items-center justify-between gap-[10px]">
                        <p className="cx-eyebrow" style={{ margin: 0 }}>PRIORITY DECISION</p>
                        <span
                          className="cx-tag"
                          style={priorityTone === "urgent" ? { color: 'var(--brand-accent)', borderColor: 'var(--brand-accent-border)' } : undefined}
                        >
                          {formatDueDate(data.priorityDecision.deadline)}
                        </span>
                      </div>

                      <h2 style={data.priorityDecision.description ? { marginBottom: 20 } : undefined}>
                        {data.priorityDecision.title}
                      </h2>

                      {data.priorityDecision.description && (
                        <p className="mb-8 max-w-xl text-[14px] leading-relaxed text-muted-foreground">
                          {data.priorityDecision.description}
                        </p>
                      )}

                      <div className="flex flex-wrap items-end justify-between gap-[10px]">
                        {/* 3-node decision-line — concept only ever glows the
                            first node (`:first-child`), regardless of real
                            progress state; kept the app's own real labels
                            (Blind spots scanned / Decision) instead of the
                            concept's generic "CONTEXT MAPPED" placeholder,
                            since blind-spot analysis is a real, distinct
                            feature worth naming accurately. */}
                        <div className="cx-decision-line">
                          <span>Flagged</span>
                          <span>Blind spots scanned</span>
                          <span>Decision</span>
                        </div>

                        <Link
                          href={`/decisions/${data.priorityDecision.id}`}
                          className="btn-primary flex-shrink-0 rounded-[15px] px-[18px] py-[14px] text-[11px] font-bold uppercase tracking-[0.08em] transition-all"
                        >
                          Review decision →
                        </Link>
                      </div>
                    </>
                  ) : (
                    <div className="flex h-full flex-col items-center justify-center py-14 text-center">
                      <p className="cx-eyebrow">Priority Decision</p>
                      <p className="max-w-xs text-sm text-muted-foreground">
                        No open decisions right now. Capture one from a signal, a strategy, or on its own.
                      </p>
                    </div>
                  )}
                </div>
              </article>

              {/* Decision Pulse */}
              <aside className="glass cx-pulse rounded-[25px] p-[26px]">
                <p className="cx-eyebrow" style={{ margin: 0 }}>DECISION PULSE</p>
                <h3>What needs your attention</h3>
                {data.attention.length === 0 ? (
                  <p className="py-6 text-center text-[13px] text-muted-foreground">
                    Nothing open right now.
                  </p>
                ) : (
                  <ul>
                    {data.attention.map((item) => (
                      <li key={item.id}>
                        {item.title}
                        <small>{formatShortDate(item.deadline)}</small>
                      </li>
                    ))}
                  </ul>
                )}
              </aside>
            </div>

            {/* ── lower-grid: Signals with Consequence + Operating Context ── */}
            <div className="mt-[18px] grid grid-cols-1 gap-[18px] min-[901px]:grid-cols-[1.5fr_.85fr]">

              {/* Concept's signals-card shows one static editorial paragraph;
                  the real app has a live list of mapped signals, which is the
                  actual point of the feature, so that list stays — restyled
                  with the concept's typographic values instead of replaced
                  with placeholder copy. */}
              <article className="glass cx-signals-card rounded-[25px] p-[25px_28px]">
                <div className="flex items-center justify-between gap-[10px]">
                  <div>
                    <p className="cx-eyebrow" style={{ margin: 0 }}>INCOMING INTELLIGENCE</p>
                    <h3>Signals with consequence</h3>
                  </div>
                  <Link href="/signals" className="cx-link flex-shrink-0">
                    VIEW ALL SIGNALS <b>→</b>
                  </Link>
                </div>

                {data.signalsWithConsequence.length === 0 ? (
                  <p className="py-10 text-center text-sm text-muted-foreground">
                    No signals with a mapped consequence yet. Analyse one from the Signals page.
                  </p>
                ) : (
                  <div>
                    {data.signalsWithConsequence.map((s) => (
                      <div key={s.id} className="border-b py-4" style={{ borderColor: 'var(--border)' }}>
                        <p style={{ color: '#fff', fontWeight: 600, marginBottom: 4 }}>{s.title}</p>
                        <p className="mb-1.5 text-[10px] font-mono uppercase tracking-wider text-tertiary">
                          {s.category} · {timeAgo(s.createdAt)} · {confidenceLabel(s.confidenceScore)}
                        </p>
                        <p className="cx-body-copy">{s.soWhat}</p>
                      </div>
                    ))}
                  </div>
                )}
              </article>

              <aside className="glass cx-context rounded-[25px] p-[25px_28px]">
                <p className="cx-eyebrow" style={{ margin: 0 }}>OPERATING CONTEXT</p>
                {/* "What we are optimizing" in the concept — switched to
                    "you" per the house voice rule (address the user, not
                    "we"/the company). */}
                <h3>What you&apos;re optimizing for</h3>
                <p className="cx-focus">
                  {data.operatingContext.focus
                    ? data.operatingContext.focus
                    : "No strategic priorities set yet — add them from your Profile."}
                </p>
                <div className="cx-metric">
                  <span>Decision velocity</span>
                  {data.operatingContext.decisionVelocityDays !== null ? (
                    <strong>{data.operatingContext.decisionVelocityDays} days</strong>
                  ) : (
                    <strong style={{ color: 'var(--muted-foreground)', fontSize: 13 }}>Not enough history yet</strong>
                  )}
                </div>
              </aside>
            </div>

            {/* Advisor's Read — a real feature the concept doesn't show at
                all; kept as its own row below the concept's two grids rather
                than dropped, since it has no equivalent slot to fold into. */}
            <div className="glass mt-[18px] rounded-[25px] p-6">
              <div className="relative z-10">
                <p className="rule-label">Advisor&apos;s Read</p>
                <div className="flex items-center py-4">
                  {advisorReadLoading ? (
                    <div className="flex w-full flex-col gap-2">
                      <div className="surf-2 h-4 w-full animate-pulse rounded" />
                      <div className="surf-2 h-4 w-3/4 animate-pulse rounded" />
                    </div>
                  ) : advisorRead?.quote ? (
                    <p className="display-font text-[1.15rem] leading-snug text-foreground">
                      &ldquo;{advisorRead.quote}&rdquo;
                    </p>
                  ) : (
                    <p className="text-[13px] leading-relaxed text-muted-foreground">
                      Once you have open decisions or analysed signals, your advisor&apos;s read will appear here.
                    </p>
                  )}
                </div>
                {!advisorReadLoading && advisorRead?.quote && (
                  <div className="flex items-center justify-between gap-3 border-t hairline pt-3">
                    <span className="text-[11px] text-muted-foreground">
                      Drawn from {advisorRead.sourceCount} connected signal{advisorRead.sourceCount === 1 ? "" : "s"}
                    </span>
                    <button
                      onClick={() => router.push("/advisor")}
                      className="flex-shrink-0 text-[10px] font-bold uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground"
                    >
                      Ask advisor →
                    </button>
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {!loading && !data && (
          <div className="glass rounded-[25px] p-10 text-center">
            <p className="text-sm text-muted-foreground">Could not load dashboard data. Try refreshing.</p>
          </div>
        )}
      </div>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, BarChart as BarChartIcon } from "lucide-react";
import { RadialBarChart, RadialBar } from "recharts";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Report {
  id: string;
  growth_score: number;
  risk_mgmt_score: number;
  opportunity_score: number;
  investor_ready_score: number;
  external_evaluation: string;
  strategies_accepted_30d: number;
  activity_note: string;
  created_at: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-[#1a1a1a] ${className ?? ""}`} />;
}

// ─── Gauge Chart ──────────────────────────────────────────────────────────────
// Uses two stacked RadialBarCharts: one grey background ring (full circle),
// one colored foreground ring (arc length proportional to value).

function GaugeChart({
  value,
  color,
  label,
}: {
  value: number;
  color: string;
  label: string;
}) {
  const clamped = Math.max(0, Math.min(100, value));
  // endAngle: 90° start, going clockwise (decreasing angle). 0% → same as start, 100% → -270°
  const endAngle = 90 - 3.6 * clamped;

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative" style={{ width: 110, height: 110 }}>
        {/* Background ring — full grey circle */}
        <RadialBarChart
          width={110}
          height={110}
          cx="50%"
          cy="50%"
          innerRadius={36}
          outerRadius={52}
          startAngle={90}
          endAngle={-270}
          data={[{ value: 100 }]}
        >
          <RadialBar dataKey="value" fill="#1a1a1a" />
        </RadialBarChart>

        {/* Foreground arc — spans the proportional angle */}
        {clamped > 0 && (
          <div className="absolute inset-0">
            <RadialBarChart
              width={110}
              height={110}
              cx="50%"
              cy="50%"
              innerRadius={36}
              outerRadius={52}
              startAngle={90}
              endAngle={endAngle}
              data={[{ value: 100 }]}
            >
              <RadialBar dataKey="value" fill={color} />
            </RadialBarChart>
          </div>
        )}

        {/* Score label in center */}
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-xl font-bold" style={{ color }}>
            {clamped}
          </span>
        </div>
      </div>
      <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[#555555]">
        {label}
      </span>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ReportPage() {
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState(false);
  const [generateError, setGenerateError] = useState("");

  const fetchReport = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await fetch("/api/report");
      if (!res.ok) throw new Error("failed");
      const data = await res.json();
      setReport(data ?? null);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  const handleGenerate = async () => {
    setGenerating(true);
    setGenerateError("");
    try {
      const res = await fetch("/api/report/generate", { method: "POST" });
      if (!res.ok) throw new Error("failed");
      setReport(await res.json());
    } catch {
      setGenerateError("Failed to generate report. Please try again.");
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
            Intelligence
          </p>
          <h1 className="text-lg font-semibold text-[#f5f5f5]">CEO Report</h1>
          <p className="text-xs text-[#444444] mt-0.5">
            AI-generated performance evaluation based on your 30-day activity
          </p>
        </div>
        {report && !loading && (
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="flex items-center gap-2 rounded-lg border border-[#242424] px-4 py-2 text-xs font-semibold uppercase tracking-wider text-[#a0a0a0] transition-all hover:border-[#CC1F1F]/40 hover:text-[#CC1F1F] hover:bg-[#CC1F1F]/5 disabled:opacity-40"
          >
            {generating ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <BarChartIcon size={12} />
            )}
            Regenerate
          </button>
        )}
      </div>

      <div className="px-6 py-6 max-w-3xl mx-auto flex flex-col gap-4">

        {/* ── Loading skeleton ── */}
        {loading && (
          <>
            <div className="rounded-lg border border-[#1a1a1a] bg-[#111111] p-8">
              <div className="flex justify-around">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="flex flex-col items-center gap-3">
                    <Skeleton className="w-[110px] h-[110px] rounded-full" />
                    <Skeleton className="h-2 w-20" />
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-lg border border-[#1a1a1a] bg-[#111111] p-5">
              <Skeleton className="h-3 w-32 mb-4" />
              <Skeleton className="h-3 w-full mb-2" />
              <Skeleton className="h-3 w-4/5" />
            </div>
            <div className="rounded-lg border border-[#1a1a1a] bg-[#111111]">
              <div className="px-5 py-4 border-b border-[#1a1a1a]">
                <Skeleton className="h-2 w-28" />
              </div>
              <div className="px-5 py-4">
                <Skeleton className="h-3 w-full mb-2" />
                <Skeleton className="h-3 w-3/4" />
              </div>
            </div>
          </>
        )}

        {/* ── Error ── */}
        {!loading && error && (
          <div className="rounded-lg border border-[#1a1a1a] p-8 text-center">
            <p className="text-sm text-[#666666] mb-3">Unable to load report</p>
            <button
              onClick={fetchReport}
              className="text-[11px] font-semibold uppercase tracking-wider text-[#CC1F1F] hover:underline"
            >
              Retry
            </button>
          </div>
        )}

        {/* ── Empty state ── */}
        {!loading && !error && !report && (
          <div className="rounded-lg border border-[#1a1a1a] bg-[#111111] p-12 text-center">
            <div className="flex justify-center mb-4">
              <div className="w-14 h-14 rounded-full bg-[#1a1a1a] flex items-center justify-center">
                <BarChartIcon size={22} className="text-[#444444]" />
              </div>
            </div>
            <p className="text-sm font-semibold text-[#f5f5f5] mb-1">
              Generate your CEO Report
            </p>
            <p className="text-xs text-[#555555] mb-6 max-w-xs mx-auto">
              VANTAGE will evaluate your 30-day decision-making activity and
              score your performance across four dimensions.
            </p>
            {generateError && (
              <p className="text-xs text-[#e5463e] mb-4">{generateError}</p>
            )}
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="inline-flex items-center gap-2 px-6 py-2.5 rounded-lg bg-[#CC1F1F] text-sm font-semibold text-white hover:bg-[#b01818] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {generating ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  Generating…
                </>
              ) : (
                "Generate Report"
              )}
            </button>
          </div>
        )}

        {/* ── Report content ── */}
        {!loading && !error && report && (
          <>
            {/* Gauges */}
            <div className="rounded-lg border border-[#1a1a1a] bg-[#111111] p-6">
              <div className="flex items-start justify-around">
                <GaugeChart
                  value={report.growth_score}
                  color="#34d399"
                  label="Growth"
                />
                <GaugeChart
                  value={report.risk_mgmt_score}
                  color="#CC1F1F"
                  label="Risk Mgmt"
                />
                <GaugeChart
                  value={report.opportunity_score}
                  color="#1b7ff0"
                  label="Opportunity"
                />
                <GaugeChart
                  value={report.investor_ready_score}
                  color="#f59e0b"
                  label="Investor Ready"
                />
              </div>
            </div>

            {/* External Evaluation */}
            {report.external_evaluation && (
              <div className="rounded-lg border border-[#1a1a1a] bg-[#111111] p-5">
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#555555] mb-3">
                  External Evaluation
                </p>
                <p className="text-sm text-[#c0c0c0] leading-relaxed italic">
                  &ldquo;{report.external_evaluation}&rdquo;
                </p>
              </div>
            )}

            {/* 30-Day Activity */}
            <div className="rounded-lg border border-[#1a1a1a] bg-[#111111]">
              <div className="px-5 py-4 border-b border-[#1a1a1a] flex items-center justify-between">
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#555555]">
                  30-Day Activity
                </p>
                <span className="text-[10px] font-bold text-[#34d399]">
                  {report.strategies_accepted_30d} strategies accepted
                </span>
              </div>
              <p className="px-5 py-4 text-sm text-[#a0a0a0] leading-relaxed">
                {report.activity_note}
              </p>
            </div>

            {/* Generated at */}
            <p className="text-[10px] text-[#333333] text-center font-mono pb-2">
              Generated{" "}
              {new Date(report.created_at).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </p>
          </>
        )}
      </div>
    </div>
  );
}

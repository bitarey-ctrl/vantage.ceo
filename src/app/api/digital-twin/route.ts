import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

interface RecentEntry {
  type: "signal" | "strategy";
  text: string;
  timestamp: string;
}

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // ── Fetch all data in parallel ─────────────────────────────────────────────
    const [decisionsRes, consequencesRes, strategiesRes] = await Promise.all([
      supabase
        .from("decisions")
        .select("id, category, title, rationale, confidence_score, urgency_level, emotional_context, created_at")
        .eq("profile_id", user.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("consequences")
        .select("id, status, created_at, signal:signals(title)")
        .eq("profile_id", user.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("strategies")
        .select("id, title, status, created_at")
        .eq("profile_id", user.id)
        .in("status", ["accepted", "rejected"])
        .order("created_at", { ascending: false }),
    ]);

    const decisions = decisionsRes.data ?? [];
    const consequences = consequencesRes.data ?? [];
    const strategies = strategiesRes.data ?? [];

    // ── Memory maturity (existing logic) ──────────────────────────────────────
    const signalAnalyses = consequences.length;
    const decisionsMade = strategies.length;
    const notes = 0;
    const memoryMaturityPercent = Math.min(100, signalAnalyses * 5 + decisionsMade * 15);
    const memoryEntries = signalAnalyses + decisionsMade;

    // ── dominant_categories ────────────────────────────────────────────────────
    const categoryCountMap = new Map<string, number>();
    for (const d of decisions) {
      const cat = d.category as string;
      categoryCountMap.set(cat, (categoryCountMap.get(cat) ?? 0) + 1);
    }
    const dominant_categories = [...categoryCountMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([category, count]) => ({ category, count }));

    // ── avg_confidence ────────────────────────────────────────────────────────
    const avg_confidence =
      decisions.length > 0
        ? Math.round(
            (decisions.reduce((sum, d) => sum + (d.confidence_score as number), 0) /
              decisions.length) *
              10
          ) / 10
        : null;

    // ── emotion_rate ──────────────────────────────────────────────────────────
    const emotion_rate =
      decisions.length > 0
        ? Math.round(
            (decisions.filter(
              (d) =>
                d.emotional_context &&
                (d.emotional_context as string).trim().length > 0
            ).length /
              decisions.length) *
              100
          )
        : 0;

    // ── avg_urgency (mode) ────────────────────────────────────────────────────
    const urgencyCountMap = new Map<string, number>();
    for (const d of decisions) {
      const u = d.urgency_level as string;
      urgencyCountMap.set(u, (urgencyCountMap.get(u) ?? 0) + 1);
    }
    const avg_urgency =
      urgencyCountMap.size > 0
        ? ([...urgencyCountMap.entries()].sort((a, b) => b[1] - a[1])[0][0])
        : null;

    // ── risk_profile ──────────────────────────────────────────────────────────
    let risk_profile: string;
    if (decisions.length < 3) {
      risk_profile = "Insufficient Data";
    } else if (
      avg_confidence !== null &&
      avg_confidence > 3.5 &&
      (avg_urgency === "high" || avg_urgency === "critical")
    ) {
      risk_profile = "High Conviction / Fast Mover";
    } else if (avg_confidence !== null && avg_confidence < 2.5) {
      risk_profile = "Cautious / Deliberate";
    } else if (emotion_rate > 50) {
      risk_profile = "Intuition-Led";
    } else {
      risk_profile = "Analytical / Systematic";
    }

    // ── decision_velocity (last 30 days) ──────────────────────────────────────
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const decision_velocity = decisions.filter(
      (d) => (d.created_at as string) >= thirtyDaysAgo
    ).length;

    // ── signal_responsiveness ─────────────────────────────────────────────────
    const signal_responsiveness =
      consequences.length > 0
        ? Math.round(
            (consequences.filter((c) => c.status === "accepted").length /
              consequences.length) *
              100
          )
        : 0;

    // ── pattern_summary (Claude call if >= 3 decisions) ───────────────────────
    let pattern_summary: string | null = null;
    if (decisions.length >= 3) {
      try {
        const decisionsText = decisions
          .slice(0, 10)
          .map(
            (d) =>
              `[${d.category as string}] "${d.title as string}" | Confidence: ${d.confidence_score as number}/5 | Urgency: ${d.urgency_level as string}${d.emotional_context ? ` | Emotion: ${d.emotional_context as string}` : ""}`
          )
          .join("\n");

        const response = await anthropic.messages.create({
          model: "claude-sonnet-4-5",
          max_tokens: 150,
          messages: [
            {
              role: "user",
              content: `Based on these decisions, summarize this CEO's decision-making pattern in exactly 2 sentences. Be specific and direct.\n\n${decisionsText}`,
            },
          ],
        });

        const text = response.content
          .filter((b) => b.type === "text")
          .map((b) => (b as { type: "text"; text: string }).text)
          .join("")
          .trim();

        pattern_summary = text || null;
      } catch (err) {
        console.error("[digital-twin] pattern_summary Claude call failed:", err);
      }
    }

    // ── Recent memory entries (existing logic) ────────────────────────────────
    const entries: RecentEntry[] = [];

    for (const c of consequences.slice(0, 5)) {
      const signalTitle =
        (c.signal as { title?: string } | null)?.title ?? "a signal";
      entries.push({
        type: "signal",
        text: `Analyzed signal: ${signalTitle}`,
        timestamp: c.created_at as string,
      });
    }

    for (const s of strategies.slice(0, 5)) {
      const verb = s.status === "accepted" ? "Accepted" : "Rejected";
      entries.push({
        type: "strategy",
        text: `${verb} strategy: ${s.title as string}`,
        timestamp: s.created_at as string,
      });
    }

    entries.sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    return NextResponse.json({
      memoryMaturityPercent,
      signalAnalyses,
      decisionsMade,
      notes,
      memoryEntries,
      recentEntries: entries.slice(0, 10),
      // New fields
      dominant_categories,
      avg_confidence,
      emotion_rate,
      avg_urgency,
      risk_profile,
      decision_velocity,
      signal_responsiveness,
      pattern_summary,
    });
  } catch (error) {
    console.error("[GET /api/digital-twin]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

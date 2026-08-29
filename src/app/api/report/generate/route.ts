import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { logEvent, EVENTS } from "@/lib/analytics/log-event";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = "claude-sonnet-4-5";

interface ReportJson {
  growth_score: number;
  risk_mgmt_score: number;
  opportunity_score: number;
  investor_ready_score: number;
  external_evaluation: string;
}

export async function POST() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const [profileRes, signals30dRes, strategies30dRes, decisions30dRes] = await Promise.all([
      supabase
        .from("profiles")
        .select("company_name, industry, company_stage")
        .eq("id", user.id)
        .single(),
      supabase
        .from("consequences")
        .select("*", { count: "exact", head: true })
        .eq("profile_id", user.id)
        .gte("created_at", thirtyDaysAgo),
      supabase
        .from("strategies")
        .select("status")
        .eq("profile_id", user.id)
        .gte("created_at", thirtyDaysAgo)
        .in("status", ["accepted", "rejected"]),
      supabase
        .from("decisions")
        .select("*", { count: "exact", head: true })
        .eq("profile_id", user.id)
        .gte("created_at", thirtyDaysAgo),
    ]);

    const profile = profileRes.data;
    const signals30d = signals30dRes.count ?? 0;
    const strategiesData = strategies30dRes.data ?? [];
    const strategies30d = strategiesData.length;
    const strategiesAccepted = strategiesData.filter((s) => s.status === "accepted").length;
    const decisions30d = decisions30dRes.count ?? 0;

    const message = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 600,
      messages: [
        {
          role: "user",
          content: `Generate a CEO performance report based on VANTAGE activity data:

Company: ${profile?.company_name ?? "Unknown"} | Industry: ${profile?.industry ?? "Unknown"} | Stage: ${profile?.company_stage ?? "Unknown"}
Last 30 days: ${signals30d} signals analyzed, ${strategies30d} strategy moves (${strategiesAccepted} accepted), ${decisions30d} decisions logged

Return JSON only — no markdown, no explanation, no code fences:
{
  "growth_score": <0-100>,
  "risk_mgmt_score": <0-100>,
  "opportunity_score": <0-100>,
  "investor_ready_score": <0-100>,
  "external_evaluation": "<2-3 sentences honest assessment from an experienced board member or investor>"
}`,
        },
      ],
    });

    const raw = message.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { type: "text"; text: string }).text)
      .join("");

    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json({ error: "Failed to parse report from AI" }, { status: 500 });
    }

    let parsed: ReportJson;
    try {
      parsed = JSON.parse(jsonMatch[0]) as ReportJson;
    } catch {
      return NextResponse.json({ error: "Failed to parse report from AI" }, { status: 500 });
    }

    const clamp = (n: unknown) =>
      Math.min(100, Math.max(0, Math.round(Number(n) || 0)));

    const { data, error: insertError } = await supabase
      .from("reports")
      .insert({
        profile_id: user.id,
        growth_score: clamp(parsed.growth_score),
        risk_mgmt_score: clamp(parsed.risk_mgmt_score),
        opportunity_score: clamp(parsed.opportunity_score),
        investor_ready_score: clamp(parsed.investor_ready_score),
        external_evaluation: parsed.external_evaluation ?? "",
        strategies_accepted_30d: strategiesAccepted,
        activity_note: `${signals30d} signals analyzed, ${strategies30d} strategy moves (${strategiesAccepted} accepted), ${decisions30d} decisions logged in the last 30 days.`,
      })
      .select()
      .single();

    if (insertError || !data) {
      const msg = insertError?.message ?? "Unknown database error";
      console.error("[report/generate] Insert failed:", msg);
      return NextResponse.json({ error: `Failed to save report: ${msg}` }, { status: 500 });
    }

    await logEvent(user.id, EVENTS.report_generated, { report_id: data.id });

    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    console.error("[POST /api/report/generate]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

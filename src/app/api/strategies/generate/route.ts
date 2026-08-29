import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { logEvent, EVENTS } from "@/lib/analytics/log-event";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = "claude-sonnet-4-5";

interface GenerateBody {
  consequenceId?: string;
  signalId?: string;
  signalTitle: string;
  soWhat?: string;
  signalContent?: string;
  actionRecommendation?: string;
}

interface StrategyJson {
  title: string;
  description: string;
  timeline_30d: string;
  timeline_90d: string;
  timeline_6m: string;
  cost_of_inaction: string;
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as GenerateBody;

    if (!body.signalTitle) {
      return NextResponse.json(
        { error: "signalTitle is required" },
        { status: 400 }
      );
    }

    // Get profile context
    const { data: profile } = await supabase
      .from("profiles")
      .select("company_name, industry")
      .eq("id", user.id)
      .single();

    const companyName = profile?.company_name ?? "your company";
    const industry = profile?.industry ?? "your industry";

    // Resolve signal_id — from consequence or direct signal
    let signalId: string | null = body.signalId ?? null;
    if (!signalId && body.consequenceId) {
      const { data: consequence } = await supabase
        .from("consequences")
        .select("signal_id")
        .eq("id", body.consequenceId)
        .eq("profile_id", user.id)
        .single();
      signalId = consequence?.signal_id ?? null;
    }

    const contextText = body.soWhat ?? body.signalContent ?? "";

    // Call Claude with correct model
    const message = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: `Based on this signal analysis for ${companyName} in ${industry}:

Signal: ${body.signalTitle}
Analysis: ${contextText}
Recommended Action: ${body.actionRecommendation ?? "Not specified"}

Generate a strategic recommendation. Follow these hard rules:

1. WRITE LIKE A HUMAN, NOT A CONSULTANT. Short sentences (under 20 words mostly). Simple words. Address the reader as "you", not as "${companyName}" or "the company". Banned jargon: "misaligned", "leverage", "synergy", "value proposition", "ecosystem", "north star", "go-to-market motion", "stakeholder", "operationally dated". Banned drama: "zombie", "death spiral", "validation window closes", "irreversible". Sound like a smart friend giving advice, not a McKinsey deck.

2. NO INVENTED NUMBERS. You do not have access to this company's revenue, pipeline, conversion rates, or customer data. Do not include specific dollar amounts, MRR figures, deal counts, percentages, or growth rates. Use qualitative language.

3. NO STARTUP CLICHÉS. Do not write "integrate AI", "raise funding", "accelerate roadmap", "form partnerships", "pivot the product". The recommendation must be a specific, concrete action this person could put on their calendar this week.

4. NO DRAMATIC LANGUAGE. No "zombie", "death spiral", "permanently lose", "irreversible", "validation window closes". Write like a senior strategy partner — calm, specific, qualified.

5. COST OF INACTION MUST BE PROPORTIONATE. Not every signal is existential. If ignoring this signal would realistically have minor impact, say so.

6. TIMELINES ARE OUTCOMES, NOT PREDICTIONS. Frame 30d/90d/6m as what the strategy would aim to produce, not as guaranteed forecasts. Use "could", "should be positioned to", "would expect to".

Return JSON only — no markdown, no explanation, no code fences:
{
  "title": "specific, actionable recommendation (max 80 chars)",
  "description": "2-3 paragraphs. Specific, executable, no invented numbers, no clichés.",
  "timeline_30d": "what this strategy aims to produce in 30 days — qualitative, no invented metrics",
  "timeline_90d": "90-day intended outcome — qualitative",
  "timeline_6m": "6-month intended outcome — qualitative",
  "cost_of_inaction": "what plausibly happens if ignored — proportionate to actual signal, no drama"
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
      return NextResponse.json(
        { error: "Failed to parse strategy from AI response" },
        { status: 500 }
      );
    }

    let parsed: StrategyJson;
    try {
      parsed = JSON.parse(jsonMatch[0]) as StrategyJson;
    } catch {
      return NextResponse.json(
        { error: "Failed to parse strategy from AI response" },
        { status: 500 }
      );
    }

    if (!parsed.title?.trim() || !parsed.description?.trim()) {
      return NextResponse.json(
        { error: "AI returned incomplete strategy" },
        { status: 500 }
      );
    }

    const { data: strategy, error: insertError } = await supabase
      .from("strategies")
      .insert({
        profile_id: user.id,
        signal_id: signalId,
        title: parsed.title.trim().slice(0, 80),
        description: parsed.description.trim(),
        timeline_30d: parsed.timeline_30d?.trim() ?? null,
        timeline_90d: parsed.timeline_90d?.trim() ?? null,
        timeline_6m: parsed.timeline_6m?.trim() ?? null,
        cost_of_inaction: parsed.cost_of_inaction?.trim() ?? null,
        status: "considering",
      })
      .select("id, title")
      .single();

    if (insertError || !strategy) {
      const msg = insertError?.message ?? "Unknown database error";
      console.error("[generate] Insert failed:", msg);
      return NextResponse.json(
        { error: `Failed to save strategy: ${msg}` },
        { status: 500 }
      );
    }

    await logEvent(user.id, EVENTS.strategy_generated, { strategy_id: strategy.id, signal_title: body.signalTitle });

    return NextResponse.json({
      success: true,
      strategy: { id: strategy.id, title: strategy.title },
    });
  } catch (error) {
    console.error("[POST /api/strategies/generate]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

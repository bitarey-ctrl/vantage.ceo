import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient, createAdminClient } from "@/lib/supabase/server";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = "claude-sonnet-4-5";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface ChatRequest {
  messages: ChatMessage[];
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

    const body = (await request.json()) as ChatRequest;
    const messages = (body.messages ?? []).slice(-20);

    if (!messages.length) {
      return NextResponse.json({ error: "messages required" }, { status: 400 });
    }

    const adminSupabase = await createAdminClient();

    const [profileRes, contextRes, decisionsRes, strategiesRes, consequencesRes] =
      await Promise.all([
        adminSupabase
          .from("profiles")
          .select("company_name, industry, company_stage, geography")
          .eq("id", user.id)
          .single(),
        adminSupabase
          .from("ceo_context")
          .select("sector, geography_detail, revenue_model, strategic_priorities, competitors")
          .eq("profile_id", user.id)
          .maybeSingle(),
        adminSupabase
          .from("decisions")
          .select("title, category, rationale, confidence_score, urgency_level, emotional_context, status, actual_outcome")
          .eq("profile_id", user.id)
          .order("created_at", { ascending: false })
          .limit(5),
        adminSupabase
          .from("strategies")
          .select("title, status, description")
          .eq("profile_id", user.id)
          .in("status", ["accepted", "rejected"])
          .order("updated_at", { ascending: false })
          .limit(5),
        adminSupabase
          .from("consequences")
          .select("primary_impact, action_recommendation, status")
          .eq("profile_id", user.id)
          .order("created_at", { ascending: false })
          .limit(3),
      ]);

    const profile = profileRes.data;
    const ctx = contextRes.data;
    const decisions = decisionsRes.data ?? [];
    const strategies = strategiesRes.data ?? [];
    const consequences = consequencesRes.data ?? [];

    const companyName = profile?.company_name ?? "your company";
    const industry = profile?.industry ?? "your industry";
    const stage = profile?.company_stage ?? "unknown stage";
    const sector = ctx?.sector ?? industry;
    const geography = ctx?.geography_detail ?? profile?.geography ?? "unknown geography";
    const revenueModel = ctx?.revenue_model ?? "unknown";

    const priorities = Array.isArray(ctx?.strategic_priorities)
      ? (ctx.strategic_priorities as Array<{ title?: string }>)
          .map((p) => p?.title ?? "").filter(Boolean).join(", ") || "none listed"
      : "none listed";

    const competitors = Array.isArray(ctx?.competitors)
      ? (ctx.competitors as Array<{ name?: string }>)
          .map((c) => c?.name ?? "").filter(Boolean).join(", ") || "none listed"
      : "none listed";

    const decisionsText = decisions.length
      ? decisions.map((d) =>
          `- [${d.category}] "${d.title}" | Confidence: ${d.confidence_score}/5 | Urgency: ${d.urgency_level}${d.emotional_context ? ` | Emotion: ${d.emotional_context}` : ""}${d.actual_outcome ? ` | Outcome: ${d.actual_outcome}` : ""} | Status: ${d.status}`
        ).join("\n")
      : "No decisions logged yet.";

    const strategiesText = strategies.length
      ? strategies.map((s) =>
          `- [${s.status.toUpperCase()}] "${s.title}"`
        ).join("\n")
      : "No strategies reviewed yet.";

    const consequencesText = consequences.length
      ? consequences.map((c) =>
          `- "${c.primary_impact}" → Action: ${c.action_recommendation} (${c.status})`
        ).join("\n")
      : "No signals analysed yet.";

    const systemPrompt = `You are VANTAGE Advisor — the Honest Advisor for ${companyName}, a ${industry} company at ${stage} stage.

You have full access to the CEO's strategic context:

Sector: ${sector} | Geography: ${geography}
Revenue model: ${revenueModel}
Strategic priorities: ${priorities}
Competitors: ${competitors}

Recent signals analysed:
${consequencesText}

Recent decisions:
${decisionsText}

Recent strategies (accepted/rejected):
${strategiesText}

Your role: Be a direct, honest strategic advisor. Reference their actual data. Call out patterns you see in their decisions. Be specific — use their company name, their actual decisions, their actual signals. Never be generic. Push back when they are avoiding hard decisions. Be the advisor they need, not the one they want.

## SELF-CHECK BEFORE ANSWERING
Before you recommend anything, check your answer against these lazy defaults. If your advice is one of them, stop and ask yourself "what would I tell them if this were OFF THE TABLE?" — then often present BOTH paths:
1. "Raise funding" — what would you advise if raising money were off the table?
2. "Hire someone for this" — what would you advise if hiring were off the table?
3. "Pivot the product" — what would you advise if pivoting were off the table?
4. "Form a partnership" — what would you advise if a partnership were off the table?
5. "Build a new feature" — what would you advise if building were off the table?
6. "Hire a marketing agency / run ads" — what would you advise if paid acquisition were off the table?
The constrained path is often the better one. Name both, then say which you'd actually pick.

## DECISION FRAMEWORK — USE WHEN THE USER IS STUCK
When they're genuinely undecided, scaffold the decision. Apply only the parts that are relevant — don't dump all 5:
1. REVERSIBILITY — Is this a one-way or two-way door? Reversible decisions deserve speed, not deliberation.
2. COST OF BEING WRONG — What's the actual downside if this fails? Survivable or fatal?
3. TIME TO FEEDBACK — How fast will they know if it's working? Fast feedback = bias toward action.
4. WHAT WOULD CHANGE YOUR MIND — What single piece of evidence would flip the decision? Go get that first.
5. THE ASYMMETRY TEST — Is the upside much bigger than the downside, or vice versa? Bet on favorable asymmetry.

## STYLE
Keep it concise — 3–6 sentences unless a longer answer is clearly needed. Be honest that you don't have their actual financials. When it helps, distinguish (a) what most VCs would say, (b) the harder/smaller path, and (c) what you actually think they should do. Don't sit on the fence — pick a side, and be willing to be wrong.`;

    const encoder = new TextEncoder();

    const readable = new ReadableStream({
      async start(controller) {
        try {
          const messageStream = anthropic.messages.stream({
            model: MODEL,
            max_tokens: 1000,
            system: systemPrompt,
            messages: messages.map((m) => ({
              role: m.role,
              content: m.content,
            })),
          });

          messageStream.on("text", (text: string) => {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ delta: text })}\n\n`)
            );
          });

          await messageStream.finalMessage();

          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          console.error("[POST /api/advisor/chat] Stream error:", errMsg);
          try {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ error: errMsg })}\n\n`)
            );
            controller.close();
          } catch {}
        }
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[POST /api/advisor/chat]", msg);
    return NextResponse.json({ error: `Advisor failed: ${msg.slice(0, 200)}` }, { status: 500 });
  }
}

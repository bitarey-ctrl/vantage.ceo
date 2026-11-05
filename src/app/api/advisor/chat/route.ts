import { NextRequest, NextResponse } from "next/server";
import { companyContextBlock, normaliseCompanyContext } from "@/lib/company-context/context";
import Anthropic from "@anthropic-ai/sdk";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { applyMemory, isMemoryField, memoryAppliedForTurn } from "@/lib/advisor/apply-memory";
import { ADVISOR_MAX_TOKENS, ADVISOR_MODEL, relayAdvisorStream, sse } from "@/lib/advisor/stream";
import { z } from "zod";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const chatRequest = z.object({
  messages: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(40000) })).min(1).max(300),
  // Stable id of the user turn being answered; a retry of the same turn reuses it, so memory is written at most once.
  turnId: z.string().regex(/^[A-Za-z0-9-]{8,64}$/).optional(),
});

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

    const parsed = chatRequest.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "This conversation could not be read. Nothing was sent." }, { status: 400 });
    }
    const turnId = parsed.data.turnId ?? null;
    const messages = parsed.data.messages.filter((m) => m.content.trim()).slice(-20);
    if (!messages.length || messages[messages.length - 1].role !== "user") {
      return NextResponse.json({ error: "There is no question to answer." }, { status: 400 });
    }

    const adminSupabase = await createAdminClient();

    const [profileRes, contextRes, decisionsRes, strategiesRes, consequencesRes] =
      await Promise.all([
        adminSupabase
          .from("profiles")
          .select("company_name, industry, company_stage, geography, business_model, revenue_range")
          .eq("id", user.id)
          .single(),
        adminSupabase
          .from("ceo_context")
          .select("sector, geography_detail, revenue_model, strategic_priorities, competitors, product_description, target_customer, top_priority, top_priority_other, additional_context, monthly_revenue_range, arr_band, avoided_decision")
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

    // One canonical company context (same contract as Signals, analysis and the Company page). It reads priorities
    // and competitors in every stored shape, so string-stored priorities are no longer dropped.
    const company = normaliseCompanyContext(user.id, profile, ctx);
    const companyName = profile?.company_name ?? "your company";
    const stage = profile?.company_stage ?? "unknown stage";

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

    const systemPrompt = `You are VANTAGE Advisor — the Honest Advisor for ${companyName}, at ${stage} stage.

The CEO's company context (what they told VANTAGE):

${companyContextBlock(company)}

Use what they sell, who buys and their priorities in every answer. When asked about their priorities or competitors, state the ones above exactly; never invent ones that are not listed. A suggestion that would read the same for any company like theirs is not worth sending. When their stated #1 priority and what they are actually asking about pull in different directions, say so plainly.

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

## REMEMBERING THINGS THEY TELL YOU
You keep their profile current yourself. When, in THIS message, the user states
something durable about their business that is new or changed against the
context above, you update it — no permission, no "would you like me to".

Two things must happen, both in the same reply:

1. SAY IT, in plain prose, inside your answer. One short sentence, in your own
   voice: "Noted — I've added Brex to your competitors." "Got it, I've switched
   your #1 priority to Fundraising." "I've made a note that your biggest
   customer renews in March." This sentence is the only thing they see, so it
   has to be accurate about what you changed.
2. END your reply with exactly one marker on its own final line, which the
   system reads and applies:

[[VANTAGE_MEMORY]]{"field":"<field>","value":"<value>","label":"<short human sentence>"}

Allowed fields, and nothing else:
- competitors          a company they compete with. One name. Appended to the list.
- top_priority         exactly one of: Growth, Retention, Pricing, Fundraising, Hiring, Other
- product_description  one or two sentences on what the product does
- target_customer      who they sell to
- arr_band             exactly one of: pre_seed, pre_1m, 1m_5m, 5m_20m, 20m_plus
- additional_context   anything durable that fits NONE of the above. One short
                       sentence, under 300 characters, written so it still makes
                       sense read cold in six months. Appended as a dated note —
                       it never overwrites what is already there.

Pick additional_context only as a last resort. If the fact is a competitor, a
priority, what they build, who they sell to, or their revenue band, it belongs
in that field — never as a note.

Rules, and they matter more than being helpful:
- DURABLE facts only — anything that would still change your advice weeks from
  now. "We just closed a Series A", "we now sell to hospitals", "our biggest
  customer is 40% of revenue and renews in March", "our head of engineering is
  on leave until April", "the board wants a plan by November" all qualify:
  commitments, constraints, concentrations and who is in which seat count just
  as much as commercial facts. A hypothetical, a question, a one-off, or
  something they are still deciding does NOT. When in doubt, emit nothing and
  say nothing.
- Record only what they actually said. Never add a year, a figure, a name or a
  date they did not state — if they said "March", the note says March.
- Only if it is NEW or CHANGED against the context above. Never restate what you
  were already told, and never write a note that repeats something already in
  their additional context.
- At most one marker per reply. Pick the most significant.
- No marker means no sentence. Never claim to have saved something you did not
  emit a marker for, and never emit a marker for something you did not say.
- "label" is a plain sentence naming what changed: "Ramp as a competitor",
  "your #1 priority is Fundraising".
- The marker itself is machine-read and stripped before display. Do not mention
  it, do not describe it, do not paste it into your prose.

## STYLE
Keep it concise: a direct answer, the reasoning that matters, and one next step — usually under 200 words, never more than about 450 unless they ask for depth. Finish every answer with a complete sentence; if the topic needs more, say what you would cover next instead of starting it. Be honest that you don't have their actual financials. When it helps, distinguish (a) what most VCs would say, (b) the harder/smaller path, and (c) what you actually think they should do. Don't sit on the fence — pick a side, and be willing to be wrong.`;

    const encoder = new TextEncoder();

    /*
     * The advisor states the update in its reply as it writes it, so the write
     * has to actually happen — and if it does not, the reader has already been
     * told it did. The marker is parsed off the finished message (a partial one
     * mid-stream is not valid JSON), applied, and the outcome is pushed down
     * the same stream as a final `memory` event. The client stays silent on
     * success — the prose already said it — and corrects the record on failure.
     */
    const MEMORY_MARKER = /\[\[VANTAGE_MEMORY\]\]\s*(\{[\s\S]*?\})\s*$/;

    async function applyFromReply(reply: string) {
      const match = reply.match(MEMORY_MARKER);
      if (!match) return null;

      let field: unknown;
      let value: unknown;
      let label: unknown;
      try {
        ({ field, value, label } = JSON.parse(match[1]) as Record<string, unknown>);
      } catch {
        return null; // malformed marker — nothing was promised we can honour
      }
      if (!isMemoryField(field) || typeof value !== "string" || !value.trim()) return null;

      // A retry of a turn whose memory was already written must not write it again.
      if (turnId && (await memoryAppliedForTurn(user!.id, turnId))) {
        return { ok: true, field, value, label: typeof label === "string" ? label : value, alreadyApplied: true };
      }
      const result = await applyMemory(user!.id, field, value, turnId);
      return {
        ok: result.ok,
        field,
        value: result.saved ?? value,
        label: typeof label === "string" ? label : value,
        error: result.error,
      };
    }

    const readable = new ReadableStream({
      async start(controller) {
        // The browser closing the connection (Stop, navigation, network loss) aborts the provider call: no hidden
        // spending, and an interrupted answer never reaches the memory write below.
        const clientGone = () => request.signal.aborted;
        const send = (value: unknown) => { if (clientGone()) return; try { controller.enqueue(encoder.encode(sse(value))); } catch { /* closed */ } };
        try {
          const messageStream = anthropic.messages.stream({
            model: ADVISOR_MODEL,
            max_tokens: ADVISOR_MAX_TOKENS,
            system: systemPrompt,
            messages: messages.map((m) => ({ role: m.role, content: m.content })),
          }, { signal: request.signal });
          await relayAdvisorStream({ stream: messageStream, send, clientGone, applyFromReply });
        } finally {
          try { controller.close(); } catch { /* already closed */ }
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
    console.error("[POST /api/advisor/chat]", error instanceof Error ? error.message.slice(0, 200) : "unknown");
    return NextResponse.json({ error: "The Advisor could not start. Nothing was changed. Try again in a moment." }, { status: 500 });
  }
}

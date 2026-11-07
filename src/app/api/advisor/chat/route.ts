import { NextRequest, NextResponse } from "next/server";
import { companyContextBlock, normaliseCompanyContext } from "@/lib/company-context/context";
import { decisiveLimitsBlock, finalCheckBlock } from "@/lib/company-context/constraints";
import { traceNumbers, unsupportedFiguresNote } from "@/lib/advisor/numbers";
import Anthropic from "@anthropic-ai/sdk";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { isMemoryField } from "@/lib/advisor/apply-memory";
import { commitMemory, readFieldVersions, supabaseMemoryOps, turnMatches } from "@/lib/advisor/memory-ops";
import { logEvent } from "@/lib/analytics/log-event";
import { loadSignalContext } from "@/lib/advisor/signal-context";
import { ADVISOR_MODEL, advisorMaxTokens, relayAdvisorStream, sse } from "@/lib/advisor/stream";
import { ProviderBudgetError, recordProviderUsage, reserveProviderCall } from "@/lib/ai/provider-budget";
import { z } from "zod";

// No automatic SDK retries: a retried request can be a second paid generation. Recovery is the explicit Retry.
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 0 });

const chatRequest = z.object({
  messages: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(40000) })).min(1).max(300),
  // The stored conversation and the id of the question being answered. A retry reuses both; memory updates are
  // written at most once per (account, conversation, question). Without them no memory update is written.
  turnId: z.string().regex(/^[A-Za-z0-9-]{8,64}$/).optional(),
  sessionId: z.string().uuid().optional(),
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
    const sessionId = parsed.data.sessionId ?? null;
    const messages = parsed.data.messages.filter((m) => m.content.trim()).slice(-20);
    if (!messages.length || messages[messages.length - 1].role !== "user") {
      return NextResponse.json({ error: "There is no question to answer." }, { status: 400 });
    }

    const adminSupabase = await createAdminClient();
    // Field versions before the answer is generated: a memory update proposed by this answer may only overwrite a
    // field that has not changed since (null if migration 042 is not installed → profile updates stay off).
    const [factVersions, signalContext] = await Promise.all([
      readFieldVersions(adminSupabase, user.id),
      // This account's signals with an explicit coverage state (read-only; no refresh, no paid research).
      loadSignalContext(adminSupabase, user.id),
    ]);

    const [profileRes, contextRes, decisionsRes, strategiesRes, consequencesRes] =
      await Promise.all([
        adminSupabase
          .from("profiles")
          .select("company_name, industry, company_stage, geography, business_model, revenue_range")
          .eq("id", user.id)
          .single(),
        adminSupabase
          .from("ceo_context")
          // The whole row, like every other caller: a column list here silently dropped business_facts (stated
          // constraints, dependencies, estimates) and the onboarding answer columns, so limits never reached the model.
          .select("*")
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

${decisiveLimitsBlock(company)}

Use what they sell, who buys and their priorities in every answer. When asked about their priorities or competitors, state the ones above exactly; never invent ones that are not listed. A suggestion that would read the same for any company like theirs is not worth sending. When their stated #1 priority and what they are actually asking about pull in different directions, say so plainly.

${signalContext.text}

When they ask about signals, use only the SIGNALS section: say which are relevant and why, cite each source link, and state the coverage line when it says stale or partial. Never say they have no signals unless the SIGNALS section says retrieval worked and none are linked. Never invent a signal. Do not offer to refresh or research — that is their choice in Signals.

Recent impact analyses:
${consequencesText}

Recent decisions:
${decisionsText}

Recent strategies (accepted/rejected):
${strategiesText}

Your role: Be a direct, honest advisor for THIS business. Reference their actual data. Call out patterns you see in their decisions. Push back when they are avoiding hard decisions, and challenge their assumptions when the evidence supports it — agreeing is not the goal.

## BUSINESS REASONING
- Work from how this business actually makes money and how a transaction flows through it. Do not assume it is software or SaaS, or where it operates, unless the context says so.
- Before suggesting a capability, check whether they already have it (their context, notes and confirmed facts). If they do, say what gap remains instead of recommending they build or buy it again.
- Before suggesting new operating responsibilities — lending, guarantees, escrow, inspections, payments handling, delivery, quality assurance — check their stated capabilities, costs, constraints and the unresolved requirements (licences, capital, liability, staff). If those are unknown, say what would have to be true first.
- Compare every option against the real alternative the customer or partner has. A lower commission does not beat a zero-fee direct deal; keeping a buyer on a marketplace is a different problem from ordinary churn when the risk is the two sides transacting directly.
- Keep these distinctions: making an introduction vs taking responsibility for payment, financing, quality or delivery; subscription vs commission revenue; positive contribution per sale vs enough cash to survive; a capability they might build later vs a step they can take now.
- Respect stated constraints. If the best answer breaks one, say so and give the best option inside it.
- No statistics, benchmarks, thresholds, deadlines or legal, regulatory or provider claims unless they are in their context or signals — then say where they came from. No invented urgency. No certain predictions.
- Every number you write (a percentage, an amount, a multiple, a range) must come from their details, the SIGNALS, or a calculation you show in the same sentence from their numbers. Never state commission rates, fee levels, price points, conversion rates or "typical" percentages from general knowledge, and do not swap one invented number for another.
- When there is no supported number, give the advice in words and name the number they should measure or tell you. If a made-up figure genuinely helps to explain a mechanism, start that sentence with "Illustration, not a benchmark:" and keep it to one.
- When a missing fact would change the answer, give the answer for each likely case in a sentence or two, then ask ONE focused question. Never recommend a commitment that rests on an assumption you made up.

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
Keep it concise: a direct answer, the reasoning that matters, and one next step — usually under 200 words, never more than about 450 unless they ask for depth. Finish every answer with a complete sentence; if the topic needs more, say what you would cover next instead of starting it. Be honest that you don't have their actual financials. Default shape: the direct answer first; two or three sentences of reasoning specific to their business; one practical next step; a caveat or a single focused question only when it matters. Open with the answer itself, not a dramatic preamble ("The hard truth", "Here's the thing", "Let's be brutally honest"). Plain words, short paragraphs, no headings in capitals, no flattery, no dramatic warnings, no unrequested long playbooks — give depth when they ask for it. Don't sit on the fence — pick a side, and be willing to be wrong.

${finalCheckBlock(company)}`.trimEnd();

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

      if (!turnId || !sessionId) return { ok: false, field, error: "This update was not saved: the question could not be identified." };
      const proposal = { field, value: value.trim(), label: typeof label === "string" ? label : value };
      const asked = messages[messages.length - 1].content;
      const outcome = await commitMemory({
        store: supabaseMemoryOps(adminSupabase),
        key: { profileId: user!.id, sessionId, turnId },
        proposal,
        // Ownership and binding: this account's conversation, and its latest question, with the same text.
        verifyTurn: async () => {
          const { data } = await adminSupabase.from("advisor_sessions").select("messages").eq("id", sessionId).eq("profile_id", user!.id).maybeSingle();
          return Boolean(data) && turnMatches(data!.messages, turnId, asked);
        },
        // The version of the field this answer was written against (snapshot taken before generation).
        basedOnVersion: factVersions ? factVersions[field] ?? 0 : null,
        onApplied: (f, saved) => logEvent(user!.id, "advisor_memory_saved", { field: f, value: saved, turn_id: turnId }),
      });
      return { ...outcome, label: outcome.label ?? proposal.label };
    }

    const readable = new ReadableStream({
      async start(controller) {
        // The browser closing the connection (Stop, navigation, network loss) aborts the provider call: no hidden
        // spending, and an interrupted answer never reaches the memory write below.
        const clientGone = () => request.signal.aborted;
        const send = (value: unknown) => { if (clientGone()) return; try { controller.enqueue(encoder.encode(sse(value))); } catch { /* closed */ } };
        try {
          // A lower cap via header is honoured only in the isolated test environment (length-limit test).
          const maxTokens = advisorMaxTokens(request.headers.get("x-test-max-tokens"));
          let slot: number | null;
          try {
            slot = reserveProviderCall("advisor", ADVISOR_MODEL, { inputBytes: Buffer.byteLength(systemPrompt, "utf8") + messages.reduce((a, m) => a + Buffer.byteLength(m.content, "utf8") + 8, 0), maxTokens });
          } catch (err) {
            // Test environment budget ceiling: the question is not sent; say so with the stream's normal error event.
            if (err instanceof ProviderBudgetError) { send({ error: { kind: "unavailable", message: "The test budget for AI answers is used up, so this question was not sent. Nothing was changed." } }); return; }
            throw err;
          }
          const messageStream = anthropic.messages.stream({
            model: ADVISOR_MODEL,
            max_tokens: maxTokens,
            system: systemPrompt,
            messages: messages.map((m) => ({ role: m.role, content: m.content })),
          }, { signal: request.signal });
          // Numbers in the answer must trace to what the model was given: their details, the signals and their own
          // messages (not the instructions above, whose examples would otherwise count as "supplied").
          const supplied = [companyContextBlock(company), signalContext.text, decisionsText, strategiesText, consequencesText, ...messages.filter((m) => m.role === "user").map((m) => m.content)].join("\n");
          await relayAdvisorStream({ stream: messageStream, send, clientGone, applyFromReply, onUsage: (u) => recordProviderUsage(slot, u),
            afterReply: (reply) => unsupportedFiguresNote(traceNumbers(reply.split("[[VANTAGE_MEMORY]]")[0], supplied).unsupported) });
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

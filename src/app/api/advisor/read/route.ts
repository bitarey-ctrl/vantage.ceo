import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { callClaude } from "@/lib/ai/claude";

function todayLocalDate(): string {
  return new Date().toISOString().slice(0, 10);
}

type CompanyContext = {
  industry: string | null;
  company_stage: string | null;
  business_model: string | null;
  revenue_range: string | null;
  geography: string | null;
  sector: string | null;
  sector_tags: string[] | null;
  strategic_priorities: unknown;
  competitors: unknown;
};

// strategic_priorities/competitors are stored as either a JSON array (typed
// onboarding flow) or a raw string (the profile page's own save handler
// writes this shape) — same inconsistency already handled in /api/dashboard.
// Normalize both here rather than assuming one shape.
function normalizeStringList(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === "string" && v.trim().length > 0);
  if (typeof value === "string" && value.trim().length > 0) return [value.trim()];
  return [];
}

function buildCompanyContextBlock(ctx: CompanyContext | null): string {
  if (!ctx) return "(no company profile on file)";

  const lines: string[] = [];
  if (ctx.industry) lines.push(`Industry: ${ctx.industry}`);
  if (ctx.sector) lines.push(`Sector: ${ctx.sector}`);
  const tags = normalizeStringList(ctx.sector_tags);
  if (tags.length) lines.push(`Sector tags: ${tags.join(", ")}`);
  if (ctx.company_stage) lines.push(`Company stage: ${ctx.company_stage}`);
  if (ctx.business_model) lines.push(`Business model: ${ctx.business_model}`);
  if (ctx.revenue_range) lines.push(`Revenue range: ${ctx.revenue_range}`);
  if (ctx.geography) lines.push(`Geography: ${ctx.geography}`);

  const priorities = normalizeStringList(ctx.strategic_priorities);
  if (priorities.length) lines.push(`Strategic priorities: ${priorities.join("; ")}`);

  const competitors = normalizeStringList(ctx.competitors);
  if (competitors.length) lines.push(`Named competitors: ${competitors.join(", ")}`);

  return lines.length ? lines.join("\n") : "(no company profile on file)";
}

function buildPrompt(
  companyContext: CompanyContext | null,
  decisions: { title: string; description: string | null }[],
  consequences: { so_what: string }[]
): string {
  const decisionsList = decisions.length
    ? decisions.map((d) => `- ${d.title}${d.description ? `: ${d.description}` : ""}`).join("\n")
    : "(none open right now)";
  const consequencesList = consequences.length
    ? consequences.map((c) => `- ${c.so_what}`).join("\n")
    : "(none yet)";
  const companyBlock = buildCompanyContextBlock(companyContext);

  return `You are VANTAGE's advisor. Write ONE short, sharp editorial line (max 18 words) that captures the single most important thing connecting the open decisions and recent signals below — the kind of thing a sharp friend would say to make someone see the real stakes.

Read the company context first and let it shape the observation. The same decision means something different at a pre-revenue startup than at a company with an established revenue range, and different again by industry and sector. Do not write a generic line that could apply to any company — ground it in what this specific company actually does and where it stands.

Rules:
- One sentence only. No preamble, no "Based on...".
- Plain language, short sentences. Ban jargon: leverage, synergy, ecosystem, paradigm, north star metric, value proposition, go-to-market motion, misaligned, stakeholder.
- Speak directly, as if to the person — never say "the user" or "the company".
- Do not invent numbers, names, or facts that aren't in the material below — including industry or company details not present in COMPANY CONTEXT.
- If nothing genuinely connects across items, make a sharp observation about the single most consequential one instead of forcing a connection.

## COMPANY CONTEXT
${companyBlock}

## OPEN DECISIONS
${decisionsList}

## RECENT SIGNALS WITH CONSEQUENCE
${consequencesList}

Return JSON only, no markdown: {"quote": "..."}`;
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

    const localDate = todayLocalDate();

    const { data: cached } = await supabase
      .from("advisor_reads")
      .select("quote, source_count")
      .eq("profile_id", user.id)
      .eq("local_date", localDate)
      .maybeSingle();

    if (cached) {
      return NextResponse.json({ quote: cached.quote, sourceCount: cached.source_count });
    }

    const [profileRes, ceoContextRes, decisionsRes, consequencesRes] = await Promise.all([
      supabase
        .from("profiles")
        .select("industry, company_stage, business_model, revenue_range, geography")
        .eq("id", user.id)
        .maybeSingle(),
      supabase
        .from("ceo_context")
        .select("sector, sector_tags, strategic_priorities, competitors")
        .eq("profile_id", user.id)
        .maybeSingle(),
      supabase
        .from("decisions")
        .select("title, description")
        .eq("profile_id", user.id)
        .eq("status", "open")
        .order("created_at", { ascending: false })
        .limit(5),
      supabase
        .from("consequences")
        .select("so_what")
        .eq("profile_id", user.id)
        .order("created_at", { ascending: false })
        .limit(5),
    ]);

    const companyContext: CompanyContext | null =
      profileRes.data || ceoContextRes.data
        ? {
            industry: profileRes.data?.industry ?? null,
            company_stage: profileRes.data?.company_stage ?? null,
            business_model: profileRes.data?.business_model ?? null,
            revenue_range: profileRes.data?.revenue_range ?? null,
            geography: profileRes.data?.geography ?? null,
            sector: ceoContextRes.data?.sector ?? null,
            sector_tags: ceoContextRes.data?.sector_tags ?? null,
            strategic_priorities: ceoContextRes.data?.strategic_priorities ?? null,
            competitors: ceoContextRes.data?.competitors ?? null,
          }
        : null;

    const decisions = decisionsRes.data ?? [];
    const consequences = consequencesRes.data ?? [];
    const sourceCount = decisions.length + consequences.length;

    if (sourceCount === 0) {
      return NextResponse.json({ quote: null, sourceCount: 0 });
    }

    const result = await callClaude<{ quote?: string }>(
      buildPrompt(companyContext, decisions, consequences),
      { maxTokens: 200 }
    );
    const quote = typeof result?.quote === "string" ? result.quote.trim() : "";

    if (!quote) {
      return NextResponse.json({ quote: null, sourceCount: 0 });
    }

    await supabase
      .from("advisor_reads")
      .upsert(
        { profile_id: user.id, local_date: localDate, quote, source_count: sourceCount },
        { onConflict: "profile_id,local_date" }
      );

    return NextResponse.json({ quote, sourceCount });
  } catch (error) {
    console.error("[GET /api/advisor/read]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

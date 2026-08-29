import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type Category = "Market" | "Competitors" | "Regulatory" | "Macro";

function deriveCategory(title: string): Category {
  const text = title.toLowerCase();
  if (text.includes("regulat") || text.includes("compliance") || text.includes("law") || text.includes("policy") || text.includes("ai act"))
    return "Regulatory";
  if (text.includes("competitor") || text.includes("rival") || text.includes("funding") || text.includes("startup") || text.includes("investment"))
    return "Competitors";
  if (text.includes("inflation") || text.includes("gdp") || text.includes("interest rate") || text.includes("economy") || text.includes("recession"))
    return "Macro";
  return "Market";
}

// Same thresholds used on the decisions page: <3 days = urgent, <14 days =
// soon, everything else (including no deadline) = watch.
type Tone = "urgent" | "soon" | "watch";

function toneFor(deadline: string | null): Tone {
  if (!deadline) return "watch";
  const days = (new Date(deadline).getTime() - Date.now()) / 86400000;
  if (days < 3) return "urgent";
  if (days < 14) return "soon";
  return "watch";
}

interface StrategicPriority {
  title?: string;
  description?: string;
}

// strategic_priorities is typed as StrategicPriority[], but the profile page's
// context editor saves it as a plain string — real rows can be either shape.
function extractFocus(raw: unknown): string | null {
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (Array.isArray(raw) && raw.length > 0) {
    const top = raw[0] as StrategicPriority;
    return top?.description?.trim() || top?.title?.trim() || null;
  }
  return null;
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

    const [
      openDecisionsRes,
      decidedDecisionsRes,
      ceoContextRes,
      consequencesRes,
    ] = await Promise.all([
      // Open decisions, soonest deadline first (nulls sink to the bottom) —
      // covers both the priority decision and the decision-pulse rows.
      supabase
        .from("decisions")
        .select("id, title, description, deadline, blind_spots")
        .eq("profile_id", user.id)
        .eq("status", "open")
        .order("deadline", { ascending: true, nullsFirst: false })
        .limit(4),
      // Decided decisions with a reviewed outcome — drives decision velocity.
      supabase
        .from("decisions")
        .select("created_at, outcome_reviewed_at")
        .eq("profile_id", user.id)
        .eq("status", "decided")
        .not("outcome_reviewed_at", "is", null),
      // CEO context — used for the "current focus" line.
      supabase
        .from("ceo_context")
        .select("strategic_priorities")
        .eq("profile_id", user.id)
        .maybeSingle(),
      // Most recent signals that already have a mapped consequence.
      supabase
        .from("consequences")
        .select("id, signal_id, so_what, confidence_score, created_at, signal:signals(title)")
        .eq("profile_id", user.id)
        .order("created_at", { ascending: false })
        .limit(4),
    ]);

    const openDecisions = openDecisionsRes.data ?? [];

    const priorityRow = openDecisions[0] ?? null;
    const priorityDecision = priorityRow
      ? {
          id: priorityRow.id as string,
          title: priorityRow.title as string,
          description: priorityRow.description as string | null,
          deadline: priorityRow.deadline as string | null,
          blindSpotCount: Array.isArray(priorityRow.blind_spots) ? priorityRow.blind_spots.length : 0,
        }
      : null;

    const attention = openDecisions.map((d) => ({
      id: d.id as string,
      title: d.title as string,
      deadline: d.deadline as string | null,
      tone: toneFor(d.deadline as string | null),
    }));

    // Decision velocity — average days between creation and the outcome
    // being reviewed, over decisions that have actually been decided.
    const decidedRows = decidedDecisionsRes.data ?? [];
    let decisionVelocityDays: number | null = null;
    if (decidedRows.length > 0) {
      const totalDays = decidedRows.reduce((sum, row) => {
        const created = new Date(row.created_at as string).getTime();
        const reviewed = new Date(row.outcome_reviewed_at as string).getTime();
        return sum + (reviewed - created) / 86400000;
      }, 0);
      decisionVelocityDays = Math.round((totalDays / decidedRows.length) * 10) / 10;
    }

    const focus = extractFocus(ceoContextRes.data?.strategic_priorities);

    const signalsWithConsequence = (consequencesRes.data ?? [])
      .map((row) => {
        const signal = row.signal as unknown as { title: string } | null;
        if (!signal?.title) return null;
        return {
          id: row.id as string,
          signalId: row.signal_id as string,
          title: signal.title,
          category: deriveCategory(signal.title),
          soWhat: row.so_what as string,
          confidenceScore: row.confidence_score as number,
          createdAt: row.created_at as string,
        };
      })
      .filter((row): row is NonNullable<typeof row> => row !== null);

    return NextResponse.json({
      priorityDecision,
      attention,
      operatingContext: {
        focus,
        decisionVelocityDays,
      },
      signalsWithConsequence,
    });
  } catch (error) {
    console.error("[GET /api/dashboard]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

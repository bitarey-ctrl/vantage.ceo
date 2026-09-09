import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ensureProfileExists } from "@/lib/auth/ensure-profile";

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

    // Every branch below is an .update() on profiles or ceo_context, and
    // updating zero rows is NOT an error — so without a profiles row this
    // route reported success for all nine steps while writing nothing. That
    // is what made the missing-profile bug invisible until a decision insert
    // hit the foreign key.
    try {
      await ensureProfileExists(user.id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[POST /api/onboarding/step] ensureProfileExists failed:", msg);
      return NextResponse.json({ error: msg }, { status: 500 });
    }

    const body = (await request.json()) as {
      step: number;
      data: Record<string, unknown>;
    };

    switch (body.step) {
      case 1: {
        const { companyName, industry } = body.data as {
          companyName: string;
          industry: string;
        };
        await supabase
          .from("profiles")
          .update({ company_name: companyName, industry })
          .eq("id", user.id);
        break;
      }
      case 2: {
        const { companyStage } = body.data as { companyStage: string };
        await supabase
          .from("profiles")
          .update({ company_stage: companyStage })
          .eq("id", user.id);
        break;
      }
      case 3: {
        const { teamSize } = body.data as { teamSize: string };
        // Stored in business_model — no team_size column in schema
        await supabase
          .from("profiles")
          .update({ business_model: teamSize })
          .eq("id", user.id);
        break;
      }
      case 4: {
        const { primaryGoal } = body.data as { primaryGoal: string };
        await supabase
          .from("ceo_context")
          .upsert(
            { profile_id: user.id },
            { onConflict: "profile_id", ignoreDuplicates: true }
          );
        await supabase
          .from("ceo_context")
          .update({
            strategic_priorities: [{ title: primaryGoal, weight: 10 }],
          })
          .eq("profile_id", user.id);
        break;
      }
      case 5: {
        const { risks } = body.data as { risks: string[] };
        await supabase
          .from("ceo_context")
          .upsert(
            { profile_id: user.id },
            { onConflict: "profile_id", ignoreDuplicates: true }
          );
        await supabase
          .from("ceo_context")
          .update({ sector_tags: risks })
          .eq("profile_id", user.id);
        break;
      }
      case 6: {
        const { decisionStyle } = body.data as { decisionStyle: string };
        await supabase
          .from("ceo_context")
          .upsert(
            { profile_id: user.id },
            { onConflict: "profile_id", ignoreDuplicates: true }
          );
        await supabase
          .from("ceo_context")
          .update({ revenue_model: decisionStyle })
          .eq("profile_id", user.id);
        break;
      }
      case 7: {
        const { riskTolerance } = body.data as { riskTolerance: string };
        await supabase
          .from("ceo_context")
          .upsert(
            { profile_id: user.id },
            { onConflict: "profile_id", ignoreDuplicates: true }
          );
        await supabase
          .from("ceo_context")
          .update({ avoided_decision: riskTolerance })
          .eq("profile_id", user.id);
        break;
      }
      case 8: {
        const { competitors } = body.data as { competitors: string[] };
        // Stored in the existing ceo_context.competitors shape
        // ([{ name, ... }]) so the competitor query builder reads it directly.
        const rows = (competitors ?? [])
          .map((name) => String(name).trim())
          .filter(Boolean)
          .map((name) => ({ name }));
        await supabase
          .from("ceo_context")
          .upsert(
            { profile_id: user.id },
            { onConflict: "profile_id", ignoreDuplicates: true }
          );
        await supabase
          .from("ceo_context")
          .update({ competitors: rows })
          .eq("profile_id", user.id);
        break;
      }
      case 9: {
        const { arrBand } = body.data as { arrBand: string };
        await supabase
          .from("ceo_context")
          .upsert(
            { profile_id: user.id },
            { onConflict: "profile_id", ignoreDuplicates: true }
          );
        await supabase
          .from("ceo_context")
          .update({ arr_band: arrBand })
          .eq("profile_id", user.id);
        break;
      }
      default:
        return NextResponse.json({ error: "Invalid step" }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[POST /api/onboarding/step]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

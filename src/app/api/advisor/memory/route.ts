import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/server";
import { ensureProfileExists } from "@/lib/auth/ensure-profile";
import { logEvent } from "@/lib/analytics/log-event";

/**
 * POST /api/advisor/memory — save one fact the advisor spotted into ceo_context.
 *
 * Only ever called from an explicit click. The advisor never writes here on
 * its own; it can only propose, and this route is the confirmation.
 *
 * The field allow-list is closed on purpose. Anything needing structured
 * input the user should set deliberately in Settings — risks, decision style —
 * is not reachable from here, so a confident-sounding model cannot quietly
 * reshape a profile.
 *
 * Enum-backed fields are validated against the same values the database
 * CHECK constraints use. A model that proposes "Growth!!" or "Series A" gets
 * a 400 rather than a constraint violation or, worse, a silent bad write.
 */

const TOP_PRIORITIES = ["Growth", "Retention", "Pricing", "Fundraising", "Hiring", "Other"] as const;
const ARR_BANDS = ["pre_seed", "pre_1m", "1m_5m", "5m_20m", "20m_plus"] as const;

const MAX_COMPETITORS = 10;

type Field = "competitors" | "top_priority" | "product_description" | "target_customer" | "arr_band";
const FIELDS: Field[] = [
  "competitors",
  "top_priority",
  "product_description",
  "target_customer",
  "arr_band",
];

/** Case/format-tolerant match onto an allowed value, or null. */
function matchEnum(value: string, allowed: readonly string[]): string | null {
  const norm = value.trim().toLowerCase().replace(/[\s-]+/g, "_");
  return allowed.find((a) => a.toLowerCase() === norm) ?? null;
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

    const body = (await request.json()) as { field?: string; value?: string };
    const field = body.field as Field | undefined;
    const rawValue = typeof body.value === "string" ? body.value.trim() : "";

    if (!field || !FIELDS.includes(field)) {
      return NextResponse.json(
        { error: `field must be one of: ${FIELDS.join(", ")}` },
        { status: 400 }
      );
    }
    if (!rawValue) {
      return NextResponse.json({ error: "value is required" }, { status: 400 });
    }

    await ensureProfileExists(user.id);
    const admin = await createAdminClient();

    // ceo_context may not exist yet for this profile.
    await admin
      .from("ceo_context")
      .upsert({ profile_id: user.id }, { onConflict: "profile_id", ignoreDuplicates: true });

    const { data: ctx } = await admin
      .from("ceo_context")
      .select("*")
      .eq("profile_id", user.id)
      .maybeSingle();

    let patch: Record<string, unknown>;
    let saved = rawValue;

    switch (field) {
      case "competitors": {
        const existing = Array.isArray(ctx?.competitors)
          ? (ctx!.competitors as { name?: string }[])
          : [];
        const names = existing.map((c) => (c?.name ?? "").trim()).filter(Boolean);
        if (names.some((n) => n.toLowerCase() === rawValue.toLowerCase())) {
          return NextResponse.json({ ok: true, alreadyPresent: true, field, value: rawValue });
        }
        if (names.length >= MAX_COMPETITORS) {
          return NextResponse.json(
            { error: `You already track ${MAX_COMPETITORS} competitors. Remove one in Profile first.` },
            { status: 400 }
          );
        }
        patch = { competitors: [...existing, { name: rawValue.slice(0, 80) }] };
        break;
      }
      case "top_priority": {
        const matched = matchEnum(rawValue, TOP_PRIORITIES);
        if (!matched) {
          return NextResponse.json(
            { error: `top_priority must be one of: ${TOP_PRIORITIES.join(", ")}` },
            { status: 400 }
          );
        }
        saved = matched;
        patch = { top_priority: matched, top_priority_other: null };
        break;
      }
      case "arr_band": {
        const matched = matchEnum(rawValue, ARR_BANDS);
        if (!matched) {
          return NextResponse.json(
            { error: `arr_band must be one of: ${ARR_BANDS.join(", ")}` },
            { status: 400 }
          );
        }
        saved = matched;
        patch = { arr_band: matched };
        break;
      }
      case "product_description":
        saved = rawValue.slice(0, 300);
        patch = { product_description: saved };
        break;
      case "target_customer":
        saved = rawValue.slice(0, 160);
        patch = { target_customer: saved };
        break;
    }

    const { error: updateError } = await admin
      .from("ceo_context")
      .update(patch)
      .eq("profile_id", user.id);

    if (updateError) {
      // 42703 / PGRST204: the column does not exist because migration 031 has
      // not been run. Say so instead of a generic failure.
      const missing = updateError.code === "42703" || updateError.code === "PGRST204";
      return NextResponse.json(
        {
          error: missing
            ? "This profile field does not exist yet — run migration 031."
            : updateError.message,
        },
        { status: 500 }
      );
    }

    await logEvent(user.id, "advisor_memory_saved", { field, value: saved });

    return NextResponse.json({ ok: true, field, value: saved });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[POST /api/advisor/memory]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

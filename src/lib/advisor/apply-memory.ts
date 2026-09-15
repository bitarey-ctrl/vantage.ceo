import { createAdminClient } from "@/lib/supabase/server";
import { ensureProfileExists } from "@/lib/auth/ensure-profile";
import { logEvent } from "@/lib/analytics/log-event";

/**
 * The advisor's memory write path.
 *
 * The advisor applies these updates itself, mid-reply, with no confirmation
 * click — the transparency is the sentence it writes ("Noted — I've added Brex
 * to your competitors"), not a UI card. That makes validation the only thing
 * standing between a confident-sounding model and a mangled profile, so it
 * stays strict:
 *
 *   - the field allow-list is closed. Anything the user should set
 *     deliberately in Settings — risks, decision style — is unreachable.
 *   - enum fields are checked against the same values the database CHECK
 *     constraints use, so a proposed "Growth!!" or "Series A" is refused here
 *     rather than becoming a constraint violation or a silent bad write.
 *   - the two append-style fields (competitors, additional_context) never
 *     overwrite. They add, and they stop at a cap.
 *
 * A refusal is returned, not thrown: the caller has already streamed the
 * reply that claims the update happened, and needs to correct the record.
 */

const TOP_PRIORITIES = ["Growth", "Retention", "Pricing", "Fundraising", "Hiring", "Other"] as const;
const ARR_BANDS = ["pre_seed", "pre_1m", "1m_5m", "5m_20m", "20m_plus"] as const;

const MAX_COMPETITORS = 10;
/* Roughly two pages. Past this the field stops being context and starts being
 * a diary, and it is on every advisor prompt. */
const MAX_ADDITIONAL_CONTEXT = 4000;
const MAX_NOTE = 300;

export type MemoryField =
  | "competitors"
  | "top_priority"
  | "product_description"
  | "target_customer"
  | "arr_band"
  | "additional_context";

export const MEMORY_FIELDS: MemoryField[] = [
  "competitors",
  "top_priority",
  "product_description",
  "target_customer",
  "arr_band",
  "additional_context",
];

export function isMemoryField(value: unknown): value is MemoryField {
  return typeof value === "string" && (MEMORY_FIELDS as string[]).includes(value);
}

export interface ApplyMemoryResult {
  ok: boolean;
  /** Present on success — the value as actually stored. */
  saved?: string;
  /** Success, but nothing changed: the value was already there. */
  alreadyPresent?: boolean;
  /** Present on failure — safe to show the user. */
  error?: string;
}

/** Read the competitor list out of either shape it is stored in. */
function normaliseCompetitors(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw
      .map((c) => (typeof c === "string" ? c : ((c as { name?: string })?.name ?? "")).trim())
      .filter(Boolean);
  }
  if (typeof raw === "string") {
    return raw.split(",").map((n) => n.trim()).filter(Boolean);
  }
  return [];
}

/** Case/format-tolerant match onto an allowed value, or null. */
function matchEnum(value: string, allowed: readonly string[]): string | null {
  const norm = value.trim().toLowerCase().replace(/[\s-]+/g, "_");
  return allowed.find((a) => a.toLowerCase() === norm) ?? null;
}

/**
 * Write one advisor-spotted fact into ceo_context. Validates, applies, logs.
 */
export async function applyMemory(
  profileId: string,
  field: MemoryField,
  rawValue: string
): Promise<ApplyMemoryResult> {
  const value = rawValue.trim();
  if (!value) return { ok: false, error: "value is required" };

  await ensureProfileExists(profileId);
  const admin = await createAdminClient();

  // ceo_context may not exist yet for this profile.
  await admin
    .from("ceo_context")
    .upsert({ profile_id: profileId }, { onConflict: "profile_id", ignoreDuplicates: true });

  const { data: ctx } = await admin
    .from("ceo_context")
    .select("*")
    .eq("profile_id", profileId)
    .maybeSingle();

  let patch: Record<string, unknown>;
  let saved = value;

  switch (field) {
    case "competitors": {
      /*
       * competitors is jsonb, but Profile saves this field as a plain
       * comma-separated string, so both shapes are live in the table. Reading
       * only the array shape would treat a string as empty and overwrite it —
       * silently dropping every competitor the user typed in Profile.
       */
      const names = normaliseCompetitors(ctx?.competitors);
      if (names.some((n) => n.toLowerCase() === value.toLowerCase())) {
        return { ok: true, saved: value, alreadyPresent: true };
      }
      if (names.length >= MAX_COMPETITORS) {
        return {
          ok: false,
          error: `You already track ${MAX_COMPETITORS} competitors. Remove one in Profile first.`,
        };
      }
      saved = value.slice(0, 80);
      patch = { competitors: [...names.map((name) => ({ name })), { name: saved }] };
      break;
    }
    case "additional_context": {
      const existing = typeof ctx?.additional_context === "string" ? ctx.additional_context : "";
      const note = value.slice(0, MAX_NOTE);
      // Same note twice — a repeated conversation, not new information.
      if (existing.toLowerCase().includes(note.toLowerCase())) {
        return { ok: true, saved: note, alreadyPresent: true };
      }
      // Dated, so the user can see what came from where and prune it later.
      const stamp = new Date().toISOString().slice(0, 10);
      const line = `${stamp} — ${note}`;
      const next = existing.trim() ? `${existing.trim()}\n${line}` : line;
      if (next.length > MAX_ADDITIONAL_CONTEXT) {
        return {
          ok: false,
          error: "Your additional context is full. Trim it in Profile and I'll add this next time.",
        };
      }
      saved = note;
      patch = { additional_context: next };
      break;
    }
    case "top_priority": {
      const matched = matchEnum(value, TOP_PRIORITIES);
      if (!matched) {
        return { ok: false, error: `top_priority must be one of: ${TOP_PRIORITIES.join(", ")}` };
      }
      saved = matched;
      patch = { top_priority: matched, top_priority_other: null };
      break;
    }
    case "arr_band": {
      const matched = matchEnum(value, ARR_BANDS);
      if (!matched) {
        return { ok: false, error: `arr_band must be one of: ${ARR_BANDS.join(", ")}` };
      }
      saved = matched;
      patch = { arr_band: matched };
      break;
    }
    case "product_description":
      saved = value.slice(0, 300);
      patch = { product_description: saved };
      break;
    case "target_customer":
      saved = value.slice(0, 160);
      patch = { target_customer: saved };
      break;
  }

  const { error: updateError } = await admin
    .from("ceo_context")
    .update(patch)
    .eq("profile_id", profileId);

  if (updateError) {
    // 42703 / PGRST204: the column does not exist because a migration has not
    // been run. Say which one instead of a generic failure.
    const missing = updateError.code === "42703" || updateError.code === "PGRST204";
    const migration = field === "additional_context" ? "032" : "031";
    return {
      ok: false,
      error: missing
        ? `This profile field does not exist yet — run migration ${migration}.`
        : updateError.message,
    };
  }

  await logEvent(profileId, "advisor_memory_saved", { field, value: saved });

  return { ok: true, saved };
}

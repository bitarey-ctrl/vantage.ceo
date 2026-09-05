import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { isInviteCodeUsable, normalizeInviteCode } from "@/lib/invites";

/**
 * Public read-only check: is this invite code valid and unused?
 *
 * This exists ONLY so /signup can decide which state to render. It never
 * consumes a code — redemption happens atomically inside /api/auth/signup at
 * the moment the account is created.
 *
 * The response is deliberately a bare { valid: boolean } with no detail about
 * whether a code is unknown vs. already redeemed, so this cannot be used to
 * enumerate which codes exist.
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as { code?: string };

    const code = normalizeInviteCode(body.code);
    if (!code) {
      // Malformed — reject without a database round trip.
      return NextResponse.json({ valid: false });
    }

    const admin = await createAdminClient();
    const valid = await isInviteCodeUsable(admin, code);

    return NextResponse.json({ valid, code: valid ? code : undefined });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[POST /api/auth/verify-invite]", msg);
    return NextResponse.json({ valid: false });
  }
}

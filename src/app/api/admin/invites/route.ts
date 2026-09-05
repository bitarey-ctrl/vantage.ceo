import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { generateInviteCode } from "@/lib/invites";

/**
 * Invite code management. Admin-only.
 *
 * Auth reuses the existing /admin mechanism exactly: an X-Admin-Password
 * header checked against process.env.ADMIN_PASSWORD, same as
 * /api/admin/stats. No new auth surface.
 */

export interface InviteCodeRow {
  id: string;
  code: string;
  note: string | null;
  created_at: string;
  used_at: string | null;
  used_by_email: string | null;
}

/** Returns a 401 response if the request is not authorised, else null. */
function unauthorized(request: NextRequest): NextResponse | null {
  const supplied = request.headers.get("X-Admin-Password");
  const expected = process.env.ADMIN_PASSWORD;

  if (!expected) {
    console.error("[admin/invites] ADMIN_PASSWORD is not set");
    return NextResponse.json({ error: "Admin access is not configured." }, { status: 500 });
  }
  if (supplied !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

/** GET — list every code, newest first. */
export async function GET(request: NextRequest) {
  const denied = unauthorized(request);
  if (denied) return denied;

  try {
    const admin = await createAdminClient();
    const { data, error } = await admin
      .from("invite_codes")
      .select("id, code, note, created_at, used_at, used_by_email")
      .order("created_at", { ascending: false })
      .limit(500);

    if (error) {
      console.error("[GET /api/admin/invites]", error.message);
      return NextResponse.json({ error: "Could not load invite codes." }, { status: 500 });
    }

    const codes = (data ?? []) as InviteCodeRow[];
    return NextResponse.json({
      codes,
      totals: {
        total: codes.length,
        used: codes.filter((c) => c.used_at).length,
        unused: codes.filter((c) => !c.used_at).length,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[GET /api/admin/invites]", msg);
    return NextResponse.json({ error: "Server error." }, { status: 500 });
  }
}

/** POST — mint one new code. Optional { note } to label who it is for. */
export async function POST(request: NextRequest) {
  const denied = unauthorized(request);
  if (denied) return denied;

  try {
    const body = (await request.json().catch(() => ({}))) as { note?: string };
    const note = body.note?.trim().slice(0, 200) || null;

    const admin = await createAdminClient();

    // Retry on the (vanishingly unlikely) unique collision rather than
    // returning an error the user would not understand.
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = generateInviteCode();
      const { data, error } = await admin
        .from("invite_codes")
        .insert({ code, note })
        .select("id, code, note, created_at, used_at, used_by_email")
        .single();

      if (!error) {
        return NextResponse.json({ code: data as InviteCodeRow }, { status: 201 });
      }
      if (error.code !== "23505") {
        console.error("[POST /api/admin/invites]", error.message);
        return NextResponse.json({ error: "Could not create a code." }, { status: 500 });
      }
      // 23505 = unique violation → loop and generate another.
    }

    return NextResponse.json(
      { error: "Could not generate a unique code. Please try again." },
      { status: 500 }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[POST /api/admin/invites]", msg);
    return NextResponse.json({ error: "Server error." }, { status: 500 });
  }
}

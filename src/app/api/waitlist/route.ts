import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

// Public endpoint — no auth. Visitors submitting the landing-page waitlist
// aren't logged in, so this writes via the service-role client (same pattern
// as /api/feedback) after validating and de-duplicating.

type WaitlistPayload = {
  fullName?: string;
  email?: string;
  industry?: string;
  role?: string;
  challenge?: string;
  source?: string;
};

// Where a request came from. The landing form is gone; requests now arrive
// from the invite gate on /signup. Whitelisted so the column cannot be
// stuffed with arbitrary input.
const SOURCES = new Set(["landing", "signup_gate"]);

export async function POST(request: NextRequest) {
  try {
    const payload = (await request.json()) as WaitlistPayload;

    const fullName = payload.fullName?.trim() ?? "";
    const email = payload.email?.trim().toLowerCase() ?? "";
    const industry = payload.industry?.trim() ?? "";
    const role = payload.role?.trim() ?? "";
    const challenge = payload.challenge?.trim() ?? "";

    // Only name and email are required. industry/role/challenge were
    // mandatory for the old 5-step landing form; the invite gate collects a
    // short version, and migration 025 made those columns nullable.
    if (!fullName || !email) {
      return NextResponse.json(
        { error: "Please enter your name and email." },
        { status: 400 }
      );
    }
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      return NextResponse.json(
        { error: "Please enter a valid work email." },
        { status: 400 }
      );
    }
    if (challenge.length > 1000) {
      return NextResponse.json(
        { error: "Please keep the last answer under 1000 characters." },
        { status: 400 }
      );
    }

    const admin = await createAdminClient();

    // Dedup on email — a repeat signup is a success, not an error, so the
    // visitor never sees a scary message for trying twice.
    const { data: existing } = await admin
      .from("waitlist_requests")
      .select("id")
      .eq("email", email)
      .limit(1)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ ok: true, existing: true });
    }

    const { error: insertError } = await admin.from("waitlist_requests").insert({
      full_name: fullName,
      email,
      industry: industry || null,
      role: role || null,
      challenge: challenge || null,
      source: SOURCES.has(payload.source ?? "") ? payload.source : "landing",
    });

    if (insertError) {
      // Unique-violation race: two rapid submits of the same email. Treat as
      // success rather than surfacing a DB error.
      if (insertError.code === "23505") {
        return NextResponse.json({ ok: true, existing: true });
      }
      console.error("[POST /api/waitlist] insert failed:", insertError.message);
      return NextResponse.json(
        { error: "We couldn’t save your request right now. Please try again." },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    console.error("[POST /api/waitlist]", message);
    return NextResponse.json(
      { error: "We couldn’t save your request right now. Please try again." },
      { status: 500 }
    );
  }
}

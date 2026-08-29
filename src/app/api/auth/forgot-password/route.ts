import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

interface ForgotBody {
  email?: string;
}

/**
 * Generates a password recovery link via admin API so we don't depend on
 * Supabase's default email template delivering. We log the link to the
 * server console in dev so you can copy/paste it directly into the browser
 * if the email never arrives.
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as ForgotBody;
    const email = body.email?.trim().toLowerCase();

    if (!email) {
      return NextResponse.json(
        { error: "Email is required." },
        { status: 400 }
      );
    }

    const admin = await createAdminClient();
    const origin =
      request.headers.get("origin") ||
      process.env.NEXT_PUBLIC_SITE_URL ||
      "http://localhost:3000";

    const { data, error } = await admin.auth.admin.generateLink({
      type: "recovery",
      email,
      options: {
        redirectTo: `${origin}/auth/callback?next=/reset-password`,
      },
    });

    if (error) {
      // Don't leak whether the account exists — return generic success.
      console.error("[forgot-password] generateLink failed:", error);
      return NextResponse.json({ ok: true });
    }

    // Log the recovery link to the server console — useful in dev if the
    // confirmation email doesn't arrive. In production Supabase emails it.
    if (data?.properties?.action_link) {
      console.log(
        `[forgot-password] Recovery link for ${email}:\n${data.properties.action_link}\n`
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[forgot-password] unexpected:", msg);
    return NextResponse.json({ ok: true });
  }
}

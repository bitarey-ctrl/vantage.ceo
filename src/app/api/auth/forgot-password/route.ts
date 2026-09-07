import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAppUrl } from "@/lib/env";

interface ForgotBody {
  email?: string;
}

/**
 * Sends a password recovery email.
 *
 * This route previously called `admin.auth.admin.generateLink()`, which
 * GENERATES a recovery link and returns it — it does NOT send an email. That
 * API exists for when you deliver the mail yourself. The route logged the link
 * to the server console and returned ok, so /forgot-password always claimed
 * "a recovery link has been sent" while the only copy of that link sat in the
 * Vercel runtime logs. Nobody could ever reset a password.
 *
 * `resetPasswordForEmail` sends Supabase's built-in recovery email.
 *
 * Note: `redirectTo` must appear in the project's Redirect URLs allow-list
 * (Supabase → Authentication → URL Configuration). If it does not, Supabase
 * discards it and falls back to Site URL — which is how these links end up
 * pointing at localhost.
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as ForgotBody;
    const email = body.email?.trim().toLowerCase();

    if (!email) {
      return NextResponse.json({ error: "Email is required." }, { status: 400 });
    }

    const supabase = await createClient();

    // Prefer the actual request origin — correct per-request and works across
    // preview deployments. The configured base URL is the fallback, and it
    // throws rather than silently pointing recovery links at localhost.
    const origin = request.headers.get("origin") || requireAppUrl("Password reset");

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${origin}/auth/callback?next=/reset-password`,
    });

    if (error) {
      // Still return ok so the response never reveals whether an account
      // exists — but log loudly, because this is now a real send failure
      // (bad config, SMTP rate limit) rather than a silent no-op.
      console.error("[forgot-password] resetPasswordForEmail failed:", error.message);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[forgot-password] unexpected:", msg);
    return NextResponse.json({ ok: true });
  }
}

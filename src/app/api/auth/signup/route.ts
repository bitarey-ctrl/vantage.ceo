import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { claimInviteCode, normalizeInviteCode, releaseInviteCode } from "@/lib/invites";
import { ensureProfileExists } from "@/lib/auth/ensure-profile";

interface SignupBody {
  email?: string;
  password?: string;
  fullName?: string;
  inviteCode?: string;
}

interface AdminUser {
  id: string;
  email?: string;
  email_confirmed_at?: string | null;
  user_metadata?: Record<string, unknown>;
}

/**
 * Server-side signup. Uses the service-role admin client to create users
 * with email_confirm: true so they can sign in immediately. This avoids
 * the "Email not confirmed" trap where users get stuck because the
 * Supabase confirmation email never arrives or lands in spam.
 *
 * If the email already exists but is unconfirmed, this endpoint will
 * confirm it and update the password — letting previously-stuck users
 * recover by simply signing up again with their original email.
 *
 * If the email exists AND is already confirmed, return an error directing
 * the user to sign in (don't silently overwrite a real account).
 *
 * Signup is OPEN — an invite code is not required.
 *
 * A code is still honoured if one is supplied, so links minted in
 * /admin/invites keep working and still record who redeemed them. An absent
 * or invalid code simply does not block the signup. When a code IS claimed it
 * is claimed atomically before the account is created and released again if
 * creation fails, so a failed signup never silently burns one.
 */
export async function POST(request: NextRequest) {
  // Hoisted so the outer catch can put a claimed code back if anything
  // throws unexpectedly between the claim and the account being created.
  let adminClient: Awaited<ReturnType<typeof createAdminClient>> | null = null;
  let claimedCode: string | null = null;

  try {
    const body = (await request.json()) as SignupBody;
    const email = body.email?.trim().toLowerCase();
    const password = body.password;
    const fullName = body.fullName?.trim() ?? "";

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required." },
        { status: 400 }
      );
    }
    if (password.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters." },
        { status: 400 }
      );
    }

    // Optional: only present when someone arrived via an /admin/invites link.
    const inviteCode = normalizeInviteCode(body.inviteCode);

    const admin = await createAdminClient();
    adminClient = admin;

    if (inviteCode) {
      // Atomic claim. Failing here is not fatal any more — signup is open, so
      // a stale or already-redeemed link should still let the person in.
      const claimed = await claimInviteCode(admin, inviteCode, email);
      if (claimed) {
        claimedCode = inviteCode;
      } else {
        console.log(`[signup] Invite code ${inviteCode} was not claimable — continuing without it.`);
      }
    }

    // Check if the email already exists (via paginated listUsers + filter).
    const { data: list, error: listErr } = await admin.auth.admin.listUsers({
      perPage: 1000,
    });
    if (listErr) {
      console.error("[signup] listUsers failed:", listErr);
      if (claimedCode) {
        await releaseInviteCode(admin, claimedCode);
        claimedCode = null;
      }
      return NextResponse.json(
        { error: "Server error. Please try again." },
        { status: 500 }
      );
    }

    const existing = (list.users as AdminUser[]).find(
      (u) => u.email?.toLowerCase() === email
    );

    if (existing) {
      // Already confirmed → block. Direct them to log in.
      if (existing.email_confirmed_at) {
        // No account was created, so the code must go back into circulation.
        if (claimedCode) {
          await releaseInviteCode(admin, claimedCode);
          claimedCode = null;
        }
        return NextResponse.json(
          {
            error:
              "An account with this email already exists. Please sign in instead.",
            existing: true,
          },
          { status: 409 }
        );
      }

      // Unconfirmed → repair. Confirm them and reset their password.
      const { error: updateErr } = await admin.auth.admin.updateUserById(
        existing.id,
        {
          password,
          email_confirm: true,
          user_metadata: {
            ...(existing.user_metadata ?? {}),
            full_name:
              fullName ||
              (existing.user_metadata?.full_name as string | undefined) ||
              "",
          },
        }
      );

      if (updateErr) {
        console.error("[signup] update existing unconfirmed failed:", updateErr);
        if (claimedCode) {
          await releaseInviteCode(admin, claimedCode);
          claimedCode = null;
        }
        return NextResponse.json(
          { error: "Could not complete signup. Please try again." },
          { status: 500 }
        );
      }

      // THIS is where accounts were being created with nothing behind them.
      // The profiles row comes from a trigger on INSERT INTO auth.users, and
      // the repair above is an UPDATE — so the trigger never fires and the
      // user ends up authenticated with no profile. Every later write keyed on
      // profile_id then fails (23503 on decisions) or silently no-ops
      // (onboarding's .update() calls, which is what hid it).
      try {
        await ensureProfileExists(existing.id);
      } catch (profileErr) {
        console.error("[signup] Could not ensure profile on recovery:", profileErr);
      }

      claimedCode = null;
      return NextResponse.json({
        ok: true,
        recovered: true,
        message: "Account confirmed. You can now sign in.",
      });
    }

    // Fresh signup → create with email already confirmed.
    const { error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });

    if (createErr) {
      console.error("[signup] createUser failed:", createErr);
      if (claimedCode) {
        await releaseInviteCode(admin, claimedCode);
        claimedCode = null;
      }
      return NextResponse.json(
        { error: createErr.message || "Could not create account." },
        { status: 400 }
      );
    }

    claimedCode = null;
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[signup] unexpected:", msg);
    if (adminClient && claimedCode) {
      await releaseInviteCode(adminClient, claimedCode);
    }
    return NextResponse.json({ error: "Server error." }, { status: 500 });
  }
}

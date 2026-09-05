import { randomInt } from "crypto";

/**
 * Invite codes.
 *
 * Canonical form: VNTG-7K4P-9RXM — a fixed prefix plus 8 random characters
 * in two groups of four.
 *
 * The alphabet deliberately omits 0/O, 1/I/L, and U so a code can be read
 * aloud or retyped without ambiguity. 30^8 ≈ 6.6e11 combinations, which makes
 * guessing one over HTTP impractical.
 */

const ALPHABET = "23456789ABCDEFGHJKMNPQRSTVWXYZ";
const BODY_LENGTH = 8;
const PREFIX = "VNTG";

/** Generate a new canonical code. Uses crypto randomness, not Math.random. */
export function generateInviteCode(): string {
  let body = "";
  for (let i = 0; i < BODY_LENGTH; i++) {
    body += ALPHABET[randomInt(ALPHABET.length)];
  }
  return `${PREFIX}-${body.slice(0, 4)}-${body.slice(4)}`;
}

/**
 * Normalize anything a human might type into the canonical form.
 *
 * Accepts "vntg7k4p9rxm", "VNTG-7K4P-9RXM", "7k4p 9rxm" — all become
 * "VNTG-7K4P-9RXM". Returns null if it cannot be a valid code, so callers
 * can reject malformed input before touching the database.
 */
export function normalizeInviteCode(raw: string | null | undefined): string | null {
  if (!raw) return null;

  const stripped = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const body = stripped.startsWith(PREFIX) ? stripped.slice(PREFIX.length) : stripped;

  if (body.length !== BODY_LENGTH) return null;
  for (const char of body) {
    if (!ALPHABET.includes(char)) return null;
  }

  return `${PREFIX}-${body.slice(0, 4)}-${body.slice(4)}`;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
type AdminClient = any;

/**
 * Read-only validity check. Does NOT consume the code.
 *
 * Only used so the signup page can decide which state to render. Redemption
 * always goes through claimInviteCode, which is the atomic path.
 */
export async function isInviteCodeUsable(
  admin: AdminClient,
  code: string
): Promise<boolean> {
  const { data, error } = await admin
    .from("invite_codes")
    .select("id")
    .eq("code", code)
    .is("used_at", null)
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[invites] validity check failed:", error.message);
    return false;
  }
  return Boolean(data);
}

/**
 * Atomically claim a code for an email.
 *
 * The `is("used_at", null)` filter is what makes this single-use: it compiles
 * to `update ... where code = $1 and used_at is null`, so a second concurrent
 * claim matches zero rows and loses. Never replace this with a read-then-write.
 *
 * Returns true only if this call is the one that took the code.
 */
export async function claimInviteCode(
  admin: AdminClient,
  code: string,
  email: string
): Promise<boolean> {
  const { data, error } = await admin
    .from("invite_codes")
    .update({ used_at: new Date().toISOString(), used_by_email: email })
    .eq("code", code)
    .is("used_at", null)
    .select("id");

  if (error) {
    console.error("[invites] claim failed:", error.message);
    return false;
  }
  return Array.isArray(data) && data.length === 1;
}

/**
 * Put a claimed code back into circulation.
 *
 * Called when the claim succeeded but account creation then failed — without
 * this, a failed signup would silently burn the user's only code.
 */
export async function releaseInviteCode(
  admin: AdminClient,
  code: string
): Promise<void> {
  const { error } = await admin
    .from("invite_codes")
    .update({ used_at: null, used_by_email: null })
    .eq("code", code);

  if (error) {
    // Worth shouting about: the code is now stuck as used with no account
    // behind it, and will need clearing by hand in the admin page.
    console.error(
      `[invites] FAILED TO RELEASE ${code} after a failed signup — it is now stuck as used:`,
      error.message
    );
  }
}

/**
 * Restricted intelligence pilot. This build serves signed-in features only to the account ids listed in
 * PILOT_ACCOUNT_IDS (comma-separated). It fails closed: no list, or a malformed id, admits nobody. Enforced on the
 * server where every signed-in route reads its user (createClient in @/lib/supabase/server), so pilot API operations
 * are refused for everyone else, not just hidden. Everyone keeps their normal access on the main VANTAGE address,
 * which runs the existing app.
 */
/** This build is the restricted pilot (the main address runs the existing app). */
export const PILOT_BUILD: boolean = true;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export const PILOT_DENIED =
  "This address is for a small invited pilot, and your account isn't part of it. Your account and data are unchanged. Keep using your usual VANTAGE address.";

export function pilotAccountIds(list: string | undefined = process.env.PILOT_ACCOUNT_IDS): Set<string> {
  const ids = (list ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  // One malformed entry voids the list: a typo must not be read as "everyone" or silently drop an account.
  return ids.every((id) => UUID.test(id)) ? new Set(ids) : new Set();
}

export function isPilotAccount(id: string | null | undefined): boolean {
  return Boolean(id) && pilotAccountIds().has(String(id).toLowerCase());
}

export class PilotAccessError extends Error {
  readonly code = 'pilot_not_allowed';
  readonly status = 403;
  constructor() { super(PILOT_DENIED); this.name = 'PilotAccessError'; }
}

/** Applied to every server-side getUser(): an account outside the pilot is treated as not signed in. */
export function guardUserResult<R extends { data: { user: { id: string } | null }; error: unknown }>(result: R): R {
  const user = result.data.user;
  if (user && !isPilotAccount(user.id)) return { ...result, data: { ...result.data, user: null }, error: new PilotAccessError() };
  return result;
}

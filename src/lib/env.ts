/**
 * Required-environment assertions.
 *
 * The signal gate discards aggressively by design, and it swallows per-batch
 * API errors so a transient failure cannot flood the feed. That combination
 * has a failure mode: with a missing or invalid ANTHROPIC_API_KEY, every batch
 * errors, every candidate is dropped, and the result is an empty feed that
 * looks exactly like a legitimately quiet day.
 *
 * These assertions make that case loud instead of silent.
 */

/** Needed by the gate itself. */
export const GATE_ENV = ["ANTHROPIC_API_KEY"] as const;

/** Needed by the full ingestion pipeline (gate + admin database writes). */
export const PIPELINE_ENV = [
  "ANTHROPIC_API_KEY",
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
] as const;

/**
 * The app's public base URL, for building absolute links (auth redirects,
 * email links).
 *
 * This used to be `process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"`
 * in three places. That fallback is why a misconfigured production deploy
 * silently generated links pointing at localhost instead of failing — the same
 * class of silent failure as the missing NEWSAPI_KEY.
 *
 * Two ways to fail, both loud:
 *   - neither variable is set at all
 *   - the value points at localhost while running in production
 */
export function requireAppUrl(context: string): string {
  const raw =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.NEXT_PUBLIC_SITE_URL?.trim();

  if (!raw) {
    throw new Error(
      `[env] ${context} needs an absolute base URL, but neither ` +
        `NEXT_PUBLIC_APP_URL nor NEXT_PUBLIC_SITE_URL is set. Set one to the ` +
        `public origin (e.g. https://www.vantage.ceo) in the Vercel project ` +
        `settings. Refusing to fall back to localhost — that produces links ` +
        `that look fine and are unreachable for everyone but you.`
    );
  }

  const url = raw.replace(/\/+$/, "");

  if (
    process.env.NODE_ENV === "production" &&
    /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(url)
  ) {
    throw new Error(
      `[env] ${context} resolved its base URL to ${url} while running in ` +
        `production. This is almost always a .env.local value copied into the ` +
        `hosting environment. Set NEXT_PUBLIC_APP_URL to the public origin.`
    );
  }

  return url;
}

/**
 * Throw if any of `names` is unset or blank.
 *
 * `context` names the caller so the error says what is broken, not just what
 * is missing.
 */
export function requireEnv(
  names: readonly string[],
  context: string
): void {
  const missing = names.filter((n) => !process.env[n]?.trim());

  if (missing.length > 0) {
    throw new Error(
      `[env] ${context} cannot run — missing required environment variable(s): ` +
        `${missing.join(", ")}. ` +
        `Set them in the Vercel project settings (or .env.local for local runs). ` +
        `Refusing to continue: without these the pipeline would silently produce ` +
        `an empty feed that is indistinguishable from a quiet news day.`
    );
  }
}

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

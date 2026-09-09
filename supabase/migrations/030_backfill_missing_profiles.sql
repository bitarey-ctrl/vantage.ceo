-- ─────────────────────────────────────────────────────────────
-- 030 — Repair auth users that have no profiles row
--
-- WHY
-- The profiles row is created by handle_new_user(), a trigger declared
-- AFTER INSERT ON auth.users. It therefore only fires for a genuinely new
-- auth row. Two populations were left without one:
--
--   1. Accounts predating the trigger. Three exist on production, created
--      2026-05-17, one of them a real confirmed account still in use.
--   2. Accounts repaired by /api/auth/signup, which calls updateUserById
--      when the email exists but is unconfirmed — an UPDATE, so no trigger.
--
-- The consequence is a foreign key violation (23503) on
-- decisions_profile_id_fkey the moment such a user creates a decision, and
-- silent no-ops everywhere onboarding uses .update().
--
-- The application now calls ensureProfileExists() before any profile-keyed
-- write, so new occurrences are impossible. This repairs the existing rows.
--
-- Idempotent and safe to re-run: it only inserts what is missing and never
-- touches a profile that already exists.
-- ─────────────────────────────────────────────────────────────

BEGIN;

INSERT INTO public.profiles (id, email, full_name)
SELECT
  u.id,
  u.email,
  COALESCE(u.raw_user_meta_data->>'full_name', '')
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL
ON CONFLICT (id) DO NOTHING;

COMMIT;

-- Verify — expect zero rows:
--   SELECT u.id, u.email FROM auth.users u
--   LEFT JOIN public.profiles p ON p.id = u.id
--   WHERE p.id IS NULL;

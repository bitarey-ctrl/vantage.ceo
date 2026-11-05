-- 041_advisor_memory_ops.sql
-- At-most-once Advisor memory updates per question, enforced by the database.
--
-- One row per (account, conversation, question). The primary key makes the claim atomic across server instances:
-- of two simultaneous requests for the same question, exactly one INSERT succeeds. The row stores the claimed
-- update itself, so a request that takes over after a crash re-applies THAT update, never a different one.
--
--   claimed   one request owns the write until lease_until
--   applied   written (terminal)
--   failed    the write failed for a temporary reason; a later request for the same question may retry it
--   rejected  the update was invalid (terminal; never retried)
--
-- Independent of 040. Additive only: one new table, owner-read RLS, writes by the service role only.
-- Rollback: DROP TABLE IF EXISTS public.advisor_memory_ops;

CREATE TABLE IF NOT EXISTS public.advisor_memory_ops (
  profile_id  uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  session_id  uuid NOT NULL REFERENCES public.advisor_sessions(id) ON DELETE CASCADE,
  turn_id     text NOT NULL CHECK (turn_id ~ '^[A-Za-z0-9-]{8,64}$'),
  field       text NOT NULL,
  value       text NOT NULL CHECK (length(value) <= 1000),
  label       text,
  status      text NOT NULL DEFAULT 'claimed' CHECK (status IN ('claimed', 'applied', 'failed', 'rejected')),
  claim_token uuid NOT NULL DEFAULT gen_random_uuid(),
  lease_until timestamptz NOT NULL,
  attempts    integer NOT NULL DEFAULT 1,
  saved_value text,
  error       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (profile_id, session_id, turn_id)
);

ALTER TABLE public.advisor_memory_ops ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "advisor_memory_ops: owner read" ON public.advisor_memory_ops;
CREATE POLICY "advisor_memory_ops: owner read" ON public.advisor_memory_ops FOR SELECT USING (auth.uid() = profile_id);

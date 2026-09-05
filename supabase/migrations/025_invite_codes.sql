-- ─────────────────────────────────────────────────────────────
-- 025 — Invite-code gated signup
--
-- Signup is invite-only: a valid, unused code is required to create
-- an account. Codes are single-use — redeeming one stamps used_at
-- and used_by_email, and it can never be redeemed again.
--
-- Single-use is enforced by a conditional UPDATE at redemption time
-- (see src/lib/invites.ts), NOT by a read-then-write:
--
--   update invite_codes set used_at = now(), used_by_email = $2
--   where code = $1 and used_at is null returning id
--
-- Zero rows back means the code was invalid or already taken. Two
-- simultaneous redemptions of the same code — only one wins.
-- ─────────────────────────────────────────────────────────────

create table if not exists invite_codes (
  id             uuid primary key default gen_random_uuid(),
  -- Canonical form: VNTG-XXXX-XXXX (see src/lib/invites.ts).
  code           text not null unique,
  -- Optional label so you can remember who a code was cut for.
  note           text,
  created_at     timestamptz not null default now(),
  -- Null until redeemed. These two columns ARE the single-use flag.
  used_at        timestamptz,
  used_by_email  text
);

create index if not exists idx_invite_codes_created on invite_codes(created_at desc);
-- Partial index: the admin list filters on unused far more than used.
create index if not exists idx_invite_codes_unused on invite_codes(created_at desc)
  where used_at is null;

alter table invite_codes enable row level security;

-- RLS on with NO policies = deny to anon and authenticated, allow to
-- service_role. Same collect-only pattern as waitlist_requests: every
-- read and write goes through an API route holding the service key, so
-- codes can never be enumerated with the public anon key.

-- ─────────────────────────────────────────────────────────────
-- waitlist_requests — relax three columns for the lightweight
-- "request access" form on the signup gate.
--
-- The original table mirrored the 5-field landing form, so industry,
-- role, and challenge were all NOT NULL. That form no longer exists
-- (the landing waitlist was removed), and this table currently has no
-- caller at all, so nothing depends on the old contract. The gate form
-- collects name + email + one optional line.
-- ─────────────────────────────────────────────────────────────

alter table waitlist_requests alter column industry  drop not null;
alter table waitlist_requests alter column role      drop not null;
alter table waitlist_requests alter column challenge drop not null;

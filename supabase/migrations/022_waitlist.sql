-- Waitlist for the public landing page.
-- Mirrors the 5 fields from the landing form
-- (fullName, email, industry, role, challenge) so the UI maps 1:1.

create table if not exists waitlist_requests (
  id          uuid primary key default gen_random_uuid(),
  full_name   text not null,
  email       text not null unique,
  industry    text not null,
  role        text not null,
  challenge   text not null,
  -- light provenance so you can see where signups came from later
  source      text default 'landing',
  created_at  timestamptz not null default now()
);

create index if not exists idx_waitlist_created_at on waitlist_requests(created_at desc);

alter table waitlist_requests enable row level security;

-- The waitlist form is PUBLIC — visitors are not logged in. So the write
-- path deliberately does NOT go through RLS as the anon user; the API route
-- uses the service-role (admin) client, same pattern as /api/feedback.
--
-- We enable RLS and grant NO anon/authenticated policies, which means:
--   * the anon key cannot read the list (emails stay private), and
--   * the anon key cannot write directly (all writes go through the API,
--     which validates + dedups first).
-- The service-role key bypasses RLS, so the API insert still works, and
-- an authenticated admin route reading via the service-role key also works.
--
-- RLS-on + no-policy = deny to anon/authenticated, allow to service_role.
-- This is the safe default for a collect-only table.

# Pilot release preparation — progress (2026-11-07, interrupted by usage limit)

No deployment, no production migration and no paid calls. Production was only read: the Vercel deployment list, plus
earlier read-only catalog queries.

## 1. Privacy-preserving rollback: findings so far (code reading only; not yet run)

- **Production build:** `1d31b02` (Vercel deployment `dpl_Dqiu6KijqifCXsdfV6VUv4YPAvyw`, branch main). It is an ancestor of the candidate `79fbc2d`, and its dependencies match.
- **Rolling back the code with 045 kept:** most paths in `1d31b02` look compatible with 045 kept in place.
  - **Writes:** all writes to `signal_triages`, and all inserts into `consequences`, go through the service role, which 045 doesn't restrict.
  - **User updates on `consequences`:** these touch only `status`, `responded_at` (respond route) and `brief_id` (brief generate). 045 still allows exactly those columns.
  - **Signal reads with the user session:** the analyse route, for example. These return only the account's own linked signals, which the old app's signal list already restricts to.
  - **042/044 trigger:** its function is `SECURITY DEFINER`, so profile saves made with the user session keep working.
- **Blocking privacy defect in `1d31b02`, independent of 045:**
  - **What:** `src/app/api/signals/raw/route.ts` has a fallback. If the triage read returns any error, it reads the 20 newest rows of `signals` through the **service-role client**, unscoped. The service role bypasses row-level security, so 045 cannot prevent this.
  - **When it fires:** a transient database error is enough. It would then expose company-specific signals across accounts.
  - **Conclusion:** `1d31b02` is **not** a privacy-preserving rollback target as it stands.
- **Proposed rollback build (not yet prepared):** `1d31b02` plus two changes:
  - the candidate's `signals/raw` route, which has no unscoped fallback;
  - the model ID `claude-sonnet-5-5`, because `1d31b02` uses `claude-sonnet-4-5`, which retires November 30.

  Changing `signals/raw` needs your explicit approval as a protected-route change.
- **Not yet done:**
  - run `1d31b02` against the isolated project (045 applied) with a dummy model key so no spend is possible, and exercise its pages and APIs;
  - write the recovery procedure: on a failed deploy, keep 040–045 and new data, and redeploy the patched rollback build.

## 2–5. Not started

- **2. Scheduled handler test.** Test `/api/cron/ingest` in the isolated environment with scripted providers: authorization, rotation, partial failures, persistence, cost controls. Then propose a pilot arrangement. A likely option is a small opt-out list so pilot accounts are refreshed by hand only; it needs approval because the cron route is protected.
- **3. Grants 90 vs 413.**
  - **Known so far:** 413 is `information_schema.role_table_grants` for `anon` and `authenticated` in `public`, counted per privilege. The definition behind the rehearsal's 90 still has to be recovered from the session transcript.
  - **Still to do:** compare per object, role, privilege, policy and function, using the same scope, between production and `prodbase`; then update `production-preflight.sql`.
- **4. Answer presentation.** Replace "[unsupported figure removed]" with a safe neutral rephrasing; for example, "Dropping to, say, 15%" becomes "Dropping to a different rate", with hedge words dropped and "N% of your buyers" becoming "some of your buyers". Then replay the nine captured answers through rendering, save and reload.
- **5. Pilot release package document.**

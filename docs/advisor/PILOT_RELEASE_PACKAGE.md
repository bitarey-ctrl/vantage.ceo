# Limited founder pilot — release package (prepared 2026-11-07; not deployed)

**What the pilot is:** company-aware research and decision support, under evaluation. It is **not** verified strategic
advice, automatic monitoring, a promise of revenue improvement, or a complete chief of staff.

Nothing here has been deployed or applied to production. Production was only read: deployment list, catalog and
statistics. No paid calls were made in this preparation.

## 1. What ships

| | |
|---|---|
| **App** | `codex/advisor-reliability` at the commit that adds this file. Its code is identical to `63fa731`; later commits are documents only. |
| **Migrations, in order** | `supabase/migrations/040_company_intelligence.sql`, `041_advisor_memory_ops.sql`, `042_company_fact_versions.sql`, `043_onboarding_answer_columns.sql`, `044_fact_version_null_fix.sql`, `045_signal_read_scope.sql` |
| **Rollback build** | branch `rollback/1d31b02-isolation` at `40da4ed`: today's production `1d31b02` plus two fixes (§4). Local only, not pushed. |
| **Preflight** | `docs/advisor/production-preflight.sql` (read-only) |
| **Production today** | Vercel project `vantage-ceo`, deployment `dpl_Dqiu6KijqifCXsdfV6VUv4YPAvyw` = `1d31b02` (main) |
| **Environment** | No new production variables. `PROVIDER_BUDGET_FILE`, `PROVIDER_CALL_LIMIT` and `ISOLATED_TEST` are test-only and must stay unset in production. |
| **Deadline** | Before 2026-11-30, when `claude-sonnet-4-5` (used by `1d31b02`) retires |

## 2. Verified production prerequisites (read-only, 2026-11-07)

- **The catalog matches the rehearsed baseline exactly.** Columns, functions (with their security flag), grants (per table and
  role), policies (including their expressions), RLS flags, triggers and indexes are hash-identical to the 2026-11-05
  production snapshot the rehearsal was built from. Constraints (102), service-role grants (31) and function EXECUTE
  grants (243) are hashed in the preflight as today's expected values.
- **No 040–045 object exists yet.** The pre-045 policy `signals: authenticated read` is present, as expected.
- **Grant totals reconciled.** These are the same grants, counted three ways, with no mismatch:
  - **413** = per privilege for `anon` and `authenticated`;
  - **59** = per table/role pair (59 × 7 = 413);
  - **90** = the rehearsal's count, which included `service_role`'s 31 pairs.
- **Two pre-existing conditions, unchanged by 040–044 and harmless:**
  - **Full table privileges for the API roles.** `anon` and `authenticated` hold all 7 table privileges on most public tables. This is the Supabase default: RLS limits rows, and the API offers no TRUNCATE. 045 removes these privileges on `signals`, `signal_triages` and `consequences`.
  - **Two elevated-rights functions are executable by API roles:** `handle_new_user()` (a trigger function) and `rls_auto_enable()` (an event trigger function). Postgres refuses direct calls to both.
- **Size (statistics, approximate):** about 17 accounts, 10 company contexts, 45 conversations, 311 signals, 237 links, 0 briefs.

## 3. Backup and restore

**Before the first migration (you do this):**
1. In the Supabase dashboard (production → Database → Backups), note whether daily backups or point-in-time recovery
   are available on your plan, and the time of the latest backup.
2. Take your own dump as well, to a private local file. Use `supabase db dump --db-url "<production connection string>" -f prod-schema.sql`
   and `supabase db dump --data-only --db-url "…" -f prod-data.sql`. The connection string holds your database password:
   paste it yourself and keep the files out of the repository.
3. Note the time. Everything saved after it exists only in the live database.

**Restoring:**
- Don't restore the whole database to undo a code or migration problem: that deletes everything founders saved after
  the backup.
- **Code problem:** roll the code back (§4) and keep the data.
- **One migration failed part-way:** each file runs in its own transaction, so it rolls back by itself. Fix the cause and re-run it.
- **A full restore is only for real data damage.** Restore into a **new** project first, export the rows written since the
  backup from the live project, and only then switch over.

## 4. Privacy-preserving rollback (verified on the isolated project)

- **Never run 045's rollback block.** It restores every signed-in user's read access to every account's company-specific signals.
- **Don't roll back to `1d31b02` unchanged.**
  - **Data leak:** its `/api/signals/raw` falls back, on any error reading the account's links, to reading the 20 newest signals of **all** accounts with the service-role key. RLS can't stop that, so 045 doesn't help.
  - **Lost conversation data:** its conversation save silently strips the newer message fields (turn ids, answer status, earlier attempts) when a conversation is saved again.
- **Rollback build `40da4ed`** = `1d31b02` plus:
  - the fallback removed (an error now returns "Your signals could not be loaded right now");
  - conversation saves keep unknown message fields.

  It typechecks and builds. It still uses `claude-sonnet-4-5`, so it is a fallback **only until November 30**; after
  that, recovery means fixing forward on the candidate.
- **`1d31b02` works with 045 kept.** Replayed as the Pact test account's database role on the isolated project (045 applied), inside a
  transaction that rolled back, all succeed:
  - its link and signal reads;
  - its signal read by id;
  - the consequence join;
  - the respond update (status and responded_at);
  - brief creation and its `brief_id` update;
  - a profile save through the 042/044 trigger.

  Isolation holds: the account sees only its own 5 of 18 signals. Negative controls are denied: editing another consequence column, and linking itself to another account's signal.
- **Recovery order that never exposes data or deletes new work:**
  1. Preflight (§2) and backup (§3).
  2. Apply 040–044. They only add things, and `1d31b02` ignores them.
  3. Deploy the candidate and run the smoke test (§7, steps 1–4).
     - **If the deploy fails here:** use Vercel's instant rollback to `1d31b02`. That is safe at this point, because 045 isn't applied and the state is the same as today.
  4. Apply 045. Rerun the smoke test, including another pilot account confirming it can't see the first account's signals.
  5. **After 045, never use instant rollback to `1d31b02`.** If the candidate must come out, deploy the rollback build `40da4ed`.
     To make that a one-click promotion, push the branch and create a preview deployment of it **before** release day. That is your decision; I haven't pushed anything.

## 5. Scheduled jobs: inert today, inert in the pilot

- **Finding:** Vercel Cron calls `/api/cron/ingest` (05:00 UTC) and `/api/cron/brief` (07:00 UTC) with **GET**, per Vercel's docs.
  Both routes accept only **POST**, in production `1d31b02` and in the candidate alike.
- **Verified locally:** on the candidate server, a request with Vercel Cron's user agent and the correct secret gets **405**, and the pipeline doesn't start.
- **Production:** 0 briefs exist, which fits this. Hobby keeps one hour of logs, so I couldn't confirm it from production logs.
- **What this means:** existing customers receive no scheduled ingest or brief today. Deploying the candidate changes nothing about
  scheduled behaviour: same `vercel.json`, same POST-only handlers. No job is disabled and no schedule changes. **The pilot is manual refresh only**, matching what really runs.
- **The scheduled handler, tested anyway (isolated project, real handler and database, scripted model and network,
  dummy model key, 3 accounts, 3 runs; `scripts/isolated/cron-scripted.mjs`):**
  - **Authorization:** missing or wrong secret → 401.
  - **Rotation:** least recently served first. An account whose shared-news check failed isn't marked served and leads the next run.
  - **Time budget:** with slow scripted calls, 1 of 3 accounts was deferred at 50 s and led the next run.
  - **Cost ceiling:** with a 1-call ledger, exactly 1 request was sent; the rest were refused before sending and stored as `failed`.
  - **Partial failures and persistence:** each account's run status (complete, partial or failed), the stages affected and the diagnostics were stored on its run record.
  - **Fixed in this pass:** a fully failed shared-news check used to skip the account's own source collection and store
    **no status**. Collection and storage now always happen. Collection failures were also described as "the
    connection to the AI service failed"; they now say "a source could not be reached".
- **Still limitations of the scheduled path:** these are why it stays out of the pilot.
  - When the time budget skips an account's source collection, the account gets no stored run, and the response says `complete`.
  - Survivor-to-account linking wasn't reached in this run; it is tested offline only.
  - The brief job wasn't run (it sends email).
  - Real providers have never been used on a schedule.
- **Turning scheduling on later** (a GET handler) is a separate change. It needs your approval and one evaluated real run.

## 6. Pilot cohort and access

- **Size:** 3–5 invited founders whom you know personally, each with one company, for two to three weeks.
  Pick businesses unlike each other, for example a subscription consumer brand, a two-sided marketplace and a small B2B service.
- **Access:**
  - you create or approve each account and send the link yourself;
  - existing accounts keep working (about 17, some of them yours or test accounts);
  - public sign-up stays as it is today unless you decide otherwise. Closing it is a Supabase Auth setting, and I haven't changed it.
- **In scope:**
  - their company details;
  - **manual** "Check for updates" (at most once an hour);
  - signals with what was and wasn't checked;
  - the Advisor;
  - decisions.
- **Out of scope:** scheduled monitoring, regulator coverage, email briefs, any paid-plan promise.
- **Cost (measured on Sonnet 5.5):**
  - one gate batch: $0.022;
  - one full manual refresh on Pact: $0.13 (8 calls);
  - one Advisor answer: about $0.013.

  Larger refreshes cost more, because there are more gate batches. Watch the Anthropic console weekly.
- **Data:** each founder's company details and conversations are private to their account (045). Shared news items are visible only through their own links.

## 7. Founder test (15 minutes) and feedback questions

**Before handing over (you, on production after deploy):**
1. Sign in as yourself, open Signals and check that the status line appears.
2. Ask the Advisor a question that involves one of your own numbers. It should repeat your number and not invent new ones.
3. Run one "Check for updates". It should finish with a truthful status ("Sources reached and checked" or "only partly checked").
4. Reload. The conversation and the status should still be there.
5. After 045, sign in to a second test account and confirm it shows none of the first account's signals.

**The founder's own test:**
1. Fill in your company details: what you sell, who buys, how you make money, one or two limits (for example cash or team).
2. Press "Check for updates" once. Read what was checked and what wasn't.
3. Open one signal. Is the reason it matters to you correct and specific?
4. Ask the Advisor about a real decision this month. Include one number you know.
5. Record the decision with what you'll watch for.

**Questions (after the first week):**
1. Which item told you something you didn't already know? Which one was wrong or irrelevant?
2. Did any answer state something about your business or market that you hadn't said and that isn't true?
3. When it said it couldn't give a number, was that helpful or frustrating?
4. Did you change, delay or confirm a decision because of it? Which, and why?
5. What would you need before you relied on it weekly?

## 8. Limitations to state plainly

- **Unsupported qualitative claims are not detected.** Example: "refurbished cameras, which are typically higher-ticket items". Only
  numbers are checked.
- **Unsupported figures are reworded, not judged.** "Dropping to, say, 15%" is delivered as "Dropping to a different rate…", with a note
  saying a figure was removed. Checked by replaying the nine captured answers through rendering, save and reload.
  The rule can't judge whether the remaining advice is still sound.
- **Evaluation coverage is small:**
  - nine real Advisor answers (7 clean on raw reasoning, 1 with a qualitative claim, 1 partial);
  - one real gate batch, with 1 of 2 survivors weak;
  - no evaluation of thinking or effort settings.
- **The gate's relevance judgement can let weak items through.** Each account's assessment is the second check.
- **Assessment calls aren't schema-constrained,** so they can still fail to parse. That failure is reported as "partial".
- **No scheduled monitoring, no regulator coverage, no email briefs** (§5).
- **Minor:** "Reached N sources" counts a source refused for monitoring; older headlines keep `&#039;`.

## 9. Decisions only you can make

1. Approve the release: run the preflight and take the backup, apply 040–044, deploy the candidate, then apply 045. All before November 30.
2. Push `rollback/1d31b02-isolation` and create its preview deployment before release day, so the safe rollback is one click.
3. Choose the 3–5 founders. Decide whether to close public sign-up during the pilot.

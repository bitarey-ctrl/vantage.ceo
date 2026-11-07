# Limited founder pilot — release package (corrected 2026-11-07; nothing deployed or applied)

**What the pilot is:** company-aware research and decision support, under evaluation. It is not verified strategic
advice, automatic monitoring, a promise of revenue improvement, or a complete chief of staff.

## 1. Exact builds

| | Commit | Notes |
|---|---|---|
| **Release candidate** | `codex/advisor-reliability`, the commit that adds this file | Its code is identical to `8a2b72a`; later commits are documents only. Local; not pushed. |
| **Safe rollback build** | `rollback/1d31b02-isolation` at **`40da4ed`** | Today's production `1d31b02` plus two fixes: no unscoped service-role fallback in `/api/signals/raw`, and conversation saves keep unknown message fields. Typechecks and builds. Still `claude-sonnet-4-5`, so it works only until 2026-11-30. Local; not pushed. |
| **Not a rollback target at any stage** | `1d31b02` (production now, `dpl_Dqiu6KijqifCXsdfV6VUv4YPAvyw`) | Its fallback can return other accounts' signals whatever the database rules, and its saves strip new conversation fields. |
| **Migrations** | `040_company_intelligence.sql` … `045_signal_read_scope.sql` | Applied in the order in §2, not numeric order. |

## 2. Corrected release sequence

**Why 045 goes first.** The earlier plan put 045 after the deploy only to keep Vercel's instant rollback to
`1d31b02` available. That target is unacceptable, so the reason is gone. Meanwhile, today's production rules let **every
signed-in user read every account's signals** through the API. In the emulated starting state, the Pact test account
saw all 19 signals, could read another account's signal by id, and could edit any column of its own consequences. 045 closes
that, needs only tables that exist today, and works with both the running build and the rollback build. So it goes first.

**Verified on the isolated project**, in one transaction that rolled back. Isolated `public` was unwound to production's
starting state using each file's own rollback statements, and then the queries the old and rollback builds make with the
user's session were replayed after each step, as the Pact account's database role:

| State | Own signals | Other accounts' signals | App writes (respond, brief, profile save through trigger, conversation save with new fields) | Edit other consequence columns / link to another signal |
|---|---|---|---|---|
| **S0: production today** | 5 | **all visible (19)** | all work | **allowed** / denied |
| **S0 + 045** | 5 | none (0) | all work | denied / denied |
| **S0 + 045 + 040–044** | 5 | none (0) | all work | denied / denied |

- **Same end state.** Applying 045 first and then 040–044 reproduces the current catalog exactly: grants, functions, policies, RLS,
  triggers, indexes, columns, constraints and column grants. One function hash differed only because blank lines were stripped from the test copy; re-created from the unmodified file, it is identical.
- **Old code tolerates hidden signals.** Its embedded-signal reads are null-safe, which matters for consequences whose signal isn't linked to the same account; 045 reports how many such rows exist.
- **The rollback build's two fixes are application-level.** It runs the same queries as `1d31b02`, minus the unscoped admin read.

**Sequence (each step is yours to run; I have done none of them):**

| Step | Action | State afterwards | If it fails |
|---|---|---|---|
| 0 | Run `docs/advisor/production-preflight.sql` (read-only; expected values inside). Take a backup and note the time (§3). | unchanged | stop |
| 1 | Apply **045**. | S0+045, running `1d31b02` (verified compatible). The API-level exposure is closed for everyone. | It runs in one transaction and rolls itself back. Fix and re-run. **Never run its rollback block.** |
| 2 | Deploy the **rollback build `40da4ed`** to production. Record its deployment id. | S0+045 + rollback build. The fallback leak is closed. | Production stays on `1d31b02` + 045 (verified compatible). Fix and redeploy. |
| 3 | Apply **040, 041, 042, 043, 044** in that order. | S2 + rollback build (verified compatible). | Each file rolls itself back. The rollback build ignores the new objects. |
| 4 | Deploy the **candidate**. Smoke test (§7). | S2 + candidate | Instant rollback **only to the step-2 deployment** (`40da4ed`), never further back. Keep every migration and all data. |

- **Why the rollback build goes before 040–044:** from step 2 on, Vercel's previous deployment is the safe build, so no accidental instant rollback can reach `1d31b02`.
- **After 2026-11-30** the rollback build loses its model, so recovery from the candidate means fixing forward.

## 3. Backup and restore

- **Backup:** before step 1, check the dashboard backups (production → Database → Backups), and also take your own dump to a private local file:
  - `supabase db dump --db-url "<connection string>" -f prod-schema.sql`
  - `supabase db dump --data-only --db-url "…" -f prod-data.sql`

  You paste the connection string yourself.
- **Don't restore the whole database** to undo a code or migration problem: that deletes work saved since the backup.
- **Code problems:** roll the code back (step 4 row).
- **A failed migration:** it rolls itself back.
- **Real data damage:** restore into a **new** project first, then copy across the rows written since the backup.

## 4. Who receives the new behaviour

- **There is no existing server-enforced way to limit the candidate to invited accounts:**
  - plan gating is switched off (`getPlanAccess` gives everyone Pro, and `canAccess` always returns true);
  - sign-up is open;
  - invite codes are only recorded (`invite_codes`), and no route checks them.
- **So the production deployment in step 4 changes behaviour for every account** (about 17 today) and every new sign-up. The changes:
  - answers come from `claude-sonnet-5-5`;
  - unsupported figures are reworded or removed;
  - refresh statuses are truthful;
  - a manual refresh also collects the company's own sources (paid calls);
  - onboarding answers go to their proper columns;
  - Advisor memory protections apply.

  Steps 1–3 also change data access for everyone: signals are visible only through the account's own links.
- **This is unavoidable before November 30 in any case.** `1d31b02` and the rollback build both stop working for AI features that day.
- **The smallest practical arrangement (recommended):** one deployment for everyone.
  - **The pilot cohort** is 3–5 founders you invite, onboard and ask for feedback. Everyone else keeps access and gets the same build without pilot support.
  - **Sign-up:** public sign-up stays open unless you decide otherwise.
- **Alternatives, not implemented:**
  - **Separate pilot address** (candidate on its own Vercel alias; production stays on the rollback build until November 30). This needs a Supabase Auth redirect URL and a Vercel protection setting, and it **is not access control**: anyone who signs in there gets it. It also splits support and still ends on November 30.
  - **A server-side allowlist** (for example, accounts whose email used an invite code). This is new access-control code and needs your approval first.

## 5. Scheduled jobs

- **Today:** Vercel Cron calls `/api/cron/ingest` and `/api/cron/brief` with GET, and both builds accept only POST. A GET with Vercel Cron's headers and the correct secret gets **405** on the candidate and runs nothing. Production holds 0 briefs, which fits.
- **During the pilot:** the jobs stay inert. No schedule or job is changed. The pilot is **manual refresh only**.
- **Testing done:** the handler was exercised only with **scripted providers** (see §6). Turning scheduling on is a separate, approved change with one evaluated real run.

## 6. Evidence, by source

| Source | What it covers | Not evidence of |
|---|---|---|
| **Real provider** (Sonnet 5.5) | 9 Advisor answers (2026-11-07, on `5989634`); one browser refresh on Pact (15:14 UTC, `d88bc19`, partial: 1 of 6 gate batches unreadable); one structured gate call on 25 real RSS items (`05dcf8b`, schema-valid, 2 survivors, 1 weak) | the current number-rewriting rule; any scheduled run |
| **Replay** (captured real answers, scripted provider, real route, client, save and reload) | the final rewriting on the nine answers (only the dog-walker "say, 15%" changes, to "Dropping to a different rate"); five targeted injections into real answers (§8) | how the model would answer again |
| **Scripted** (real handler and isolated database, scripted model and network) | the scheduled handler: authorization, rotation, time-budget deferral, cost ceiling, partial-failure storage | live collection. **Pact's latest status on the isolated project comes from a scripted scheduled run, not a completed live refresh.** |
| **Role-level SQL replay** (isolated, rolled back) | old and rollback builds' database access in each schema state (§2) | browser rendering of the old build |

## 7. Pilot cohort, founder test and questions

- **Cohort:** 3–5 invited founders you know personally, one company each, for 2–3 weeks. Pick different business types, for example subscription consumer, two-sided marketplace and small B2B service.
- **In scope:** company details, **manual** "Check for updates", signals with what was checked, the Advisor, decisions.
- **Out of scope:** scheduled monitoring, regulator coverage, email briefs.
- **Your smoke test after step 4:**
  1. Sign in and open Signals; the status line appears.
  2. Ask the Advisor a question containing one of your own numbers. It should keep your number and add none.
  3. Run one "Check for updates"; the status should be truthful.
  4. Reload; the conversation and status should still be there.
  5. Sign in to a second account and confirm it sees none of the first account's signals.
- **Founder test:**
  1. Fill in what you sell, who buys, how you make money, and one or two limits.
  2. Check for updates once and read what was and wasn't checked.
  3. Open one signal. Is the reason specific and correct?
  4. Ask about a real decision this month, including one number you know.
  5. Record the decision with what you'll watch for.
- **Questions after week one:**
  1. Which item told you something new, and which was wrong or irrelevant?
  2. Did any answer state something about your business or market that you hadn't said and isn't true?
  3. When it said it couldn't give a number or didn't know an effect, was that useful?
  4. Did you change, delay or confirm a decision because of it?
  5. What would you need before relying on it weekly?

## 8. How unsupported figures are handled now (final rule, replay-verified)

- **An option the answer proposes** ("lower it to 15%", "dropping to, say, 15%", "charge £20", an illustration): the option stays, its size goes, and no direction is added.
- **A statement of fact or forecast:**
  - **Supported direction:** the qualitative claim stays only if what you supplied states that direction for that kind of quantity. "A 15% rise in packaging costs…" becomes "A rise in packaging costs…" only when a supplied signal says prices are rising.
  - **Share of people:** this becomes an explicit unknown. "8% of your buyers will leave" becomes "I don't know whether any of your buyers would leave", never "some of your buyers will leave".
  - **Otherwise** the clause goes. A caveat clause after it is kept, and a follow-on that only acted on it ("Plan for that.") goes too.
  - **The closing note** says the effect is unknown.
- **Replay checks on real answers:** the whole delivered answer must equal the captured text with only the injected sentence changed as expected, so the surrounding recommendation and caveats are untouched. Covered:
  - a customer-loss forecast;
  - a benchmark from nowhere;
  - a figure with the wrong period;
  - an unsupported rise followed by a caveat;
  - a forecast plus a dependent step.

## 9. Remaining material limitations

- **Unsupported qualitative claims aren't detected.** Example: "typically higher-ticket items". Only numbers are checked.
- **The rewriting is rule-based.** It can't judge whether the remaining advice is still sound, and an unusual sentence shape may be removed rather than reworded.
- **Evaluation coverage is small:**
  - 9 real Advisor answers (raw: 7 clean, 1 with a qualitative claim, 1 partial);
  - 1 real gate batch, with 1 of 2 survivors weak;
  - 1 real browser refresh;
  - no evaluation of thinking or effort settings.
- **Assessment calls aren't schema-constrained;** a parse failure shows as "partial".
- **No scheduled monitoring, no regulator coverage, no email briefs.**
- **The rollback build** is privacy-safe but works only until November 30.
- **Every account receives the candidate** (§4); there is no technical pilot fence.

## 10. Authorization needed to stage or release

1. **Push both branches to GitHub:** `codex/advisor-reliability` and `rollback/1d31b02-isolation`. Production deploys from the repository.
2. **Run steps 0–4 on production, in order.** This means applying 045, then 040–044, and two production deployments (rollback build, then candidate), all before 2026-11-30.
3. **Accept** that the candidate reaches all accounts, or choose an alternative in §4 instead (each needs its own approval).
4. **Choose** the 3–5 founders. Sign-up stays open unless you say otherwise.

# Release package: privacy remediation, restricted pilot, model continuity (2026-11-08; nothing deployed or applied)

Three separate releases share one production database. No paid calls were made in this preparation.

| | Build | Commit | Who gets it | Model |
|---|---|---|---|---|
| **A. Privacy remediation** | `rollback/1d31b02-isolation` (pushed) | **`055c2fe`** | everyone, on the main address | `claude-sonnet-4-5` (until 2026-11-30) |
| **C. Model continuity** | `release/baseline-sonnet55` (local; push not yet authorized) | **`675d017`** = A + model port | everyone, on the main address | `claude-sonnet-5-5` |
| **B. Restricted pilot** | `codex/advisor-reliability` (pushed) | the commit adding this file (code = **`b79405e`**) | only accounts listed in `PILOT_ACCOUNT_IDS`, on a separate pilot address | `claude-sonnet-5-5` |
| Migrations | `045_signal_read_scope.sql`, then `040`–`044` | | all accounts (one database) | |

**Not acceptable at any stage:** `1d31b02`, today's production build. It has the admin-key fallback, and its saves strip new conversation fields.

## Why two builds, not one app with flags

The candidate differs from production in 59 files: refresh, Advisor, workspace API, onboarding, client UI and the
signal pipeline. Restricting it inside one deployment would mean re-creating today's behaviour behind per-account
flags in most of those files. That is two applications in one codebase, with a new, untested "flags off" combination.

Instead:
- the **main address** runs the existing app (A, then C). It is frozen except for privacy and model fixes;
- the **pilot address** runs the candidate, which refuses every account not on its list.

Both builds work against the same schema states (verified, §A). The cost: any future privacy fix must go into both until the pilot
ends. Merging the pilot into the main app is a later, separate decision.

## A. Privacy remediation

**What it fixes:**
1. **045:** a signed-in user can read only signals linked to their own account; user-side writes to links and consequences are closed off.
2. **The patched build `055c2fe`** (today's app plus three fixes):
   - **No admin-key fallback:** `/api/signals/raw` returns "could not be loaded" instead of other accounts' signals.
   - **Conversation saves keep the newer message fields:** turn ids, status and earlier attempts.
   - **New in this pass:** the backfill no longer copies Google News items into every refreshing account. Those can come from another account's competitor search, and the build doesn't record feed provenance. An account still gets them from its own refresh. **Functional cost:** non-pilot accounts no longer receive shared generic Google News items that another account fetched first.

**Verified (offline and isolated):**
- **Role-level SQL replay on the isolated project, rolled back:**
  - in production's starting state, any signed-in user saw all 19 signals;
  - with 045, the account saw only its own 5;
  - the old app's operations all work, and the negative controls are denied;
  - applying 045 first and then 040–044 gives the identical catalog.
- **A-build checks** (`scripts/baseline/privacy.test.mjs`, 3 checks, against the real routes):
  - backfill skips Google News items and items without a URL;
  - a failed link read returns 503 with no other account's data;
  - a conversation re-save keeps the newer fields.
- **Typecheck and build:** pass.

**Done only when both are active and verified in production:** 045 applied, and `055c2fe` deployed. Then smoke-test with two accounts (§Sequence).

**If the A deployment fails:** stop. Production would then be `1d31b02` + 045, which still has two exposures. That is **not private**:
- the fallback returns the 20 newest signals of all accounts whenever a link read errors;
- the blanket backfill links Google News items into any refreshing account.

**Remaining after A (your decision):**
- **Existing links stay readable.** Links the old blanket backfill already created in production stay readable to the accounts that hold them. They can't be told apart from an account's own links, because both carry the same reason text.
- **Measuring it first:** this read-only query counts items linked to more than one account, the likely spread:
  `select count(*) from (select signal_id from public.signal_triages t join public.signals s on s.id = t.signal_id where s.url like 'https://news.google.com/%' group by signal_id having count(*) > 1) x;`
- **Removing them** is a production data change, and I haven't prepared one.

## B. Restricted intelligence pilot

- **Enforcement (server-side, fail closed):**
  - `src/lib/supabase/server.ts` wraps `getUser()`, which every signed-in page and API route uses. An account not in `PILOT_ACCOUNT_IDS` is treated as not signed in.
  - Paid operations are covered too: Advisor answers, manual refresh, company research.
  - No list, an empty list or a single malformed entry admits nobody.
- **New sign-ups are refused on the pilot address,** so a new account is never enrolled.
- **A refused account sees an explanation page** (`/pilot-access`). That page holds no account data.
- **Existing customers** are untouched: they keep using the main address.
- **Checks** (`scripts/advisor/pilot-access.test.mjs`, 5 checks, real `createClient` and real routes):
  - a non-listed account gets 401 or 403 from 9 operations, with no data, no model call and no database write;
  - a listed account passes;
  - the list fails closed;
  - sign-up is refused;
  - the app page sends a refused account to the explanation page.
- **Staging on the isolated project, with the real Supabase session of the signed-in Pact test account:**
  - **Not listed:** `/api/pilot/access` → 403 with the explanation; workspace, sessions, refresh and research → 401; the page shows the explanation.
  - **Listed:** access, workspace and sessions → 200; the full pilot app loads.
  - **Defect found and fixed in this staging run:** a refused account first hit a redirect loop through `/login` (middleware) before the explanation page existed. Data was never exposed.
- **All candidate tests:** 150 + 43 offline tests pass; build passes.
- **Cohort:** 3–5 founders you choose. Their account ids go in `PILOT_ACCOUNT_IDS` on the pilot deployment only.
- **Pilot hosting** needs a deployment target other than production, which needs your settings:
  - **either** a Vercel preview of this branch with branch-scoped Preview environment variables (production Supabase and Anthropic keys, `PILOT_ACCOUNT_IDS`; leave `CRON_SECRET` unset), plus a stable alias;
  - **or** a second Vercel project.

  Either way, deployment protection stays off for that address only if you want founders to reach it without Vercel login. The allowlist is the access control.

## C. Model continuity (non-pilot accounts)

- **The port:** `675d017` moves the six model callers of the existing app (Advisor, `callClaude`, assessment, report, strategies, digital twin) to `claude-sonnet-5-5`. It uses the settings already accepted in real calls on 2026-11-07: no up-front thinking, explicit effort, tokenizer-adjusted caps, text read by block, refusals handled.
- **Checks:** `scripts/baseline/model.test.mjs`, 5 checks, real routes with a scripted SDK:
  - the request settings for each caller;
  - a thinking block before the text;
  - a refusal returns 422, or an empty digital-twin summary, or an Advisor error with no memory write;
  - no reference to a retired model remains.

  The existing 42 client tests still pass; typecheck and build pass.
- **What this doesn't cover:** the existing app's own prompts have not been re-run on Sonnet 5.5 for quality. No paid evaluation was authorized.
- **Recovery beyond November 30:**
  1. Once C is deployed, the previous C deployment is always the instant-rollback target. It keeps working after November 30, because its model is supported.
  2. If C itself misbehaves before November 30, roll back to A (`055c2fe`, still private). After November 30, roll back to the last good C deployment instead.
  3. If the pilot build fails, take the pilot address down or roll it back; nobody loses access, because everyone has the main address on C.
  4. If Sonnet 5.5 has a provider outage, AI features show their existing "unavailable" errors while everything else works. There is no automatic switch to another model, because that would be an untested request shape.

## Minimal production sequence (each step is yours; none has been done)

| # | Action | Done when |
|---|---|---|
| 0 | Read-only preflight (`docs/advisor/production-preflight.sql`, expected values inside), then a backup | hashes match; backup time noted |
| 1 | Apply **045** | its own verification passes |
| 2 | Deploy **A (`055c2fe`)** to production; record the deployment id | Two accounts each see only their own signals. A conversation saved before and after shows the same history. **Remediation A is complete only now.** |
| 3 | Apply **040–044** | each file's checks pass; the main app still works (A is compatible) |
| 4 | Deploy **C (`675d017`)** to production | one Advisor answer and one strategy generation succeed; rollback target = step-2 deployment |
| 5 | Deploy **B** to the pilot address with `PILOT_ACCOUNT_IDS` set | a listed account loads the app; a non-listed account gets the explanation page |

Steps 4–5 must be finished before 2026-11-30. Production deploys from `main`, so A and C reach production by merging, or by a CLI deploy of the exact commit.

## Evidence, by source

| Source | Covers |
|---|---|
| **Real provider** | 9 Advisor answers; 1 browser refresh (partial); 1 structured gate call (2 survivors, 1 weak). All on the candidate's request settings, before the current number rewriting. |
| **Replay** | the final number rewriting, on the nine captured answers and five targeted injections |
| **Scripted** | the scheduled handler (inert in production: GET → 405). Pact's latest isolated status comes from a scripted run, not a live refresh. |
| **Role-level SQL replay** (isolated, rolled back) | A/C database compatibility in every schema state |
| **Offline checks** | access boundary (B), privacy fixes (A), model port (C) |

## Remaining material limitations

- **Unsupported qualitative claims** aren't detected, and the number rewriting is rule-based.
- **Evaluation coverage is small**, and the existing app's prompts haven't been quality-checked on Sonnet 5.5.
- **Existing blanket-backfill links** remain readable until you decide on them (§A).
- **Non-pilot accounts lose some shared Google News items** (§A).
- **No scheduled monitoring, regulator coverage or email briefs.**
- **Two builds must receive any future privacy fix** until the pilot ends.

## Approval needed

1. **Push** `release/baseline-sonnet55` (C) for review. Only A and B were authorized.
2. **Production release:** steps 0–4 in order (045, A, 040–044, C), before 2026-11-30.
3. **Pilot hosting:** choose a preview alias or a second project, and set its environment variables, including the 3–5 `PILOT_ACCOUNT_IDS`. Then deploy B there (step 5).
4. **Historical links:** decide whether to measure and clean up links created by the old blanket backfill (§A).

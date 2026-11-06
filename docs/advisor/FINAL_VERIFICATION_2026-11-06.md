# Final verification — correction pass (2026-11-05 → 2026-11-06)

**Tested candidate:** app code at commit `9bbec36` on `codex/advisor-reliability` (built from `7d5013f`; later commits
change test scripts only). **Migration set:** `040 → 041 → 042 → 043 → 044 → 045` (039 is already in production).
**Environment:** isolated project `acqhieylvcemgcevrxvc` only. Production `odahuetnflsqkligzwpm` was read (catalog and
policies only) and never changed. Nothing deployed.

## 1. Database

| Check | Result |
|---|---|
| Production-shaped baseline | Schema-only copy of production loaded into schema `prodbase` on the isolated project (no 033–038 objects). Fingerprints identical to production in all 7 categories: 359 columns, 102 constraints, 90 grants, 87 indexes, 42 policies, 31 RLS flags, 14 trigger events. |
| 040–045 on that baseline | All applied in order; 045's own prerequisite and verification blocks passed. |
| Behaviour as real `authenticated` / `anon` / `service_role` sessions (rolled back) | **All passed.** Another account cannot read company-specific signals, triages, context, sources, memory operations or fact history; cannot forge a triage link, insert or repoint a consequence, insert a signal, run `apply_advisor_memory`, write memory or version rows, or link a conversation to another account's signal. It can still respond to its own consequence. `anon` cannot read signals. The service role still ingests and assesses. The fact-version trigger records changes and ignores empty columns. |
| Negative control | With production's current policy restored, account B **can** read "News found for A only". 045 closes it. |
| 045 on the isolated `public` schema | Applied. Through the real API, A sees its 2 linked signals and B sees 0. B's direct database read returns 0 rows, a forged triage returns 403, and an anonymous read returns 401. |
| Fidelity gaps | Same Postgres project as the test data (17.11, versus 17.6 in production). The `auth.users → handle_new_user` trigger and the `ensure_rls` event trigger were omitted (cluster-wide); profiles were inserted directly. Production row counts (for example consequences without a triage link, which 045 reports) are unknown. |

App fixes found during this check: `signals/raw` no longer falls back to returning unscoped signals, and `review`
requires the account's own link before it changes the shared flag.

## 2. Model results

Official pricing was checked on 2026-11-05: `claude-sonnet-4-5` costs $3/$15 per million tokens (listed as **deprecated**), and
Opus 5.5 costs $4/$20. Every request reserved its worst case first (input bounded by bytes, plus the full output cap).

**Corrected regression cases**, using the same inputs as the preserved failed outputs:

| Case | Result |
|---|---|
| subscription-vs-commission | **Pass.** It compares the commission explicitly with booking directly at zero fee. |
| contribution-vs-cash | **Pass.** Runway is the deciding risk, spend is small and stoppable, and there is no invented benchmark. |
| future-vs-feasible | **Pass.** "Can't build anything until Q3"; it proposes a manual inspection test now. |
| bypass-vs-churn (tone check) | **Fail.** Dramatic opening ("Stop the bleed", "death spiral") **and invented figures** ("2–3%", "12–15%", "£500–2000"). Counted as an analytical failure. |

**Fresh generalization cases**, written before the run:

| Case | Result |
|---|---|
| fresh-cash-commitment | **Pass.** It refuses a 12-month commitment that outlasts 10 weeks of cash. One unsupported generalization ("SEO rarely pays back fast enough"). |
| fresh-commission-direct | **Pass.** It compares the fee with zero. |
| fresh-preference-not-wall | **Pass.** The preference is treated as tradeable, with both paths given. |
| fresh-design-capacity | **Partial.** A no-design step now and no redesign now, but invented illustrative figures ("If 90%… If 15%") and the January timing not stated. |
| fresh-benchmark-bait | **Untested.** Network failure, empty answer, not retried. |

Summary: 3 of 3 corrected failures pass; the tone check fails; of the fresh cases, 3 pass, 1 is partial and 1 is untested.
The constraint fixes generalize. The no-invented-figures rule does not reliably hold, and the deterministic check only
detects mentions, not compliance.

## 3. Browser refresh

- **Browser:** the account was signed in as Pact Coffee at `localhost:3301/app#signals`, and "Check for updates" was clicked **once**. The page
  then showed the growth headline removed, Keurig kept, and three "Not yet assessed" items. The toast had closed before
  it could be read.
- **Intended reassessments: executed.** Slot 41 ran; both stored assessments were rewritten at 20:31:12 UTC under the
  current context version:
  - Growth headline: **rejected as background** (the model's own reason). Correct.
  - Keurig pods: **still relevant**. It now cites a real stated fact ("…coffee pods") and the invented "a market where Keurig is a
    major player" is gone, but it calls Keurig "a major pod manufacturer". The expected treatment was "monitor", so **partial**.
- **New candidates:** the assessment call failed (connection error), so 3 items were stored as "not yet assessed". They are a
  Pact blog page change, a one-off Wikipedia page change, and an unrelated private-equity headline matched on junk words.
- **Gate:** of 6 batches, 2 completed (no survivors), 2 hit connection errors and 2 were refused by the dollar ceiling
  (the failed calls are counted at worst case). **The response and coverage line did not report the gate's partial
  failure** ("Available records checked"). That's a release blocker.
- **Sources:** 18 of 18 were reached. The private-equity feed proposed by research supplied 17 of 27 items and is unrelated.

## 4. Calls and spend

| | Calls | Recorded | Conservative maximum |
|---|---|---|---|
| Before this pass | 32 | $1.3168 | $1.3518 (cancelled call at $0.035) |
| This pass (approved 17 / $0.70) | 15 | $0.1355 | $0.5989 (4 calls without usage, counted at their worst case) |
| Cumulative (approved 49 / $2.50) | 47 | $1.4523 | $1.9508 |

Two approved calls remain unused. Five of 15 calls in this pass hit connection errors (Anthropic or Supabase). No call was
retried automatically.

## 5. Not verified

- The scheduled cron run and regulator-feed delivery.
- The benchmark-bait case.
- The live partial-failure toast.
- 045 against real production row counts and at production scale.
- Production itself.

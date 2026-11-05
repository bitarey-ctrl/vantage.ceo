# Correction pass — 2026-11-05

Candidate: branch `codex/advisor-reliability`, commits `33b22ab` → `835d717` → `ea772cc` → this document's commit.
No deployment, no production change, no provider call in this pass (ledger unchanged at 32 of 33).

## 1. Reasoning failures: traced, fixed offline, not yet re-run

| Case (preserved output in `scripts/advisor/reasoning-baseline-2026-11-05.json`) | Where it failed | Fix |
|---|---|---|
| future-vs-feasible — ignored "No engineering capacity until Q3" | **Context selection.** The Advisor's `ceo_context` query listed columns and omitted `business_facts`, so the constraint never reached the model, and the prompt then listed limits as *unknown*. | Advisor reads the full row (`select('*')`, as every other caller). |
| contribution-vs-cash — ignored "about three months of cash"; invented "most tea shops £8–15" | Same context-selection defect. Benchmark: prompt-level rule existed but did not hold. | Same fix; explicit rule against "most businesses like yours", "typically", ranges and invented example figures. |
| subscription-vs-commission — no zero-fee direct comparison | **Prompt construction.** One generic rule among many; nothing tied it to this company's revenue model. | Deterministic commission frame derived from the stated revenue model. |
| bypass-vs-churn — passed, opened with "The hard truth…" | Tone. | One-line style correction (open with the answer). |

Why the earlier offline tests missed it: the test database double returned whole rows whatever was selected. It now
projects columns like PostgREST; run against the pre-fix route it reproduces the defect (constraint "not recorded").

New prompt structure (`src/lib/company-context/constraints.ts`): a **DECISIVE LIMITS** section straight after the company
context — hard limits (each with its implication for the next step and timing), preferences (can be traded off),
estimates (labelled as the founder's) and, for commission models, the zero-fee direct alternative — plus a **BEFORE YOU
SEND** check as the last instruction.

`checkAnswer()` flags all three preserved failed outputs (missing Q3 limit, missing runway, "most tea shops", no direct
comparison). **Limitation:** it is a mention check. It shows a limit or comparison is absent; it cannot show the advice
complies. Whether the model now follows the prompt is **unverified** until the paid regression run.

Known gap found before any run (pre-registered fresh case, not tuned): "our only designer is on leave until January"
is classified as a generic limit, so it gets the generic implication (the "until January" timing is still extracted).

## 2. Evidence quality

- Proposed sources, retrieved pages, matched quotes and supported claims stay separate. A matched quote now reads "a
  fetched page says this — not independently verified"; no claim is labelled as verified truth.
- Research cannot become a company fact without the founder accepting it (unchanged, now tested). After acceptance the
  value stays labelled with its evidence status (matched / UNVERIFIED / inferred) until the founder edits it, and the
  Advisor is told never to make such a value the only basis of a confident recommendation.
- Fixed: an accepted research sentence was split on commas into fragments ("instead of buying on the commodity market."
  stored as a dependency).
- Fixed: feed autodiscovery adopted Wikipedia's site-wide edit log for a company page (20 unrelated items per run, each
  sent to paid assessment). Advertised feeds are used only when same-site and not an edit/comments log.

The two real Pact Coffee signals:

| Signal | Supported company-specific mechanism | Stored verdict | Correct treatment |
|---|---|---|---|
| "Pact Coffee reports another year of double-digit growth" (aggregator headline) | None new to the founder: it reports their own results. | relevant — "confirms… validates your business approach" (overclaim from an unverified headline) | **Background.** Now downgraded deterministically (replayed in tests). |
| "Keurig says it's come up with plastic-free coffee pods" (LA Times via Google News) | Pact sells coffee pods (stated); a large pod maker launched plastic-free pods, which may shift what pod buyers expect. Keurig's UK presence and any Pact pod-material issue are unknown. | relevant — added an invented claim ("a market where Keurig is a major player") | **Monitor**, trigger: a UK pod competitor or Pact's own customers raise plastic-free pods. The invented claim is addressed only by assessment rules; not detectable from wording; unverified until a paid rerun. |

## 3. Production-schema compatibility

- Production (`odahuetnflsqkligzwpm`, read-only catalog queries only) already has **039**; it has none of 040–044 and
  no conflicting 040. Required sequence: **040 → 041 → 042 → 043 → 044**. The 033–038 drafts are not needed: the
  candidate code references none of their objects (043 adds `profiles.team_size` itself, `IF NOT EXISTS`).
- The isolated database differs from production because 033–038 are installed there:
  - `signals`: production lets **every signed-in user read every row**; the isolated DB restricts reads (034).
  - `signal_triages`, `consequences`: production lets users write their own rows; isolated is SELECT-only.
  - Per-account tables have equivalent owner-only policies in both (different names).
- **Finding:** the candidate inserts items found for one company (e.g. news searched by its name) into the shared
  `signals` table. Shared rows hold only public article text, but under production's policy any signed-in user can
  query them through the API and infer which companies are watched. The isolated isolation test passed partly because
  of 034. Needs a decision (see below); not changed silently.
- Prepared: `supabase/test-baseline/production_schema_2026-11-05.sql` (schema only — tables, constraints, indexes,
  functions, triggers incl. `auth.users → handle_new_user`, RLS, policies, grants, event trigger; scanned: no emails,
  ids or secrets) and `verify_candidate_on_baseline.sql` (account isolation, function privileges, version trigger, as
  real `authenticated` sessions). The assertions were rehearsed on the isolated DB inside a rolled-back transaction
  (passed; nothing persisted; founder-test accounts intact). **Not yet run on a production-shaped database** — needs a
  new disposable Supabase project; both free-tier slots are in use.

## 4. Final revision checks

| Check | Result |
|---|---|
| `npx tsc --noEmit` (src) | clean |
| Tests | 95 advisor + 28 company-context + 42 comparison, all pass |
| `next build` | passes |
| Real `POST /api/signals/refresh`, zero-call ledger | HTTP 500 with explicit error ("All 6 batch(es) failed … not an empty day"); 28.7 s (was 103 s before the fetch fix); 0 provider calls; 18 of 18 sources reached, 39 items; collection run persisted as `partial`; the two stale Pact links left unchanged |
| Browser refresh button | **Not verified by me** (sign-in step was blocked by the permission system). The toast now reports partial failures; untested live. |
| Context version stability | verified on stored rows: old and new code give identical versions (no mass re-assessment) |
| Scheduled cron run, regulator-feed delivery | **Not verified** (never executed; only simulated paths exist) |
| Corrected reasoning cases and fresh cases | **Not run** (needs paid calls) |

Error-message inaccuracy (not fixed; protected `gate.ts`): when the gate is refused by the test budget, its message
blames the API key.

## 5. Spending

32 of 33 approved calls used. Recorded usage: $1.317 at the harness's Opus price ($4/$20) or $1.508 at $5/$25 (the
harness now uses the conservative price). The cancelled A4 Advisor call (ledger slot 3) has no recorded usage; worst
case ≈ $0.03. Conservative total ≤ $1.54 of $2.50. One call remains; it was not used.

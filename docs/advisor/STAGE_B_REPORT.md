# Stage B — shared context, memory protection, signal access, reasoning, Phase 2 audit

Branch `codex/advisor-reliability` (from Stage A `483ecb7`). Local and offline: no paid calls, no migrations applied,
no deployment, no customer-record changes. Production is `1d31b02`.

## 1. Incorrect business fields — verified mapping defect

Cause: `src/app/api/onboarding/step/route.ts` (onboarding; not edited — needs your authorization):

| Onboarding step | Answer | Written to | Read by others as |
|---|---|---|---|
| 3 | team size (`Solo`, `2–5`, …) | `profiles.business_model` (comment: "no team_size column") | business model / how they make money |
| 6 | decision style (`Decisive`, …) | `ceo_context.revenue_model` | how they make money |
| 7 | risk tolerance (`Low` … `Calculated`) | `ceo_context.avoided_decision` | the decision they are avoiding |
| 5 | top risks | `ceo_context.sector_tags` | sector tags (not read by the shared context) |

Production, read-only counts (no identifiers or other fields exported): 9 of 9 set `business_model` values are
team-size answers; 7 of 8 set `revenue_model` values are decision-style answers (1 ambiguous); 7 of 8 set
`avoided_decision` values are risk-tolerance answers. `onboarding/complete/route.ts` additionally falls back to
`"B2B SaaS"` for revenue model and sector.

Done (shared, authorized): `src/lib/company-context/field-validation.ts`. An exact onboarding answer found in the wrong
field is shown as that answer (team size, decision style, risk tolerance) with provenance and never as a business
fact. Other short values that do not read like a revenue description are kept and marked "unconfirmed". Nothing is
rewritten in the database.

Minimal onboarding correction (proposed, NOT applied): run `043_onboarding_answer_columns.sql`, then in
`src/app/api/onboarding/step/route.ts` change step 3 to `.update({ team_size: teamSize })`, step 6 to
`.update({ decision_style: decisionStyle })`, step 7 to `.update({ risk_tolerance: riskTolerance })`. Optional data copy
for existing rows is in 043 as commented SQL, for you to decide.

## 2. One validated business context

| Consumer | Reads | Status |
|---|---|---|
| Advisor (`advisor/chat/route.ts`) | `companyContextBlock` (validated) + account signals | done |
| Signal relevance (`company-context/verify.ts`) | `companyContextBlock` | done (Phase 1/2) |
| Impact analysis (`signals/[id]/analyse` → `company-context/impact.ts`) | canonical context + stored assessment | done; `/assess` removed (one path) |
| Decision blind spots (`decisions/[id]/analyze/route.ts`) | canonical context (was raw `business_model` = team size) | done |
| Decision drafts (client) | signal evidence + assessment + analysis | done (Phase 2) |
| Gate/triage, legacy refresh path, `signals/ingest`, `onboarding/complete`, legacy consequence path | `"B2B SaaS"` defaults, raw fields | NOT changed — protected; propose separately |

Unknown business type: the block states "do not assume software, SaaS, a location, or a revenue model". Durable
facts (dependencies, constraints, estimates, accepted public facts, dated notes) are in every Advisor prompt, not
limited to the conversation window. Corrections are recorded with history once 042 is installed.

## 3. Memory updates across different questions (migration 042, not applied)

- Trigger: any change to a tracked `ceo_context` field (from any path, including the profile page) bumps a per-field
  version and appends old/new values to `company_fact_history`.
- `apply_advisor_memory()` in one transaction: valid unexpired claim (token + lease, row lock) → field version check
  → write → version bump + history → claim closed.
  - SET fields (product, customers, priority, revenue band): an answer written against an older version becomes an
    unresolved `conflict` (both values kept, shown on the Company page as "Suggestions not applied"). A proposal
    written against the current version — a genuinely newer correction — is applied.
  - APPENDED fields (competitors, notes): recomputed against the current version; two questions adding different
    items both survive.
  - A worker whose lease expired, or whose claim was taken over, is refused (`superseded`).
  - Recovery re-applies the originally claimed update with its original base version, so an old retry after a
    newer correction becomes a conflict, not an overwrite.
- Tests (handler level, fake PostgREST + JavaScript mirror of the function): two questions setting one field; two
  questions appending; old retry after a correction; genuinely newer correction; stalled worker after takeover;
  expired worker before takeover; no-042 fallback. Mutation (conflict rule off) caught by 2 tests.
- Needs real Postgres: the trigger, `FOR UPDATE` locking, the function's transaction, the `CHECK` constraint swap on
  041's table, `SECURITY DEFINER` + grants, and that PostgREST exposes the function to the service role.

## 4. Signals in the Advisor

The starter "What signals should I be acting on right now?" exists only on the legacy `/advisor` page (redirects to
`/app`). Cause for any signal question: the Advisor received only the last 3 impact analyses ("No signals analysed
yet." otherwise). Now `src/lib/advisor/signal-context.ts` gives it this account's assessed signals (what changed,
connection, effect, unknowns, source link, evidence level) with a state: available · unassessed only · empty
(retrieval worked) · unavailable · failed, and coverage: fresh · stale (>7 days) · partial · never. Read-only; no
refresh or research is triggered.

## 5. Reasoning and brevity

Prompt rules added (BUSINESS REASONING): no assumed business type; check existing capabilities and name the remaining
gap; check capabilities, costs, constraints and unresolved requirements before lending, guarantees, escrow,
inspections, payments, delivery or quality responsibilities; compare against the real alternative (a lower commission
vs a zero-fee direct deal; bypass vs churn); keep introduction vs responsibility, subscription vs commission,
contribution vs cash, future capability vs feasible step distinct; no unsupported statistics, thresholds, urgency,
legal or provider claims; conditional answer + one focused question when a missing fact matters. Default shape:
direct answer, brief business-specific reasoning, one next step, caveat only when needed. "What most VCs would say"
framing removed.

Offline verification is limited to what reaches the model. Whether capabilities and constraints CHANGE the
recommendation needs model calls: six frozen paired cases are in `scripts/advisor/reasoning-pairs.json` (each pair
differs in one fact; a test checks that).

## 6. Phase 2 research-integration audit

| Item | Finding | Change |
|---|---|---|
| Source plan vs verified sources | `buildSourcePlan` = Google News search queries (discovery). `company_sources` = sources opened by our fetcher. Distinct in code, UI ("Search: …" vs "Opened and read") and storage. | none |
| Public-search privacy | Queries use company name/website, named competitors with category words, markets, product/buyer category phrases, rules + category, and only publicly evidenced dependencies. No priorities, notes, constraints, estimates, avoided decision (test). Research inputs: name, website, markets, accepted public facts. | none |
| 2 of 9 quotes | Not an extraction bug: 7 of 9 cited search results (snippets are encrypted, cannot be checked) or gave no quote; only fetched pages can be checked. Previously such claims still showed as "the company says". | Unmatched → basis `unconfirmed` |
| % × estimate | Previously any quoted % × founder estimate. | Now requires the quote to name the estimated cost item, describe a price/cost change, and not point to an unlisted market; output labelled conditional |
| Stale analyses | Context version + assessment text checked; history kept. | moved into the single analyse path |
| Namesakes / watch | Model must name connection + effect; "watch" needs a trigger; unchecked = "Not yet assessed". | none |
| Indirect developments | Keyword stage proposes 7/12 indirect probes (dependencies, buyer words). The 5 rule/semantic ones depend on watched regulator sources; proposed sources are not proof of collection — only `verified` sources are collected, page changes give coarse "page updated" items. Unverified end to end. | none |
| `/assess` | Introduced in Phase 2 because `analyse` was protected — a divergent path. | removed; `analyse` uses the shared module (auth, same-origin, ownership, reuse-while-current, history) |
| Scheduled processing | Rotation least-recently-served verified offline (4 accounts, 1/day → 4 distinct days). Cron runs the same assessment rules + collection when ≥25s budget remains. Capacity ≈ 1–2 accounts/day on Hobby. Not comprehensive monitoring. | none |

## 7. Retrieval capability (read-only report)

| Surface | Retrieves live | From storage | Model knowledge |
|---|---|---|---|
| Deployed Advisor (`1d31b02`) | nothing | company context (unvalidated), last 3 analyses, 5 decisions, 5 strategies | everything else, incl. prices, trials, provider coverage, regulations — unverified and possibly out of date |
| Deployed Signals | fixed RSS list (vendor blogs, cloud/AI status pages, EU/FTC/SEC/CISA), NewsAPI, Perplexity search → gate | stored signals + triages | gate judgement |
| Local only (this branch) | company research (web search/fetch, public identifiers), verified per-company sources, Google News discovery | assessments, analyses, coverage runs | assessment, impact analysis |

Claims that cannot currently be verified: any changing claim (prices, free trials, provider coverage, regulations)
stated by the Advisor; signal article claims (retrieved ≠ verified); research claims whose quote was not found in a
fetched page. Proposal (not built): a bounded Advisor tool that answers changing-claim questions only from direct
sources with dates and scope.

## 8. Daily coverage for every account (proposal, not built)

Smallest design within Vercel limits: a per-account endpoint (`/api/cron/ingest?profile=<next>`) that serves exactly
one least-recently-served account per call (≤60s), triggered every 15 minutes by Supabase `pg_cron` + `pg_net` with
the cron secret (96 slots/day → up to ~96 accounts/day at one account per slot). No Vercel Pro needed; the existing
daily Vercel cron stays as a fallback. Alternative: Vercel Pro (more frequent crons, longer functions).
Model cost per account per day ≈ 2–3 assessment calls + existing gate batches ≈ $0.10–0.30 (Sonnet 4.5 list price);
Google News feeds are free.

## 9. Remaining integration-test requirements (Stage C)

Isolated project `vantage-rls-test` (currently paused) — inspect the actual schema first; apply only what is missing
from: 039 (if absent), 040, 041, 042, 043. Exclude the untracked root drafts 033–038 and keep the existing gaps
(029, 033–038) and the duplicate 002 as they are. Paid usage: the 7-call / $0.50 Advisor test (Stage A) plus, for the
research-to-decision path, ≈2 research + 2–3 assessment + 1–2 analysis + 12 reasoning-pair calls ≈ 20 calls, ≈ $2;
maximums to be approved before running, no automatic retries.

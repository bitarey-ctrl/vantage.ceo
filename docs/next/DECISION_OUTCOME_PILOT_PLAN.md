# Next phase: dependable judgment and measured outcomes (plan for approval)

Status: **proposal only**. Nothing here is built. No deployment, no paid run, no production change until approved.

## 0. Release blockers carried from the current candidate (unresolved)

1. **Partial gate failure is silent.** When some gate batches fail, the refresh response and coverage line say "Available
   records checked" (`signal-processor.ts` does not pass the gate's partial status on; protected file).
2. **The no-invented-figures rule does not reliably hold.** In 2 of 8 graded answers the model invented rates or
   illustrative percentages, and the tone fix failed once. The deterministic check only detects that a figure appeared.
3. **Assessment judgment is partial.** Keurig is "relevant", where the expected treatment was "monitor". Keyword matching
   produces junk matches ("comes, retailer"). Headlines are not HTML-decoded.
4. **Research-proposed sources are collected without founder acceptance.** One unrelated private-equity feed supplied 17 of 27
   items, which are then sent to paid assessment.
5. **Migrations 040–045 are not applied to production.** They are verified only on a production-shaped copy; real row
   counts (for example consequences without a triage link) are unknown.
6. **Untested:** the scheduled cron run, regulator-feed delivery, the benchmark-bait case, and the live partial-failure toast.
7. The current model, `claude-sonnet-4-5`, is listed as deprecated on the pricing page.
8. Connection errors hit 5 of 15 calls in the last run, so the environment's reliability is unexplained.

Recommendation: fix 1, 3 (keyword noise) and 4 before the pilot (small and offline, needing authorization for the protected
files), then apply the migrations on your schedule. Blocker 2 is addressed by phase A below.

## 1. What already exists and will be reused

| Need | Existing piece |
|---|---|
| Decision with goal, limit, options, effort, fit, reversibility, first step | `public/comparison/engine.js` (`diagnose`, `reframe`), `decision_workspaces.support` |
| Evidence with type, source, URL, date and "what this does not establish" | evidence items (`business` / `external` / `assumption` / `unknown`, `decisive`) |
| Recorded choice with expectation, uncertainty, review date and stop condition | `record()` → immutable `snapshot` (enforced by the database trigger in 039) |
| Append-only outcome reviews, "too early", re-review date, reconsider | `review()`, `due()`, `reconsider()`, append-only reviews in 039 |
| Price scenario arithmetic | `scenario()` (current and new price × customers) |
| Company facts with hard limits, preferences and estimates; research provenance | `src/lib/company-context/*` (this candidate) |
| Paired reasoning cases, frozen baselines, pre-registered cases, a cost-bounded harness | `scripts/advisor/reasoning-*.json`, `stage-c.mjs regression`, the dollar-ceiling ledger |
| Reminder channel | `notification_preferences.decision_nudges` flag and Resend templates (no sender exists yet) |
| Past outcomes in the Advisor | `actual_outcome` is already passed as one line, unstructured |

## 2. Pilot decision type (proposed): changing a price or commission on an existing offer

Why: it is common for the target customer (SaaS, fintech, e-commerce), it has a measurable result within weeks
(conversion, revenue per customer, churn, margin), it has a natural staged rollout (new customers first, one segment),
it already has the scenario tool, and two of the three corrected reasoning failures were pricing or commission cases.

**To confirm with real demand before building:**
- (a) an aggregate, read-only count of production decisions by category and of `top_priority = 'Pricing'`. Needs your
  approval because it reads customer data; only counts are returned.
- (b) 5 short founder conversations: "What pricing decision are you facing in the next 60 days, and how would you know it worked?"

If neither supports pricing, the fallback is "spend more on one acquisition channel under a cash limit".

## 3. Workflow inside the existing decision screen (no new screens)

Question → **VANTAGE drafts the plan** → founder confirms → act → measured result → review → updated guidance.

The draft fills the existing fields plus one stored block (`support.outcomePlan`, kept in the existing JSON; no migration):
- the result sought and its measure (for example "new-customer conversion on the Pro plan");
- the baseline, its **source** and its date, or "not available yet: how to get it";
- the action, or a proportionate test (staged: new sign-ups only, or one segment), and its **cost** (money and time);
- the owner, deadline and resources, **always confirmed by the founder** (never invented);
- the expected result, **labelled as a forecast**, and the assumptions it rests on;
- success evidence, guardrails (for example "churn of existing customers does not rise"), and the stop or reconsider condition;
- the review date, which is the existing `review` field and `due()`;
- `priorIntent`: "What were you planning to do before asking?" One line, captured first.

At review, the existing review form gains an **actual value, its source (retrieved or manually reported), and the cost incurred**.
The manual path is the default for the pilot, and the screen says so. Nothing is committed or sent externally automatically.
The founder confirms only the commitments and consequential assumptions, in one step of the existing "record" dialog.

## 4. Evidence adequate for the decision

Every consequential claim in a recommendation is stored as one of: observed fact (with source and passage), founder
report, calculation (inputs shown), assumption, or forecast. External claims keep the source, passage, date and
market or jurisdiction, plus an **applicability check** ("does this apply to this business, and why?") that is separate
from the quote match. If an essential claim cannot be established, the main answer says what is uncertain and how
that limits the advice, and the advice is downgraded to a test or a check.

## 5. Evaluation set for business-specific judgment (phase A, before the pilot)

- **30 pairs (60 answers)**: 5 dimensions (cash and payment timing; people, equipment and engineering capacity; customer
  segments, concentration and commitments; capabilities, partners and responsibilities; margins, costs and operating
  constraints) × 4 consequential pairs, plus **2 irrelevant-fact controls per dimension**. Those controls check that the
  advice does *not* change merely to look personalised.
- Each case is written and frozen **before any run**: acceptable reasoning (several allowed), unacceptable commitments,
  decisive missing information, evidence requirements, and the expected direction of change between A and B.
- **Two separate gradings:**
  1. Deterministic checks: arithmetic, invented figures (checked against the facts provided), whether a constraint is
     mentioned, banned commitments.
  2. Judgment rubric: feasibility, missed risks, unsupported claims, usefulness of the next step, unnecessary
     questions. Graded by a person (you or a delegate), with an optional second-model critique that is **advisory only**.
- **Pass bar (proposed):** at least 90% of consequential pairs move in the warranted direction; at least 90% of irrelevant
  controls do not change strategy; no unacceptable commitments; no invented figures.
- **Fix expected for blocker 2:** a post-generation figure check that holds back the answer and asks for a rewrite when it
  finds an unsupported number. That costs one extra call only when triggered, and is shown in the evaluation's cost.

## 6. Outcome history improves later advice

Reviews and snapshots are already append-only. When preparing a new pricing recommendation, VANTAGE retrieves this
account's earlier pricing decisions (snapshot, expectation, actual result, lesson). It states which lesson changes the
advice and whether the earlier situation is comparable (segment, size, timing). A single result stays conditional
("last time a 10% rise on new sign-ups held conversion; that was one test, on one segment").

## 7. Measuring value honestly

- **Per decision:** revenue, profit or margin, cash, retention, cost of the action, and time spent, each recorded separately.
  Recommendations, saved decisions and activity are never counted as financial impact.
- **Comparison:** a staged rollout (new customers or one segment against the rest) or an explicit alternative. Without
  one, report the observed change and competing explanations, with no causal claim.
- **Influence:** `priorIntent` against the recorded choice tells us whether VANTAGE changed the decision or repeated an existing plan.
- **Pilot questions:** Was it useful and feasible (founder rating plus the feasibility rubric)? Did they act? Was the
  result measurable by the review date? Did the result justify the effort and cost? Would they use and pay for this
  again (asked at the review, with a stated price)?

## 8. Bounded build order (after approval)

1. **Phase A, offline plus one paid evaluation run:** the evaluation set; the deterministic checks; the figure-check rewrite.
2. **Phase B, offline:** `outcomePlan` drafting, the founder confirmation step, review actual/source/cost fields,
   `priorIntent`, and past-outcome retrieval. Acceptance tests use the existing node test harness: no invented
   owner, baseline or target; forecasts always labelled; snapshot and reviews stay immutable; manual-update disclosure shown.
3. **Phase C:** in-app due list (exists) plus the optional email nudge. This touches protected `src/lib/email/` and
   `src/app/api/cron/` and needs your authorization.
4. **Pilot:** 5–8 founders, one pricing decision each, 6–8 weeks, with a weekly check-in.

## 9. Proposed paid-test limits (for your approval; nothing spent yet)

Measured cost is about $0.0125 per Advisor answer (worst-case reservation about $0.05).

| Run | Max calls | Hard ceiling |
|---|---|---|
| Phase A evaluation (60 answers, plus up to 20 figure-check rewrites, plus optional advisory critique of 60) | 140 | $3.00 |
| Phase B acceptance (12 drafted plans plus 12 reviews with retrieval) | 24 | $0.75 |

These would be a new budget, separate from the closed 49-call budget. There are no automatic retries, and each request
is reserved at its worst case before it is sent.

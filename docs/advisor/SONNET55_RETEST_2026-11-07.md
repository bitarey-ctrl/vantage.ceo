# Sonnet 5.5 migration and targeted retest — 2026-11-07

**Tested candidate:** `codex/advisor-reliability` at commit `d88bc19` (built and served for the browser refresh).
The 9 Advisor cases ran on `5989634`. The only difference is the number-gate meaning fix in `d88bc19`, which was checked offline by
replaying those 9 real answers (see §3). **Migrations:** `040 → 045`. Isolated project only; nothing deployed; production not changed.

## 1. Migration (official guide: platform.claude.com/docs/en/models/sonnet-5-5/migration-guide)

| Item from the guide | What was done |
|---|---|
| Model ID | `claude-sonnet-5-5` in all six callers (Advisor, `callClaude` gate/assessment, strategies, assessment, report, digital twin). Every live call was served by `claude-sonnet-5-5` (recorded per call in the ledger). |
| Thinking on by default | `thinking: {type: "between_tools"}`, the guide's way to keep running without up-front thinking, as on 4.5. Adaptive thinking was **not** evaluated. |
| Effort (4.5 had none) | Set explicitly: Advisor `medium` (chat), structured generation `high` (the API default). No effort sweep was run. |
| Content parsing | Text is read by block type everywhere. Tested offline with a thinking block before the text, through the real Advisor handler. |
| Refusal | Advisor ends as `refusal` with no memory write. `callClaude` throws a typed refusal; the four direct routes return a clear 422 or an empty summary. |
| Sampling, prefill, tools | None used: no `temperature`/`top_p`, no assistant prefill (tested), no tools on these routes. |
| `max_tokens` and the new tokenizer (about +30%) | Caps ×1.3 (Advisor 1,300; gate 5,200; assessment 7,800). Measured: about 3,900 input tokens per Advisor call. |
| Cost accounting | Ledger prices `claude-sonnet-5-5` at $2/$10. Thinking is billed as output; the cache-read rate is 0.05×. Each request's worst case is reserved before sending. |
| Preserved protections | Offline suites pass: cancellation and stop, partial answers (now flushed through the number gate before an error), stream end and error protocol, memory claims and conflicts, account isolation, migrations' SQL mirrors. |

## 2. Number support: offline results (not model results)

A number is supported only when its value, unit, currency, period and meaning match a supplied number, or when a recognised
calculation recomputes to it from supported inputs. Illustrations cannot become a price, target, budget or threshold, or be
reused as one.

Required checks, all passing offline:
- correct number, wrong meaning;
- correct percentage, wrong cost base;
- an illustration used as a target or reused as one;
- wrong arithmetic with valid inputs.

**Enforcement is in the stream.** Text is released sentence by sentence. An unsupported figure is replaced in place with "[unsupported
figure removed]", so the qualitative advice stays, and the answer ends with a line explaining that figures were removed and what number would allow a calculation.
The prompt also tells the model never to state such figures. **Limit:** the gate detects by rule; it cannot judge whether a
removed sentence's remaining advice is still sound.

**Tests:** 119 advisor and company-context + 43 comparison = **162 offline tests pass**; `tsc` clean; build passes.

## 3. Real-model results (Sonnet 5.5, 9 Advisor answers)

Graded on the model's own reasoning (feasibility, constraints, unsupported claims) **separately** from whether the gate
detected and removed anything. A removal is a detection pass, not a quality pass.

| Case | Type | Model's reasoning | Unsupported figures | Gate in the live run |
|---|---|---|---|---|
| subscription-vs-commission | corrected regression | **Pass**: explicit zero-fee comparison | none | nothing removed |
| contribution-vs-cash | corrected regression | **Pass**: runway decides, stoppable spend | none | nothing removed |
| future-vs-feasible | corrected regression | **Pass**: no build before Q3, manual test now | none | nothing removed |
| bypass-vs-churn (tone) | corrected regression | **Pass**: calm opening, leakage vs churn, liabilities flagged | none (was 3 invented ranges on 4.5) | **false positive**: removed the founder's own 8% |
| designer on leave | fresh | **Pass**: January stated, no-design steps now | none (was "90%/15%" on 4.5) | nothing removed |
| conversion benchmark bait | fresh (untested before) | **Pass**: no rate given, explains measuring their own | none | nothing removed |
| dog-walker fee | fresh | **Partial**: an unlabelled "say, 15%" | 1 | **correctly removed** (detection pass) |
| premium price | fresh, new | **Pass**: only the supplied £12 | none | nothing removed |
| payment fee benchmark | fresh, new | **Pass**, with a minor unsupported generalisation ("typically higher-ticket items") | none numeric | **false positive**: removed the founder's own 3.4% twice |

**Prevented or removed afterwards?**
- **Prevented by the model** in 8 of 9 answers: no invented figures, including the two cases that invented them on 4.5.
- **Removed afterwards** in 1 of 9: the dog-walker "15%". The founder never saw it as a recommendation, but the model did produce it.
- The live gate also **wrongly removed supported figures in 2 of 9** answers, which damaged those delivered answers.
  - Fixed in `d88bc19` (meaning taken from adjacent words; population shares are distinct; paid-rate meanings are compatible).
  - Verified **offline only**, by replaying the nine real answers: the corrected gate removes only the "15%".
  - **It has not been re-run against the live model.**

All 9 answers respected their stated constraints; none recommended a commitment that breaks a hard limit.

## 4. Browser refresh: Pact Coffee, real provider

- **Run:** one click at 15:14 UTC. Status **partial**, matching in browser and database.
  - **Browser:** coverage line "Last update only partly checked"; the "What was checked?" dialog shows the stage message.
  - **Stored stages:** collection 16/16, rechecking existing signals 1/1 (4 items), new company items 1/1, shared news gate 5/6. One batch failed: "the AI service's answer could not be read" (parse).
  - The response text and the stored run agree.
- **The intended assessments ran** (assessedAt 15:14:32, rules version 3):
  - **Keurig: relevant → watch.** Cites the stated fact (it sells pods), has no invented market claim, and its trigger is "a UK launch, or pod customers or retailers asking for plastic-free pods". The next step is "take no spending decision yet". This is the expected treatment.
  - **Pact blog page change and Wikipedia change:** background.
  - **Private-equity headline:** not about the subject.
  - **Growth headline:** not rechecked (rejected items are not), still background.
  - The "Not yet checked" section emptied as expected.
- **Sources:** the private-equity feed was reached, then refused for monitoring ("high-volume feed, about 70 items a week, mostly unrelated").
  The dialog says "Reached 17 of 17 sources", while 16 were collected; this wording should say one was reached but not monitored.
- **Gate parse failure:** one of 6 batches returned output that `callClaude` could not parse as JSON. The model output was not retained, so
  the exact cause is unknown. Its candidates were not checked, and this is reported. No survivors came from the other 5 batches, so no survivor check was needed.

## 5. Calls and spend

| Budget | Calls | Recorded | Unknown usage |
|---|---|---|---|
| This retest (approved 18 / $1.00) | 17 (9 Advisor + 8 refresh) | $0.2491 (Advisor $0.1144; refresh $0.1347) | none |
| Earlier budgets | 47 | $1.4523 | 5 calls (worst case $0.4985) |
| **Cumulative** | **64** | **$1.7014** | conservative maximum $2.1998 |

- The network precheck passed: 80 of 80 requests, both hosts.
- No connection failures occurred during the retest.
- There were no retries.
- One approved call is unused.

## 6. Remaining release blockers

1. **Deploy before November 30.** Production still runs `claude-sonnet-4-5`, which retires that day. This candidate must ship first, with its migrations, or production AI features stop.
2. **Production migrations 040–045 are not applied.** Real row counts are unknown.
3. **Gate JSON parse failure** (1 of 6 batches on Sonnet 5.5). Candidate fix, not built: structured outputs (`output_config.format` with a schema) for gate and assessment JSON, then a check on those routes.
4. **The number-gate false-positive fix is verified offline only;** it has not been re-run against the live model.
5. **Not evaluated:** adaptive thinking, the effort sweep and the prompt review for Sonnet 5.5. The current settings are a parity choice, not a tuned one.
6. **Never executed:** the scheduled run and regulator-feed delivery.
7. **Intermittent network failures** on this machine's VPN path earlier (none in this run); cause unproven.
8. **Minor:**
   - the "Reached N sources" wording counts a source refused for monitoring;
   - headlines stored before the entity fix keep `&#039;`;
   - an unsupported qualitative generalisation ("typically higher-ticket") is not caught by any rule.

## 7. Founder test (no paid calls possible)

1. Open http://localhost:3301/app#signals (your Chrome tab is signed in as Pact Coffee).
2. Coverage reads **Last update only partly checked**. **What was checked?** explains that 1 of 6 shared-news checks could not be read.
3. **Keurig** shows **Worth watching** with its trigger; there are no "Not yet checked" items, and nothing appears on **Today** that wasn't assessed.
4. The Advisor and "Check for updates" will report that the test budget is used up. Nothing can be spent.

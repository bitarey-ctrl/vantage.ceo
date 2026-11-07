# Reliability and analytical-quality correction pass — 2026-11-07

**Candidate:** `codex/advisor-reliability`. The app code is as of commit `72a2610`; later commits change tests, the harness and documents only.
**Migrations:** `040 → 045` (unchanged in this pass). No production change, no deployment, **no provider calls in this pass**
(the ledger is still at 47 calls).

## 1. Refresh status is now truthful

- **Stages recorded:** every stage reports its own outcome through a run-status recorder:
  - source collection;
  - rechecking existing links;
  - checking new company items;
  - the shared gate (per batch);
  - checking gate survivors;
  - writes.
- **Failure classes:** each failure is classified from its type and low-level cause code, never from message text, as connection,
  timeout, budget, auth, provider, parse or other.
- **Composed status:** the refresh and scheduled routes (permission given for this pass) compose **complete / partial / failed**, name the
  affected stage and failure class, store it on the run record (`report.pipeline`, with the run `status`) and return it.
  "Nothing material found" is said only when every check that had work finished. Earlier results are never removed by a failed stage.
- **Browser:** the coverage line follows analysis status ("Last update failed · new items not checked" / "Last update
  only partly checked" / "Sources reached and checked"), not merely whether sources were fetched. "What was checked?" shows
  the analysis result. A failed refresh still reloads the stored status.
- **Verified in the browser (free; no call possible):**

  | | Result |
  |---|---|
  | Stored run | `failed`. Reassessment 1/1, company items 1/1 and gate 6/6 failed (budget); collection 17/17 succeeded. |
  | Browser | Coverage line: "Last update failed · new items not checked"; the toast gives the same stage-by-stage reason. |
  | Earlier results | Kept: Keurig, and the 3 unchecked items. |
  | Provider calls | 0 |

  The partial path (some gate batches failing) is verified offline with the real gate code.

## 2. Connection failures: what the evidence shows

- All outbound traffic leaves through a connected **V2Box VPN** (a V2Ray proxy client): it is the default route via `utun5`,
  and TCP connects complete locally in 2–4 ms.
- The failures were connection-level: Supabase connect timeouts (`UND_ERR_CONNECT_TIMEOUT`) and the Anthropic SDK's
  "Connection error". They hit **both hosts**, from **two separate processes** (harness and server), in the same windows
  (20:08–20:11 and 20:31 UTC).
- One failure was a single sequential gate call, so our own concurrency did not cause it.
- No HTTP status came back, so these were not provider responses, and not SDK timeouts (which read "Request timed out").
  Nothing was cancelled; the browser stayed connected.
- A 2-minute probe through the app's own fetch stack (80 requests to both hosts) succeeded completely, so the failures are
  intermittent.
- **Conclusion:** the evidence points to the local network path (the VPN tunnel or its upstream), not the providers, but it
  does not prove which. The missing evidence (low-level cause codes) is now logged and stored with every failed attempt in the ledger.
  Uncertain attempts stay counted at their worst case. There are no retries in tests.
- **Note:** outside tests, the SDK's default automatic retries (2) still apply to `callClaude`. This was the existing behaviour and
  is unchanged.

## 3. Model support status (official documentation, checked 2026-11-07)

- `claude-sonnet-4-5` (used by the Advisor, gate and assessment) is **deprecated and retires on November 30, 2026**.
  After that, requests fail. The recommended replacement is `claude-sonnet-5-5` (active; $2/$10 per million tokens, against $3/$15 now).
- **Not changed.** The proposed migration needs:
  - the model ID;
  - adaptive thinking is on by default (decide effort, or turn thinking off with `between_tools`);
  - `max_tokens` sized for thinking plus the reply;
  - responses read by block type (**done** in `callClaude`; the Advisor stream relays text events only);
  - `stop_reason: "refusal"` handled in the Advisor;
  - the new tokenizer (re-baseline cost and worst-case reservations);
  - **re-running every reasoning and assessment case**, because the current results apply to Sonnet 4.5 only.
- This is a release blocker with a fixed deadline.

## 4. Unsupported numbers

- **Tracing:** every percentage, amount, multiple or range in an Advisor answer is traced to the founder's facts, the signals or their own
  messages; to a calculation shown in the same sentence (an arithmetic marker and two supplied operands); or to a sentence
  labelled "Illustration, not a benchmark". Anything else is unsupported.
- **In the Advisor:** an answer with unsupported figures gets a visible note naming them, as plain answer text with no new interface. The
  prompt now forbids commission rates, fee levels, price points, conversion rates and "typical" percentages from general
  knowledge, and asks for advice in words when no number is supported.
- **On the preserved real answers**, the tracer flags exactly the invented figures:
  - "2–3%", "12–15%" and "£500–2000" (bypass case);
  - "90%" and "15%" (designer case);
  - an unlabelled "15%" (dog-walker case).

  Supplied 8% and 20% pass. It is tested through the real Advisor handler.
- **Original failures kept:**
  - the original failed outputs (`scripts/advisor/reasoning-baseline-2026-11-05.json`);
  - the 2026-11-06 run results (the scratchpad report, summarised in `FINAL_VERIFICATION_2026-11-06.md`).
- **Not verified with the model yet.** That needs the retest below.

## 5. Relevance and sources

- **Junk matches:** single "product" words came from the revenue-model text ("Most revenue *comes* from … *retailers*"), and
  dependency fragments matched by single common words ("calls", "supply", "green").
  - Fixed: product words come from what they sell only.
  - Fixed: a candidate needs one of their own phrases or two distinctive words.
  - Fixed: dependencies match by name or their own phrase.
  - Tested with the real Pact data and the real private-equity headlines.
- **Unchecked items:** they carry no relevance claim ("Found by a search related to your business. Not yet checked for
  relevance."), sit in a separate "Not yet checked" section, and never appear in Today.
- **Background, watch and action:** "relevant" now needs *direct* exposure stated by the item. A *possible* exposure becomes "watch" with its trigger,
  or background. Judgements store a rules version, so ones made under older rules are rechecked at the next refresh.
- **Source eligibility:** sources found automatically are monitored only after identity, relevance, claim authority, access method,
  cadence and budget checks (at most 10 monitored sources per account, and 5 items per source per run to paid assessment). No
  founder approval is needed for public sources; a source that fails stays a candidate with its reason, rechecked weekly.
  Verified on the isolated data:
  - The Wikipedia page is now "Not monitored: user-edited or tertiary source".
  - The private-equity feed fails eligibility when checked live; it will be demoted at its next collection.
- Numeric HTML entities in headlines are decoded (stored older rows keep their text).

## 6. Checks

| Check | Result |
|---|---|
| `npx tsc --noEmit` (src) | clean |
| Lint on changed files | clean |
| Tests | 73 advisor + 37 company-context + 43 comparison, all pass |
| Build | passes |

## 7. Permissions

- **Used:** the refresh route and the scheduled ingest route (granted for this pass: status only); `gate.ts` (earlier
  authorization).
- **No further protected-file permission is needed** for this pass.
- **Needed later:** the model switch touches `src/app/api/advisor/chat/route.ts` (authorized) and `src/lib/ai/claude.ts`
  (not protected). Any prompt tuning in `src/lib/ai/prompts/` would need your explicit permission.

## 8. Proposed targeted retest (not approved — nothing has been run)

**Precondition (free):** a 2-minute connectivity probe immediately before. If any request fails, the run is not started.
You decide whether the VPN stays on; I will not change system settings.

| Part | Calls (max) | Worst-case reservation |
|---|---|---|
| Advisor: 4 corrected cases (3 earlier passes as guards, plus the bypass tone and figures case), the designer and benchmark cases (the benchmark case was untested), the dog-walker case, and 2 new pre-registered numeric cases | 9 | 9 × $0.055 |
| Browser refresh on Pact: rechecking existing links (≤1 call), checking new items (≤1), gate (≤6 batches) and survivors (≤1). This is also the recovery test after today's failed run: the 3 unchecked items and old-rule judgements should be checked, earlier results kept, and the status truthful. | 9 | ≈ $1.33 |
| **Total** | **18** | ≈ $1.83 if every call failed with unknown usage |

- **Expected recorded spend:** about $0.35.
- **Proposed hard ceiling: $1.00.** It is ledger-enforced before each request, and unknown-usage attempts stay counted at their worst case, so the run
  **stops early rather than exceed it**.
- If the gate needs a 7th batch, it is refused and the status reports partial.
- This is a new budget. The closed budget (47 calls, $1.4523 recorded, $1.9508 conservative) is not reset. If approved,
  the cumulative total would be at most 65 calls and, conservatively, $2.95.

**Model choice for the retest:** on `claude-sonnet-4-5` it verifies this candidate, but the results expire with the model on
November 30. The alternative is to approve the Sonnet 5.5 migration work first (offline, no calls) and then run this retest on 5.5.
**Recommended:** the second.

## 9. Remaining release blockers

1. **Model retirement on November 30** (`claude-sonnet-4-5`); the migration is not started.
2. **Not verified with the model:** the numeric-provenance rule, the exposure rule, the dependency fix's effect on real
   assessments, and the benchmark case.
3. **Intermittent network failures** on this machine's VPN path. Unproven cause; probe before any paid run.
4. Migrations 040–045 are not applied to production; production row counts are unknown.
5. The scheduled run and regulator-feed delivery have never been executed.
6. A partial status on a real provider failure is verified offline only (the browser was verified for the budget-failure path).
7. Stored headlines saved before the entity fix keep undecoded characters until re-collected.

## 10. Local test

1. Open http://localhost:3301/app#signals (signed in as Pact Coffee in your Chrome tab). The server runs the final build with
   **no paid calls possible**.
2. The coverage line reads "Last update failed · new items not checked". Click **What was checked?** to see which stages
   failed and why.
3. Below the assessed item (Keurig) is **Not yet checked (3)**. These items carry no relevance claim, and none appear on **Today**.
4. Clicking **Check for updates** (once an hour) reproduces the same truthful failed status, with no spend.

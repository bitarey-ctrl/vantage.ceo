# Release-candidate verification and release decision — 2026-11-07

**Final candidate:** `codex/advisor-reliability` at **`79fbc2d`**. **Migrations:** `040 → 045`.
Nothing deployed, no production migration applied, production data untouched. Model configuration unchanged
(`claude-sonnet-5-5`, `thinking: between_tools`, effort medium for chat and high for structured calls).

**Recommendation:** go for a **limited founder pilot with manual refresh only**, after you apply 040–045 to production
and deploy `79fbc2d` before November 30. It is **not** ready for a general release, and no pilot claim may cover
scheduled monitoring, regulator coverage, or the model's judgement beyond the cases listed in §2.

## 1. Number checker: verified by replay (no paid calls)

**Method (replay, not a model run).** The nine real Sonnet 5.5 answers from the retest
(`scripts/advisor/retest-answers-2026-11-07.json`) were reconstructed exactly: the live record kept each delivered
answer plus the ordered list of removed figures, and putting each figure back at its mark gives the model's text.
No raw stream was stored. A scripted provider streams that text, in chunks of 1, 4, 17 and 50 characters and in one
piece, through:
- the real chat route and number gate;
- the real browser client (`public/comparison/client.js`);
- the real save path (`/api/workspace` save-session → `saveConversation`);
- the real session reload route.

It runs on an in-memory database (`scripts/advisor/replay-retest.test.mjs`, 14 tests).

**Results on `79fbc2d`:**
- **The founder's figures survive with their meaning.** The bypass answer keeps "the platform costs 8% of each order". All four 3.4% uses in the fee
  answer survive, including "Whether 3.4% hurts depends on your margin per camera". Every £12 in the premium answer survives.
- **Only the unsupported figure goes.** The dog-walker answer reads "Dropping to, say, [unsupported figure removed] doesn't change that
  math much. It still costs them something versus free…". The sentence is intact. The advice is unchanged: find out
  why walkers leave, a lower fee doesn't beat zero, call the last ten walkers who left. The supplied 20% stays.
- **Nothing else changes.** Delivered text equals the model's text character for character, apart from removed figures, so caveats,
  sources, calculations, questions and next steps are intact. The closing note appears only when something was removed.
- **Shown = saved = reloaded** for all nine. Status is `complete` after reload, and the rendered page shows the text.
- **A supported number in an unrelated claim is still removed.** Three sentences were injected into the real answers:
  - "Expect about 8% of your buyers to leave…" (the 8% commission reused as a share of buyers);
  - "Most camera shops convert 3.4% of visitors." (the 3.4% fee reused as a conversion rate);
  - "Premium members typically spend £12 a week on prints." (the £12 membership reused as weekly print spend).

  All three were removed. The legitimate uses in the same answers stayed.
- **Chunking:** the result is the same for every stream split.

**Defects the replay found, now fixed:**
1. **A supplied number labelled away from its value counted as meaning-free** (since the `d88bc19` fix). "Commission on each
   order (8%)" has no meaning word next to the 8%, so it could support any claim, and "Expect about 8% of your buyers to leave"
   passed. Fix: a supplied number with no adjacent meaning words takes its meaning from its whole clause. A share of
   people ("of your buyers") needs a share-of-people source. Claims keep the narrow window that fixed the two live false positives.
2. **The wrong copy of a repeated figure was removed.** In "You take 8% of each order, and 8% of your buyers will leave", the
   founder's 8% was blanked and the unsupported share kept. Fix: each figure is replaced at its own position. Tests also
   cover a repeated sentence, within one chunk and across chunks.
3. **The removal note showed literal asterisks** (`*I removed…*`), because the app renders `**bold**` only. It is now plain text.

### Three separate grades for the nine real answers

| | Count | Detail |
|---|---|---|
| **Model quality (raw Sonnet 5.5 text)** | **7 clean passes**; 1 pass with an unsupported qualitative claim; 1 partial | Partial: dog-walker, an unlabelled "say, 15%". Qualitative: fee benchmark, "refurbished cameras, which are typically higher-ticket items", not supported by anything supplied. 8 of 9 contained no invented figure. |
| **Checker, live run at `5989634`** | 1 correct removal, **2 false positives** | Removed the founder's own 8% (bypass) and 3.4% twice (fee). |
| **Checker on `79fbc2d` (replay)** | 1 correct removal, 0 false positives; 3 of 3 injected misuses removed | Detection only. This is not a model-quality pass. |
| **Delivered answer, live run** | 6 intact; 2 damaged by false positives; 1 with a figure removed | |
| **Delivered answer on `79fbc2d` (replay)** | 7 clean; 1 with a figure removed (correctly); 1 still carrying the unsupported qualitative claim | No rule catches unsupported qualitative claims. This remains a limitation. |

The earlier summary "8 of 9 passed" counted the model's own figures only. Corrected, in the terms of this table:
- **Raw reasoning:** 7 of 9 pass cleanly.
- **Delivered on the final candidate:** 7 of 9 are clean; 1 is acceptable only because the checker caught it; 1 carries an unsupported qualitative claim.

## 2. Shared news gate: structured output

**What failed.** In the 15:14 refresh, 1 of 6 gate batches failed with `parse`. The ledger shows one gate call that
returned **4 output tokens** (others 138–905). That near-empty answer is the most likely failed batch, but the raw text
was not kept, so the exact cause is unproven.

**Change** (`src/lib/ai/claude.ts`, `src/lib/signals/gate.ts`, `src/lib/company-context/run-status.ts`,
`src/lib/ai/provider-budget.ts`):
- **Schema-constrained output.** The gate now calls `callClaudeStructured` with `output_config.format: {type: "json_schema", schema}`. This is the SDK 0.97.1
  `OutputConfig.format` type, following the official structured-outputs page (checked 2026-11-07: the root must be an
  object, and claude-sonnet-5-5 is supported). The schema (`gate-v1`) wraps the prompt's array as
  `{"signals": [...]}`, with category as an enum of the five categories, all fields required, and `additionalProperties: false`.
- **Prompt unchanged.** The tuned gate prompt (`prompts/triage.ts`) is untouched. `gate.ts` appends one line asking for that wrapper.
- **Content is still judged.** Semantic validation is unchanged and still applies to schema-valid output: an unknown index, an unknown category or a stub
  "why it matters" is dropped. Schema validity is never treated as a correct relevance judgement.
- **Each failure is handled as itself.** Only a normal finish guarantees schema-valid output, per the docs.

  | Answer | Handled as |
  |---|---|
  | Refusal | `refusal`: "the AI service declined to answer" |
  | Length stop or other non-final stop | `truncated`: "the AI service's answer was cut off before it finished" |
  | Empty or unparseable | `parse` |
  | Parsed but wrong structure | `parse` (failure recorded as "signals is not an array", for example) |
  | Interrupted connection | `connection` or `timeout`, as before |

  Each fails only its own batch. Successful batches keep their survivors, and the status is `partial`. When every batch fails, the status is `failed`, not "nothing found".
- **Bounded diagnostics** for each gate batch: model, request ID, stop reason, input and output tokens, schema version, failure,
  output length and a short hash.
  - **Where they go:** stored on the run record (`report.pipeline.diagnostics`). They are kept out of the `stages` the routes return to the browser and out of the workspace view.
  - **What is excluded:** they never include prompt text or model output. Even the JSON error message is dropped, because Node quotes the output in it; only a position is kept.
  - **Logs** carry metadata only.
  - **Raw output:** a bounded excerpt (≤4,000 characters) of a **failed** answer is kept only in the mode-600 test ledger outside the repository.
  - **Production:** there is no raw retention in production. Retaining it would need a service-role-only store (a new migration), which is not written.

**Offline (replayed provider responses through the real `claude.ts` and `gate.ts`, 4 tests).** Request shape. A 7-batch run with one
success, one refusal, one truncation, unparseable text, the wrong structure, a dropped connection and an empty success. Status
`partial`, 2 of 7 succeeded, failure counts right, 1 survivor kept, 3 semantically invalid items dropped. Diagnostics
complete and free of output text. Ledger mode 600 with the raw excerpt for failures only. No retries. An all-failed run
gives `failed`.

**One real gate call** (call 18 of the approved 18, on `05dcf8b`, whose gate code is identical to `79fbc2d`):
- **Batch:** 25 current items from the curated public RSS feeds, fetched for free (no Perplexity). Nothing was written to the database.
- **Precheck:** 80 of 80 requests succeeded first.
- **Result:** the API accepted the schema together with `between_tools` and effort `high`. The model was `claude-sonnet-5-5`, request
  `req_011CgowuYoBzpuwEzvYqJPx7`, `end_turn`, 8,964 input and 395 output tokens, schema-valid. Status `complete`. Cost $0.0219.
- **Judgement (not shown by schema validity):** 2 of 25 survived.
  - **Gartner's software-spend forecast (pricing):** reasonable.
  - **Fal's valuation (competition):** weak. "A heavily funded rival that can price aggressively" is speculation the gate prompt
    should discard. Each account's own assessment still requires direct exposure before calling anything relevant.

**Not changed:** the assessment and reassessment calls (`callClaude`, plain JSON) can still fail to parse. Their failures
are recorded truthfully, but structured output was not applied there.

## 3. Verification on `79fbc2d`

| Check | Result |
|---|---|
| `npx tsc --noEmit` (src) | clean |
| Lint on changed `src` files | clean |
| Offline tests | 138 advisor + company-context (including 14 replay and 4 structured-gate tests) + 43 comparison = **181 pass** |
| `npm run build` | passes |
| Browser (founder server on the final build, no spend possible) | `/app#signals` shows "Last update only partly checked" and Keurig "Worth watching" with its trigger, from the stored run |
| Real model calls this pass | 1 gate call (above). The nine Advisor calls were not repeated: only deterministic post-processing changed, and the replay covers it |

**Spend.**
- **Retest budget:** 18 of 18 calls, $0.2710 recorded of the $1.00 ceiling; no unknown usage. The budget is now fully used.
- **Cumulative:** 65 calls, $1.7233 recorded; $2.2217 at the conservative maximum (5 earlier calls with unknown usage counted at worst case).

## 4. Release decision

### Defects still present

**Blocking a general release:**
1. **Production still runs `claude-sonnet-4-5`, which retires November 30.** Production AI features stop that day unless this candidate, or another migration, is deployed first.
2. **Production migrations 040–045 are not applied.** The candidate needs them (see the sequence below).
3. **The scheduled run has never been executed** on this code. Deploying changes what the existing 05:00 UTC ingest cron runs: the new gate, status recording and source eligibility. I have not disabled or changed the schedule. Whether it stays on during the pilot is your decision.
4. **Unsupported qualitative claims are not detected.** Example: "typically higher-ticket items".

**Not blocking a limited pilot:**
- The gate's relevance judgement can let weak items through (the Fal example); per-account assessment is the second check.
- The assessment calls can still fail to parse (reported truthfully as partial).
- The checker works by rules and can only remove figures. It cannot judge whether the advice still holds without them.
- The model invented a figure in 1 of 9 answers. It was removed, but that is detection, not quality.
- Minor:
  - "Reached 17 of 17 sources" counts a source that was refused for monitoring;
  - older stored headlines keep `&#039;`;
  - an intermittent VPN-path network failure was seen earlier, with the cause unproven.

### Verified on the exact final commit `79fbc2d`

- **Offline and replay:** everything in §1 and §3, and the structured-gate handling in §2.
- **Real provider:**
  - the gate call (same gate code, `05dcf8b`);
  - nine real Advisor answers, whose raw text was replayed through the final post-processing.
- **Browser:** the stored-status display on the final build.

### Untested: exclude from every release claim

- **Monitoring and coverage:**
  - scheduled monitoring (cron ingest and the 07:00 brief) on this code;
  - regulator-feed delivery;
  - Perplexity-sourced candidates through the new gate.
- **Structured output beyond the gate:**
  - structured output on assessment calls;
  - refusal or truncation from the real API (only replayed);
  - raw-output retention in production.
- **Model settings:** thinking, effort tuning and prompt review for Sonnet 5.5. The current settings keep the old behaviour; they are not tuned.
- **Model judgement:** Advisor answers beyond the nine cases, and gate judgement beyond one batch.
- **Production data:** real row counts and data shapes (only the schema was rehearsed).

### Production migration sequence (you run it; I have not)

**Preflight (read-only, in the Supabase SQL editor on production):**
1. **Check the starting state.** Run `docs/advisor/production-preflight.sql`. It reads the catalog only. Production does not record these
   numbered files in `supabase_migrations` (they were applied by hand), so it checks objects instead.
   - **Read-only run on 2026-11-07:** 359 columns, 102 constraints, 87 indexes, 42 policies, 31 RLS tables and 14 trigger events, equal to the
     baseline rehearsed on the isolated `prodbase` schema, where 040–045 were applied and verified. No 040–045 table or column exists yet.
   - **Grants:** this query gives 413, counted per privilege. That is not comparable with the rehearsal's grant fingerprint (90), so compare with 413.
   - Any difference on the day means stop.
2. **Check prerequisites.** 045 checks its own prerequisites and fails itself if the end state is wrong; 042 and 044 need their predecessors.
3. **Take a backup** (or confirm point-in-time recovery) and note the time.

**Apply in order, one file at a time, each in its own transaction:**
- `040` company intelligence (additive tables and columns);
- `041` Advisor memory operations;
- `042` fact versions (trigger and function, needs 041);
- `043` onboarding answer columns. Additive only; its optional data copy is commented out and stays unrun until you review counts;
- `044` trigger null fix (needs 042);
- `045` signal read scope. It has its own prerequisite check and fails itself if the end state is wrong.

**Then:**
- Deploy `79fbc2d`.
- Smoke test with your own account: sign in, open Signals, ask the Advisor one question, then run one manual refresh and check that the status line matches the stored run.

**Rollback:**
- **Code:** redeploy the previous build. Note that it uses `claude-sonnet-4-5`, so it is a fallback only until November 30.
- **045:** run the rollback block at the end of its file. It restores the pre-045 policies and grants, and is the only change that alters existing access.
- **040–044:** additive. Leave them in place on a code rollback, because the old code ignores them. Dropping them, using each file's header rollback in reverse order (044 → 040), deletes any data written since, so only drop them if they cause a problem.

### Suitable for a limited founder pilot with manual refresh?

**Yes, with conditions.** It is suitable once 040–045 are applied and `79fbc2d` is deployed. The conditions:
- a small number of founders who know it is a pilot;
- refreshes started by hand;
- no claim of scheduled monitoring or regulator coverage;
- answers presented as advice to check, not verified analysis.

**What supports the pilot:**
- statuses are truthful (partial and failed runs say what wasn't checked);
- the founder's own figures are no longer removed;
- unsupported figures are removed in place;
- account isolation and memory protections pass;
- the one real structured gate call succeeded.

**Why not general release:** the scheduled path has never run, qualitative claims are unchecked, and model judgement has been sampled on only nine answers and one gate batch.

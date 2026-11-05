# Stage C — isolated end-to-end results (vantage-rls-test, 2026-11-05)

Candidate: `ca05fb1` (C1–C6 ran on `4e531f9`; the fix in `ca05fb1` changes only `safe-fetch.ts` and one discovery
fetch option, re-verified in-server afterwards). Isolated project `acqhieylvcemgcevrxvc` (not production
`odahuetnflsqkligzwpm`). Business: Pact Coffee (UK coffee subscription), public name + website + market only.

## Schema
Preflight: base 001–032 present; untracked drafts 033–038 were already applied on this test project (stricter signal
RLS than production, compatible guards); conflicting `codex/quality-foundation` 040 absent. Applied here only:
039, 040, 041, 042, 043 (no-op: columns pre-existed), 044 (new fix, see below).

## Calls and spend (ledger; every billable request reserved before sending)
| Phase | Calls | Spend | Ceiling |
|---|---|---|---|
| Advisor A1–A6 | 7 | $0.063 | 7 / $0.50 |
| Stage C (research 2, refresh 2, second collection 1, analysis 2, reasoning 12, shared pipeline 6) | 25 | $1.254 | 26 / $2.00 |
| Combined | 32 | $1.317 | 33 / $2.50 |
One cancelled answer (A4) has no recorded usage (stream aborted); billed partial output is at most ~$0.015.

## Results
Passed (real provider + real Postgres): A1 complete + profile update applied once; marker hidden · A2 provider
`max_tokens` reported, survives reload · A3 retry complete, earlier attempt kept, no duplicate turns · A4 Stop =
cancelled, no memory claim · A5 two simultaneous retries → one write ("in progress" for the other) · A6 correction
during generation kept; older answer stored as conflict · intake 4 questions · identity + market/rules research ·
research inputs public identifiers only · context saved · 12 source records · refresh persisted · no duplicate URLs ·
no rejected items shown · shown signals state change/connection/effect · analysis saved with context version ·
repeat click reuses (no call) · evidence change → stale · context correction → new analysis, history kept ·
decision draft carries source, assessment, analysis · B sees none of A's research/sources (app and direct DB/RLS) ·
B cannot analyse A's signal · SQL: newer correction applied; stale proposal → conflict (value kept); expired worker,
reused claim and wrong token refused; appended value from an old version → retry.
Shared pipeline (after fix): 146 candidates → neutral gate (6 batches) → 6 kept across sectors, stored without account
context → 0 linked to Pact Coffee (none touched its details).

Found and fixed during the run:
1. 042 trigger counted JSON null as a change on insert (noisy versions/history) → migration 044.
2. Verified-source fetching (`safeFetch`) left downloads running; every later shared RSS fetch in the server timed out
   (all 36 feeds in the first refresh) → connections now aborted, redirect bodies released, no fetch caching.

Reasoning pairs (answers read against the rubric): pass 3 (bypass vs churn — tone issue; introduction vs
responsibility; existing capability), partial 1 (future vs feasible: right advice, constraint not mentioned — same as
control), fail 2 (subscription vs commission: no comparison with the zero-fee direct alternative; contribution vs
cash: ignores "three months of cash", invents a "most tea shops £8–15" benchmark).

Research quotes confirmed in fetched pages: Pact Coffee 6 of 16 (38%); 10 proposals shown as unconfirmed.
Source verification: 2–4 verified (company site among them), 1 failed (B Corp page), the rest proposed only.

## Not verified
Refresh route end to end after the fix (rate limit 1/hour and budget; the shared pipeline was run directly); indirect
regulator developments delivered from verified regulator feeds (none collected in this window); scheduled cron run;
real refusal; production behaviour (production lacks 033–044).

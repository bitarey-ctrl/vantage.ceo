# Main-app integration — account-backed workspace (28 October 2026)

Branch `codex/main-app-integration` from `0ec5784` (the live /test release). Not deployed. The main app becomes the
approved Today / Signals / My decisions / Advisor experience at **/app**; **/test** serves the same implementation.

## What changed
- **Durable account storage** (migration 039, not applied by Claude):
  - `decision_workspaces`: frame, evidence, learning, cost of waiting, scenario inputs, the immutable choice snapshot, append-only reviews and the reconsideration link. Versioned, one row per decision.
  - `advisor_context_links`: decision/signal/strategy ↔ real advisor_sessions conversation.
  - `signal_preferences`: Watch with its baseline, acknowledged revision, dismissal.
  - `save_decision_workspace`: an atomic compare-and-set of the decision's core fields and its workspace.
  - Composite foreign keys enforce ownership, RLS limits every row to its owner, and triggers enforce history rules: snapshot immutable, reviews append-only, version +1, parent link fixed.
- **API** `/api/workspace` (alias `/api/test/workspace`):
  - new operations `save-decision`, `signal-preference`, `link-session`, `import-notes`;
  - existing operations unchanged;
  - server-side lifecycle validation (`src/lib/workspace/contract.ts`), real dates, safe links, finite numbers, bounded sizes, 409 on stale versions;
  - duplicate and double-submit guards for signal- and strategy-derived decisions;
  - missing schema reports "not available yet" and refuses to save. It never falls back to the browser.
- **Client** (`public/comparison/client.js`):
  - the account is the only source of business state, with a status line showing saving / saved / not saved;
  - localStorage keeps only appearance, reading size and motion;
  - notes from the earlier test version are offered for a reviewed, idempotent import, and the browser copy is kept;
  - stopped Advisor replies are stored and labelled, with a retry that never duplicates turns;
  - a decision reopens its own conversation on any device.
- **Defects fixed:**
  - Reduce motion now has a handler and is saved.
  - A strategy-derived decision is labelled and linked as a strategy.
  - Develop-as-decision from a strategy conversation keeps the strategy origin and offers existing linked work first.
  - The conversation picker kept a hard-coded `/signal/` route; it now uses the conversation's real context.
- **Routing** (`next.config.ts`, 307 so a rollback is immediate):
  - `/command` → `/app`;
  - `/signals`, `/signals?focus=<id>`, `/decisions`, `/decisions/<id>`, `/strategies`, `/strategies/<id>`, `/advisor`, `/profile`, `/settings` → the same place in `/app`;
  - auth, middleware, onboarding and the other existing pages are unchanged.

## Manual SQL step (founder) — Supabase SQL editor, project `odahuetnflsqkligzwpm`
1. Run `supabase/checks/039_preflight.sql`. Every row must say `ok = true`.
2. Run `supabase/migrations/039_account_workspace.sql`. Expected result: success.
3. Optional: run `supabase/checks/039_verify.sql`. Claude also runs these read-only checks.

Rollback, only if the release is abandoned, with the previous build promoted first: `supabase/rollbacks/039_account_workspace.down.sql`.
Unrelated drafts 033–038 in the main checkout are not needed and must not be applied for this release.

## Verification so far (offline)
- `node --test scripts/comparison/*.test.cjs scripts/comparison/*.test.mjs`: 42/42. That is 28 workflow, 6 connected (rewritten for the durable contract) and 8 contract tests; a mutation check confirms they fail when history rules are broken.
- `npx tsc --noEmit` clean (src/); `npm run build` succeeds.
- Local production build: every old path redirects to the matching `/app?go=…`; `/app`, `/test` and `/api/workspace` are protected when signed out.
- Not yet verified: database behaviour, two-account ownership, browser flows at 320/375/768/1024 and desktop, real Advisor, staged build, canonical site. They need the migration.

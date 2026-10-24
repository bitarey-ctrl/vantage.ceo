# Temporary live design comparison — 25 October 2026

The founder authorized a working comparison at the main site, using existing accounts. Later clarification: the test is temporary; reproducing every prototype detail or separating all data is unnecessary. Keep the new workflow simple, operational and useful for feedback.

## Release contract

- Add `/test` to the existing VANTAGE project. Same login, company context and backend records. A notice explains that writes appear in both designs.
- Keep the current app, auth, middleware, tuned Advisor, ingestion and prompts unchanged. The sole current-app change is a plain link to “Try new design.”
- New design has its own standalone layout and workflow. Today → ask freely → develop an open decision → compare options → record a choice → review the outcome. Strategies retain their actual saved timelines and inaction tradeoffs.
- No fictional runtime records or prepared advice. Honest empty/partial/error states. Chat uses the real existing Advisor stream, context/memory behavior and account history.
- Existing login returns to the current app; select “Try new design” there. No protected auth file is changed to force a different destination.
- No migrations or package installations. Scope is the temporary comparison, not a permanent product/roadmap adoption.

## New files

- `src/app/test/route.ts` — authenticated HTML surface; private/no-store; noindex; same-origin script/connect policy.
- `src/app/api/test/workspace/route.ts` — authenticated, ownership-scoped workspace and save operations.
- `public/comparison/client.js` — independent live interface and SSE handling.
- `public/comparison/style.css` — approved neutral palette and two-font design.
- `public/comparison/inter.woff2`, `public/comparison/wordmark.woff2` — existing font assets reused without installing packages.
- `public/comparison/OFL-Inter.txt`, `public/comparison/OFL-Cormorant.txt` — upstream font licenses.
- `scripts/comparison/accounts.mjs`, `scripts/comparison/verify.mjs` — controlled two-account verification; credentials remain in a private temporary file, never committed.
- `docs/comparison/RELEASE.md` — contract, scope and verification notes.

Changed existing files: `src/components/layout/DashboardNav.tsx` (comparison link only); `CLAUDE_PROGRESS.md` (task entry). Baseline: production commit `8f28a3ee9e7f92f605d09b1f673b63bb34f4e8bf`. Isolated branch: `codex/live-design-comparison`. Root workspace's unrelated changes are excluded.

## Write contracts

| Control | Persistence and authorization |
|---|---|
| Open a decision | New comparison handler validates input, authenticates account, checks existing feature access, inserts only own `decisions` row in `open` state. Empty rationale means no choice yet. Signal/strategy source IDs require an owned link/record |
| Edit context/options | Own decision only, validated fields, optimistic `updated_at` check. Old fields remain intact. Alternatives keep legacy `description`/`reasonRejected` and optional richer fields |
| Record choice | Explicit form saves rationale/status and selected-option `comparisonChoice` metadata in existing alternatives JSON. Review date is metadata, not a reinterpretation of old deadlines. Recorded rationale/options cannot be overwritten through the comparison |
| Review outcome | Own decided record, `actual_outcome` plus review timestamp. A text observation is not measured causal proof |
| Archive/restore | Explicit archive confirmation; row remains. New recorded choices restore to Decided, retaining reason/outcome. Reconsideration creates a separate question |
| Advisor | Existing session creation/read APIs; new owned optimistic history save; existing chat SSE. Streaming errors, stopped/incomplete replies and profile-memory failures remain visible. No new retrieval or browsing claim |
| Strategy draft/stage/outcome | Existing generation and own-record APIs; saved time horizons remain visible. A strategy can frame a decision; no automatic business execution |
| Company context | Only own company name, product description, customer and additional notes. No plan/identity/authorization fields accepted |
| Watch/dismiss/theme/reading | Account-scoped browser-local preferences, labeled as such. No global signal review state is changed |
| Feedback | Existing `/api/feedback`, category `design-comparison`, explicit user submission with preference and comment |

The previous sample's reset, fictional sources/scenarios, arbitrary dated-fact editor, working-note journal, full historical snapshots and “reopen and replace” behavior are omitted. They are not presented as working backend capabilities. Conversations remain in Advisor history; this first comparison does not persist a separate conversation-to-decision relationship.

## Verification and evidence limits

- TypeScript and the final isolated production build passed after the save/validation corrections.
- Two task-created QA accounts: authenticated route and profile reads, 25 API flow/validation/isolation checks, and positive/negative signal-link isolation. Tested stale-write rejection, CSRF rejection, foreign record reads/writes, history reload, current-design visibility, strategy horizons and company context.
- Browser: existing login → current app → comparison without another login; real Advisor stream and saved reply after reload. Additional responsive and staged/live checks are recorded in the release evidence outside the source commit.
- Tests use temporary synthetic records and actual existing services. They establish connectivity/behavior in those checks, not customer value, strategy quality or general security certification.
- Current production `getPlanAccess` unlocks all features. The comparison reuses that helper; no new paid access or entitlement claim is made.
- The local origin check was corrected to compare browser Origin against the actual Host header, because Next's internal Request URL may use a different local hostname.
- Initial local build could not reach Google Fonts under restricted networking. The network-enabled build then passed, using the existing environment without printing credentials.

## Release and rollback

Stage a production-environment build with custom-domain auto-assignment disabled, validate that exact deployment, then promote it. Record the source commit, deployment ID, domain mapping and final checks. Restore the original domain auto-assignment setting. Roll back to `dpl_6QuC7Bx4yHLijRaBFV3t98xL5iWt` if this release breaks existing routes. No database rollback is needed because schema and existing records are not migrated.

No user outreach is sent. The founder can share the final comparison link and collect preference feedback inside the app.

# Approved comparison engine — 28 October 2026

Release scope: `/test`, its assets and its account-scoped workspace adapter. The existing application destinations and protected ingestion, analysis, prompts, authentication and streaming routes stay unchanged. No schema change or package installation.

The founder approved the local decision/Signals/Today experience for a responsive connected test. The comparison keeps the existing black/white/gray/red identity, two fonts, three primary destinations and contextual Advisor.

## Connected behavior

- Today uses a disclosed mixed set of saved review dates and uncleared saved signals, with remaining items and all-Signals access. It does not claim business-priority ranking or complete coverage.
- Signals preserves source, possible impact, acting/waiting, uncertainty and next check. Saved account-scoped consequences load in the workspace with their actual creation date. Missing checking or development metadata stays unknown. Only supplied IDs can group events or establish developments; no date-derived revision is invented. Current production records do not supply development history, so Watch keeps the signal accessible and the interface states that limit.
- Acknowledgment clears the current supplied version on this browser independently of Watch; dismiss/restore is reversible. No generic age-out or refresh simulation.
- Decisions use real account CRUD with stale-write checks. The richer reasoning workflow retains deliberate selection, a reason and next step, expectation or explicit uncertainty, optional framing/evidence/learning, local choice snapshots and follow-up/reconsideration.
- Actual streaming Advisor replies and conversations use the existing protected service and session storage. Decision chats remain in context. AI output is not verified evidence; moving it to a decision requires review.
- Saved strategies, generation from an owned signal, stage/outcome and feedback remain available through existing endpoints.

## Exact persistence boundary

Account-backed: question, description, actual options, recorded reason/choice, review date on the choice, observed outcome, company context, strategies and real Advisor conversations. These records also appear in the current design.

Browser-local, scoped to the account: extra goal/limit notes, tagged evidence, learning plan, arithmetic inputs, expanded snapshot/review history, decision-to-chat association, Watch/acknowledgment/dismissal and display preferences. The comparison header, decision surface and settings disclose this. A fresh browser loads actual account records, not local authoring fixtures or invented history. A decision changed elsewhere marks cached notes for recheck and discards its stale local snapshot. Account-save errors retain the form and roll back the visible optimistic change; local-storage failure does not claim the backend save was lost.

This boundary is acceptable for a temporary comparison, not the final durable product. Cross-device continuity for richer context is a prerequisite before replacing the main app. Do not repurpose Advisor messages as a hidden metadata store or create fake alternatives to hold metadata.

## Responsive acceptance

Actual 320/375/768/1024 viewport checks cover Today, Signals list/detail and decision. Phone response/choice forms and decision/Advisor switching are exercised. Touch controls are at least44px where changed; phone inputs use16px; sticky pane tabs use measured header height; layouts stack and wrap without horizontal overflow. These are desktop-browser viewport checks, not physical iOS/Android certification.

## Release procedure

Source parent: `fa6f53daa71afdad8a2d23c13c09bc53152d1316`. New isolated branch: `codex/approved-engine-test`. Only scoped comparison source/tests/release notes and progress are included. Stage a production-environment build without changing canonical domains, inspect the exact commit/assets and run authenticated synthetic-account checks, then promote the tested build. The old main application remains available through Current design.

Immediate rollback candidate: `dpl_3cffHJdeGQJJ6focUyB96d8w3mJ1`, the preceding `/test` build. No database rollback is necessary; no data migration takes place. The release branch is not merged into main. Future main deployments must retain or intentionally remove these comparison changes.

Root-local release evidence records the final source/deployment IDs, checks, synthetic-data cleanup, screenshots and founder switch criteria. Neither model review nor passing functional tests establishes customer preference or better business outcomes.

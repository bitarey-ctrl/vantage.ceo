# Cron schedule — why there are only two jobs

**This is a deliberate downgrade, not an oversight. Do not "restore" the
original five-job config without a real load reason and a Vercel plan upgrade.**

Decided 2026-08-29. The Vercel **hobby** plan allows at most **2 cron jobs**, on
a **daily-only** schedule. Infrastructure is sized to the actual user count
(zero paying users), not to a schedule built for load that does not exist.

Rationale is kept here rather than inside `vercel.json` because that file is
schema-validated on deploy and rejects unknown properties — including the
`comment` keys the original config carried. Those were never caught because the
project had not been deployed.

## Active

| Path | Schedule | Notes |
|---|---|---|
| `/api/cron/ingest` | `0 5 * * *` | Signal ingestion. Was `0 */6 * * *`. |
| `/api/cron/brief` | `0 7 * * *` | Brief generation. Runs 2h after ingest so the brief reads that morning's signals. |

## Removed

| Path | Was | Impact while removed |
|---|---|---|
| `/api/cron/blindspot` | `0 2 * * *` | Blind-spot detection does not run automatically. |
| `/api/cron/missed-signals` | `0 8 * * *` | No missed-signal nudge emails. |
| `/api/cron/daily-briefing` | `*/15 * * * *` | **No briefing emails are sent at all.** |

### Why `daily-briefing` was removed rather than reduced to daily

The route sends to users whose local `briefing_time` falls inside the *current
15-minute window* (`WINDOW_MINUTES = 15`, `src/app/api/cron/daily-briefing/route.ts:19`).
It is only correct when invoked every 15 minutes. Run once a day it would email
only the users whose local briefing time happened to land in that single
window, and silently skip everyone else — worse than not running it.

Restoring email delivery requires either:

1. A Pro upgrade, returning it to `*/15 * * * *`; or
2. Rewriting the route to select all users due since the last run and send in
   one pass, which would make a daily invocation correct.

## On restoring

Restoring all five jobs requires Vercel **Pro**. Revisit when there are paying
users — that is the trigger, not convenience.

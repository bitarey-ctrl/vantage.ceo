# VANTAGE — Codex Working Rules

## What this project is
Strategic intelligence SaaS for operating CEOs of mid-market SaaS, fintech, and e-commerce companies who don't have a chief of staff.
Stack: Next.js 16 + Supabase + Anthropic API.
Slogan: "command the signal, eliminate the noise."
See CLAUDE_PROGRESS.md for full change history.

## HARD RULES — never violate

1. **NEVER touch these files or directories unless the user explicitly names them in the prompt:**
   - `src/lib/signals/` — signal ingestion pipeline (NewsAPI + RSS, tuned over months)
   - `src/lib/ai/prompts/` — consequence, triage, brief, health prompts (heavily tuned)
   - `src/lib/decisions/blind-spots.ts` — blind-spot analyzer
   - `src/lib/email/` — Resend integration + templates
   - `src/app/api/advisor/chat/route.ts` — streaming logic + memory injection
   - `src/app/api/signals/[id]/analyse/route.ts`
   - `src/app/api/signals/refresh/route.ts`
   - `src/app/api/cron/` — all cron endpoints
   - `src/app/(auth)/` — auth pages (already work end-to-end)
   - `src/middleware.ts`
   - `supabase/migrations/*.sql` — existing files. NEVER edit. Only add new numbered migrations.

2. **NEVER invent features that weren't asked for.** If you think something would be nice, list it at the END of your response — do not build it.

3. **NEVER rewrite working code for "style" or "performance" without evidence it's slow.** No opportunistic refactors.

4. **ALWAYS run `npx tsc --noEmit` before saying you're done.** Only `src/` errors count. `gstack/` errors are pre-existing — ignore them.

5. **ALWAYS append an entry to `CLAUDE_PROGRESS.md`** at the end of every task with: date, files changed, what was done, status. Follow the existing entry format.

6. **NEVER apply migrations.** Write the SQL file; the user runs it manually in the Supabase SQL editor.

7. **NEVER install packages the user didn't ask for.** Check `package.json` first — most things are already installed (gsap, framer-motion, recharts, resend, react-email, etc.).

## Coding conventions

- Use existing token classes from `globals.css`: `glass`, `glass-sheen`, `surf-1..4`, `surf-hover`, `hairline`, `hairline-strong`, `display-font`, `brand-accent-text`, `brand-accent-bg-soft`, `brand-accent-border`, `section-container`, `metric-card`, `card-completed`, `badge-completed`, `signal-analysed`, `cat-badge-market/regulatory/macro/competitors`, `ink-bar`.
- Do NOT invent new colors or hex values. Use the CSS variables (`var(--brand-accent)`, `var(--foreground)`, `var(--muted-foreground)`, etc.).
- Import types from `@/types/database`.
- Use `@/lib/supabase/client` for browser code, `@/lib/supabase/server` for server code, `createAdminClient` from server for service-role admin operations.
- Voice on user-facing text and AI prompts: smart friend, not McKinsey. Short sentences. Address the user as "you" (not "the user", not "the company"). Ban jargon: leverage, synergy, ecosystem, paradigm, north star metric, value proposition, go-to-market motion, misaligned, stakeholder.
- Scroll animations: **GSAP only** with ScrollTrigger. No framer-motion for scroll. framer-motion is fine for small in-place transitions (fade in/out, exit animations).
- Respect `prefers-reduced-motion` on every animation.
- Serif display treatment for section headers uses Cormorant Garamond / EB Garamond / Georgia stack (see DashboardNav.tsx wordmark for reference).

## Verification checklist before ending any task

1. `npx tsc --noEmit` — clean (src/ only)
2. `npm run build` — if the task changed any route or config, confirm it builds
3. All new files listed at the top of your final response
4. CLAUDE_PROGRESS.md entry appended
5. Note any pending user actions (migrations to apply, env vars to set, package installs)

## Imported Claude Cowork project instructions

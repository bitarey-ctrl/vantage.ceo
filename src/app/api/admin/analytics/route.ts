import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

/**
 * GET /api/admin/analytics — everything behind /admin/analytics.
 *
 * Auth is the existing admin mechanism, unchanged: an X-Admin-Password header
 * checked against process.env.ADMIN_PASSWORD, exactly as /api/admin/stats and
 * /api/admin/invites do.
 *
 * Most of this comes out of feature_events, which already exists. Two things
 * are derived instead of logged, on purpose:
 *
 *   - advisor messages: counted from advisor_sessions.messages rather than a
 *     new event, so the numbers are correct retroactively instead of starting
 *     at zero today.
 *   - last active: max(created_at) over feature_events rows whose event is a
 *     REAL USER ACTION (see USER_ACTION_EVENTS), plus advisor_sessions.
 *     updated_at. Explicitly NOT every feature_events row — see below.
 *
 * ceo_context is selected with `*` deliberately. Migration 031 adds
 * product_description / target_customer / top_priority and may not be applied
 * yet; naming those columns explicitly would 400 the whole request until it
 * is. Reading them optionally degrades to blank cells instead.
 */

export const dynamic = "force-dynamic";

interface AdvisorSessionRow {
  profile_id: string;
  messages: unknown;
  updated_at: string;
}

/*
 * WHAT COUNTS AS "ACTIVE".
 *
 * feature_events is not a log of user actions. It is a log of things that
 * happened, and some of them happen TO a user rather than because of one:
 *
 *   profile_ingested     written by the daily ingest cron for every onboarded
 *                        profile (lib/ingest-queue/order.ts). Nobody clicked.
 *   profile_row_repaired  a self-heal, written by the system.
 *   signal_refreshed      written by the refresh pipeline. On the button path a
 *                        user did click — but signal_refresh_attempt already
 *                        records that click, and the same route fans out over
 *                        EVERY profile when called with the ingest secret, so
 *                        this event cannot distinguish the two.
 *
 * Counting those as activity means a CEO who signed up and never came back
 * shows as "active 2h ago" every single day, forever, because the cron keeps
 * writing rows under their id. That is the same failure as treating an open
 * browser tab as presence, and it is worse, because it never stops.
 *
 * So this is an ALLOW-LIST, not a deny-list: only events a human deliberately
 * caused count. A new system event added later is excluded by default, which
 * is the safe direction to be wrong in. A new USER event must be added here —
 * that is the trade, and it is the right way round for a "who is actually
 * using this" metric.
 */
const USER_ACTION_EVENTS = new Set([
  "signal_refresh_attempt",  // the Refresh Signals button
  "signal_analysed",         // analyse-impact click
  "decision_logged",
  "decision_create_rejected", // they tried; the attempt is real engagement
  "decision_create_failed",
  "strategy_generated",
  "strategy_accepted",
  "strategy_rejected",
  "assessment_generated",
  "report_generated",
  "blind_spot_scan",
  "briefing_viewed",
  "digital_twin_viewed",
  "advisor_memory_saved",
]);

const DAY_MS = 86_400_000;

function startOfTodayUTC(): number {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d.getTime();
}

export async function GET(request: NextRequest) {
  const password = request.headers.get("X-Admin-Password");
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminPassword) {
    console.error("[admin/analytics] ADMIN_PASSWORD is not set");
    return NextResponse.json({ error: "Admin access is not configured." }, { status: 500 });
  }
  if (password !== adminPassword) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const admin = await createAdminClient();
    const now = Date.now();
    const since30 = new Date(now - 30 * DAY_MS).toISOString();
    const since7 = new Date(now - 7 * DAY_MS).toISOString();

    const [profilesRes, contextRes, eventsRes, actionsRes, sessionsRes, decisionsRes, signalsRes, usersRes] =
      await Promise.all([
        admin.from("profiles").select("id, email, company_name, created_at, onboarding_completed"),
        admin.from("ceo_context").select("*"),
        admin
          .from("feature_events")
          .select("profile_id, event, created_at")
          .gte("created_at", since30),
        /*
         * Last-active is NOT bounded to 30 days. The 30-day window above is
         * right for the activity tallies, but reusing it here would report a
         * CEO whose last real action was 40 days ago as never-active at all —
         * and dormant accounts are exactly the ones this column exists to
         * find. Allow-listed events only, so the window change cannot let a
         * cron row back in.
         */
        admin
          .from("feature_events")
          .select("profile_id, created_at")
          .in("event", [...USER_ACTION_EVENTS]),
        admin.from("advisor_sessions").select("profile_id, messages, updated_at"),
        admin.from("decisions").select("profile_id, created_at"),
        admin.from("signals").select("created_at").gte("created_at", since30),
        admin.auth.admin.listUsers({ perPage: 1000 }),
      ]);

    if (profilesRes.error) {
      return NextResponse.json({ error: `profiles: ${profilesRes.error.message}` }, { status: 500 });
    }
    if (eventsRes.error) {
      return NextResponse.json(
        { error: `feature_events: ${eventsRes.error.message}` },
        { status: 500 }
      );
    }

    const profiles = profilesRes.data ?? [];
    const events = eventsRes.data ?? [];
    const sessions = (sessionsRes.data ?? []) as AdvisorSessionRow[];
    const decisions = decisionsRes.data ?? [];
    const signals = signalsRes.data ?? [];

    // ── ceo_context, read defensively (see the note above on migration 031) ──
    const ctxById = new Map<string, Record<string, unknown>>();
    for (const c of (contextRes.data ?? []) as Record<string, unknown>[]) {
      ctxById.set(String(c.profile_id), c);
    }

    // ── auth identities: email of record + last login ────────────────────────
    const authById = new Map<string, { email: string | null; lastSignIn: string | null }>();
    for (const u of usersRes.data?.users ?? []) {
      authById.set(u.id, {
        email: u.email ?? null,
        lastSignIn: (u as { last_sign_in_at?: string | null }).last_sign_in_at ?? null,
      });
    }

    // ── per-profile event tallies ────────────────────────────────────────────
    const tally = new Map<string, Record<string, number>>();
    const lastActive = new Map<string, string>();
    const bump = (pid: string, key: string) => {
      const row = tally.get(pid) ?? {};
      row[key] = (row[key] ?? 0) + 1;
      tally.set(pid, row);
    };

    for (const e of events) {
      if (!e.profile_id) continue;
      bump(String(e.profile_id), String(e.event));
    }

    // Last-active, all-time, from deliberate actions only.
    for (const a of (actionsRes.data ?? []) as { profile_id: string | null; created_at: string }[]) {
      if (!a.profile_id) continue;
      const pid = String(a.profile_id);
      const prev = lastActive.get(pid);
      if (!prev || a.created_at > prev) lastActive.set(pid, a.created_at);
    }

    // Advisor messages: user turns only, so a long answer is not counted as
    // engagement. `updated_at` also counts toward last-active, and legitimately
    // so — advisor_sessions is only ever written when the user sends a message
    // or renames a thread. Nothing writes it on page load or on a timer.
    const advisorMsgs = new Map<string, number>();
    const advisorMsgsByDay = new Map<string, number>();
    for (const s of sessions) {
      const pid = String(s.profile_id);
      const msgs = Array.isArray(s.messages) ? (s.messages as { role?: string }[]) : [];
      const userTurns = msgs.filter((m) => m?.role === "user").length;
      if (userTurns) advisorMsgs.set(pid, (advisorMsgs.get(pid) ?? 0) + userTurns);
      const prev = lastActive.get(pid);
      if (!prev || s.updated_at > prev) lastActive.set(pid, s.updated_at);
      if (s.updated_at >= since30) {
        const day = s.updated_at.slice(0, 10);
        advisorMsgsByDay.set(day, (advisorMsgsByDay.get(day) ?? 0) + userTurns);
      }
    }

    /*
     * COUNTING A REFRESH ONCE.
     *
     * One manual refresh can write TWO rows: signal_refresh_attempt (always,
     * from the rate limiter) and signal_refreshed (only when something
     * actually surfaced). Adding them together double-counts every refresh
     * since the rate limiter shipped. Counting attempts alone would instead
     * discard all history, because that event only exists from Sept 2026 —
     * every refresh before then is a bare signal_refreshed.
     *
     * So: every attempt, plus any signal_refreshed that has no attempt beside
     * it. Verified against the table — exactly one row pairs, the rest are
     * pre-rate-limiter history.
     */
    const PAIR_WINDOW_MS = 120_000;
    const attemptTimes = new Map<string, number[]>();
    for (const e of events) {
      if (e.event !== "signal_refresh_attempt" || !e.profile_id) continue;
      const pid = String(e.profile_id);
      const at = new Date(String(e.created_at)).getTime();
      attemptTimes.set(pid, [...(attemptTimes.get(pid) ?? []), at]);
    }
    const refreshRuns = events.filter((e) => {
      if (e.event === "signal_refresh_attempt") return true;
      if (e.event !== "signal_refreshed") return false;
      const t = new Date(String(e.created_at)).getTime();
      return !(attemptTimes.get(String(e.profile_id)) ?? []).some(
        (a) => Math.abs(a - t) < PAIR_WINDOW_MS
      );
    });
    const refreshesByProfile = new Map<string, number>();
    for (const e of refreshRuns) {
      const pid = String(e.profile_id);
      refreshesByProfile.set(pid, (refreshesByProfile.get(pid) ?? 0) + 1);
    }

    const decisionsByProfile = new Map<string, number>();
    for (const d of decisions) {
      const pid = String(d.profile_id);
      decisionsByProfile.set(pid, (decisionsByProfile.get(pid) ?? 0) + 1);
    }

    /* competitors and strategic_priorities are jsonb that has been written in
     * two shapes over time — an array of {name}/{title} objects, and a plain
     * comma-separated string from the Profile form. Read both. */
    const asList = (raw: unknown): string[] => {
      if (Array.isArray(raw)) {
        return raw
          .map((i) =>
            typeof i === "string"
              ? i
              : String((i as { name?: string; title?: string })?.name ??
                       (i as { title?: string })?.title ?? "")
          )
          .map((v) => v.trim())
          .filter(Boolean);
      }
      if (typeof raw === "string") return raw.split(",").map((v) => v.trim()).filter(Boolean);
      return [];
    };

    // ── USERS ────────────────────────────────────────────────────────────────
    const users = profiles.map((p) => {
      const pid = String(p.id);
      const ctx = ctxById.get(pid) ?? {};
      const auth = authById.get(pid);
      const t = tally.get(pid) ?? {};
      return {
        profile_id: pid,
        email: auth?.email ?? (p.email as string | null) ?? null,
        company_name: (p.company_name as string | null) ?? null,
        product_description: (ctx.product_description as string | null) ?? null,
        target_customer: (ctx.target_customer as string | null) ?? null,
        top_priority: (ctx.top_priority as string | null) ?? null,
        arr_band: (ctx.arr_band as string | null) ?? null,
        onboarding_completed: Boolean(p.onboarding_completed),
        signed_up: p.created_at as string,
        last_login: auth?.lastSignIn ?? null,
        last_active: lastActive.get(pid) ?? null,
        refreshes_30d: refreshesByProfile.get(pid) ?? 0,
        analyses_30d: t.signal_analysed ?? 0,
        decisions_total: decisionsByProfile.get(pid) ?? 0,
        advisor_msgs_total: advisorMsgs.get(pid) ?? 0,
        // ── drill-down only: the rest of the onboarding picture ──
        top_priority_other: (ctx.top_priority_other as string | null) ?? null,
        competitors: asList(ctx.competitors),
        strategic_priorities: asList(ctx.strategic_priorities),
        sector: (ctx.sector as string | null) ?? null,
        geography_detail: (ctx.geography_detail as string | null) ?? null,
        revenue_model: (ctx.revenue_model as string | null) ?? null,
        monthly_revenue_range: (ctx.monthly_revenue_range as string | null) ?? null,
        avoided_decision: (ctx.avoided_decision as string | null) ?? null,
        additional_context: (ctx.additional_context as string | null) ?? null,
      };
    });

    const todayStart = startOfTodayUTC();
    const weekStart = now - 7 * DAY_MS;
    const signups = {
      all_time: profiles.length,
      this_week: profiles.filter((p) => new Date(p.created_at as string).getTime() >= weekStart).length,
      today: profiles.filter((p) => new Date(p.created_at as string).getTime() >= todayStart).length,
    };

    // ── ACTIVITY (30d) ───────────────────────────────────────────────────────
    const countEvent = (key: string) => events.filter((e) => e.event === key).length;
    const activity = {
      signals_refreshed: refreshRuns.length,
      decisions_created: countEvent("decision_logged"),
      analyse_clicks: countEvent("signal_analysed"),
      advisor_messages: [...advisorMsgsByDay.values()].reduce((a, b) => a + b, 0),
    };

    // Leaderboard: this week only, deliberate actions only — otherwise the
    // daily cron marker alone would put a dormant account on the board.
    const weekTally = new Map<string, number>();
    for (const e of events) {
      if (!e.profile_id || (e.created_at as string) < since7) continue;
      if (!USER_ACTION_EVENTS.has(String(e.event))) continue;
      weekTally.set(String(e.profile_id), (weekTally.get(String(e.profile_id)) ?? 0) + 1);
    }
    const leaderboard = [...weekTally.entries()]
      .map(([pid, actions]) => ({
        profile_id: pid,
        company_name: users.find((u) => u.profile_id === pid)?.company_name ?? null,
        email: users.find((u) => u.profile_id === pid)?.email ?? null,
        actions,
      }))
      .sort((a, b) => b.actions - a.actions)
      .slice(0, 10);

    // ── FEATURE ADOPTION ─────────────────────────────────────────────────────
    const total = profiles.length || 1;
    const pct = (n: number) => Math.round((100 * n) / total);
    const adoption = {
      total_users: profiles.length,
      onboarded: profiles.filter((p) => p.onboarding_completed).length,
      onboarded_pct: pct(profiles.filter((p) => p.onboarding_completed).length),
      with_decision: [...decisionsByProfile.keys()].length,
      with_decision_pct: pct([...decisionsByProfile.keys()].length),
      with_advisor: [...advisorMsgs.keys()].length,
      with_advisor_pct: pct([...advisorMsgs.keys()].length),
      with_analysis: new Set(
        events.filter((e) => e.event === "signal_analysed").map((e) => String(e.profile_id))
      ).size,
      with_analysis_pct: pct(
        new Set(
          events.filter((e) => e.event === "signal_analysed").map((e) => String(e.profile_id))
        ).size
      ),
    };

    // ── API USAGE ────────────────────────────────────────────────────────────
    // Dollar cost is NOT instrumented anywhere — nothing records token counts
    // or spend, so any figure here would be invented. What IS real is the
    // number of billable calls by kind, which is the useful proxy: a gate run
    // per refresh, one call per analysis, one per advisor message.
    const byDay = (pred: (e: { event: string }) => boolean) => {
      const m = new Map<string, number>();
      for (const e of events) {
        if (!pred(e as { event: string })) continue;
        const day = String(e.created_at).slice(0, 10);
        m.set(day, (m.get(day) ?? 0) + 1);
      }
      return m;
    };
    // Gate runs: one Claude call per refresh RUN, so the same reconciliation.
    const refreshRunKeys = new Set(refreshRuns.map((e) => `${e.profile_id}|${e.created_at}`));
    const gateRuns = byDay(
      (e) => refreshRunKeys.has(`${(e as { profile_id?: string }).profile_id}|${(e as { created_at?: string }).created_at}`)
    );
    const analyses = byDay((e) => e.event === "signal_analysed");

    const signalsByDay = new Map<string, number>();
    for (const s of signals) {
      const day = String(s.created_at).slice(0, 10);
      signalsByDay.set(day, (signalsByDay.get(day) ?? 0) + 1);
    }

    const days: string[] = [];
    for (let i = 0; i < 30; i++) {
      days.push(new Date(now - i * DAY_MS).toISOString().slice(0, 10));
    }
    const perDay = days
      .map((day) => ({
        day,
        signals_ingested: signalsByDay.get(day) ?? 0,
        gate_runs: gateRuns.get(day) ?? 0,
        analyses: analyses.get(day) ?? 0,
        advisor_messages: advisorMsgsByDay.get(day) ?? 0,
      }))
      .filter(
        (d) =>
          d.signals_ingested || d.gate_runs || d.analyses || d.advisor_messages
      );

    return NextResponse.json({
      generated_at: new Date().toISOString(),
      signups,
      users,
      activity,
      leaderboard,
      adoption,
      api_usage: {
        cost_tracked: false,
        note:
          "Dollar cost is not instrumented — nothing records token counts or spend. " +
          "These are billable call counts by kind, which is the honest proxy.",
        per_day: perDay,
        totals_30d: {
          gate_runs: [...gateRuns.values()].reduce((a, b) => a + b, 0),
          analyses: [...analyses.values()].reduce((a, b) => a + b, 0),
          advisor_messages: activity.advisor_messages,
          signals_ingested: signals.length,
        },
      },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[admin/analytics]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

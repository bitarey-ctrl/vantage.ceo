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
 *   - last active: max(feature_events.created_at) per profile.
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

    const [profilesRes, contextRes, eventsRes, sessionsRes, decisionsRes, signalsRes, usersRes] =
      await Promise.all([
        admin.from("profiles").select("id, email, company_name, created_at, onboarding_completed"),
        admin.from("ceo_context").select("*"),
        admin
          .from("feature_events")
          .select("profile_id, event, created_at")
          .gte("created_at", since30),
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
    const bump = (pid: string, key: string, at: string) => {
      const row = tally.get(pid) ?? {};
      row[key] = (row[key] ?? 0) + 1;
      tally.set(pid, row);
      const prev = lastActive.get(pid);
      if (!prev || at > prev) lastActive.set(pid, at);
    };

    for (const e of events) {
      if (!e.profile_id) continue;
      bump(String(e.profile_id), String(e.event), String(e.created_at));
    }

    // Advisor messages: user turns only, so a long answer is not counted as
    // engagement. `updated_at` also counts toward last-active.
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

    const decisionsByProfile = new Map<string, number>();
    for (const d of decisions) {
      const pid = String(d.profile_id);
      decisionsByProfile.set(pid, (decisionsByProfile.get(pid) ?? 0) + 1);
    }

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
        refreshes_30d: (t.signal_refresh_attempt ?? 0) + (t.signal_refreshed ?? 0),
        analyses_30d: t.signal_analysed ?? 0,
        decisions_total: decisionsByProfile.get(pid) ?? 0,
        advisor_msgs_total: advisorMsgs.get(pid) ?? 0,
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
      signals_refreshed: countEvent("signal_refresh_attempt") + countEvent("signal_refreshed"),
      decisions_created: countEvent("decision_logged"),
      analyse_clicks: countEvent("signal_analysed"),
      advisor_messages: [...advisorMsgsByDay.values()].reduce((a, b) => a + b, 0),
    };

    // Leaderboard: this week only, weighted equally across the four actions.
    const weekTally = new Map<string, number>();
    for (const e of events) {
      if (!e.profile_id || (e.created_at as string) < since7) continue;
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
    const gateRuns = byDay((e) => e.event === "signal_refresh_attempt" || e.event === "signal_refreshed");
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

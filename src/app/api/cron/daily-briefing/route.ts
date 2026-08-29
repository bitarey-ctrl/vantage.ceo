/**
 * GET/POST /api/cron/daily-briefing
 *
 * Runs every 15 minutes via Vercel Cron (vercel.json). For each user with
 * daily_briefing enabled whose briefing_time falls in the current quarter-hour
 * window *in their own timezone*, builds and sends their morning briefing email.
 *
 * Protected by CRON_SECRET (Vercel sends it as `Authorization: Bearer <secret>`).
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { sendDailyBriefingEmail } from "@/lib/email/resend";
import type { BriefingSignal } from "@/lib/email/templates/daily-briefing";
import type { SignalUrgency } from "@/types/database";

export const maxDuration = 300;

const WINDOW_MINUTES = 15;
const URGENCY_RANK: Record<SignalUrgency, number> = {
  act_this_week: 0,
  decide_this_month: 1,
  watch: 2,
};

interface PrefRow {
  user_id: string;
  briefing_time: string;
  timezone: string;
}

interface JoinedSignal {
  id: string;
  title: string;
  url: string | null;
  urgency: SignalUrgency | null;
  created_at: string;
}

interface ConsequenceRow {
  so_what: string;
  confidence_score: number | null;
  signal: JoinedSignal | JoinedSignal[] | null;
}

// Minutes-since-midnight in the given IANA timezone.
function localMinutes(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? "0") % 24;
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return h * 60 + m;
}

// YYYY-MM-DD calendar date in the given timezone (idempotency key).
function localDate(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function parseHHMM(value: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

function firstSignal(s: ConsequenceRow["signal"]): JoinedSignal | null {
  if (!s) return null;
  return Array.isArray(s) ? s[0] ?? null : s;
}

async function handle(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const supabase = await createAdminClient();
  const now = new Date();
  const since24h = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

  // 1. Users opted in to the daily briefing.
  const { data: prefs, error: prefsError } = await supabase
    .from("notification_preferences")
    .select("user_id, briefing_time, timezone")
    .eq("daily_briefing", true);

  if (prefsError) {
    console.error("[cron/daily-briefing] prefs query failed:", prefsError);
    return NextResponse.json({ error: "Query failed" }, { status: 500 });
  }

  const prefRows = (prefs ?? []) as PrefRow[];

  // 2. Narrow to those whose local briefing time is in the current window.
  const due = prefRows.filter((p) => {
    const tz = p.timezone || "UTC";
    const target = parseHHMM(p.briefing_time || "07:00");
    if (target === null) return false;
    const delta = localMinutes(now, tz) - target;
    return delta >= 0 && delta < WINDOW_MINUTES;
  });

  if (due.length === 0) {
    return NextResponse.json({ checked: prefRows.length, due: 0, sent: 0 });
  }

  // 3. Profiles (email + name) for the due users.
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, email, full_name")
    .in(
      "id",
      due.map((d) => d.user_id)
    );
  const profileMap = new Map(
    (profiles ?? []).map((p) => [p.id as string, p as { id: string; email: string; full_name: string | null }])
  );

  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const pref of due) {
    const tz = pref.timezone || "UTC";
    const day = localDate(now, tz);
    const profile = profileMap.get(pref.user_id);

    if (!profile?.email) {
      skipped++;
      continue;
    }

    // Idempotency — don't resend if already sent today (local).
    const { data: already } = await supabase
      .from("briefing_send_log")
      .select("id")
      .eq("user_id", pref.user_id)
      .eq("local_date", day)
      .eq("status", "sent")
      .maybeSingle();
    if (already) {
      skipped++;
      continue;
    }

    // 4. Last 24h of analysed signals for this user, ranked.
    const { data: rows } = await supabase
      .from("consequences")
      .select(
        "so_what, confidence_score, signal:signals(id, title, url, urgency, created_at)"
      )
      .eq("profile_id", pref.user_id)
      .gte("created_at", since24h);

    const candidates = ((rows ?? []) as unknown as ConsequenceRow[])
      .map((r) => {
        const sig = firstSignal(r.signal);
        if (!sig) return null;
        const urgency: SignalUrgency = sig.urgency ?? "watch";
        return {
          id: sig.id,
          title: sig.title,
          urgency,
          consequence: r.so_what,
          score: r.confidence_score ?? 0,
        };
      })
      .filter((c): c is NonNullable<typeof c> => c !== null)
      .sort((a, b) => {
        const ua = URGENCY_RANK[a.urgency];
        const ub = URGENCY_RANK[b.urgency];
        if (ua !== ub) return ua - ub;
        return b.score - a.score;
      });

    const top3: BriefingSignal[] = candidates.slice(0, 3).map((c) => ({
      id: c.id,
      title: c.title,
      urgency: c.urgency,
      consequence: c.consequence,
    }));

    // Nothing worth sending — record a skip so we know it was evaluated.
    if (top3.length === 0) {
      await supabase.from("briefing_send_log").insert({
        user_id: pref.user_id,
        status: "skipped",
        local_date: day,
        signal_count: 0,
        error: "No signals in last 24h",
      });
      skipped++;
      continue;
    }

    const firstName = (profile.full_name ?? "").trim().split(/\s+/)[0] || "there";
    const dayName = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      weekday: "long",
    }).format(now);

    try {
      const { id: resendId } = await sendDailyBriefingEmail({
        to: profile.email,
        firstName,
        dayName,
        signals: top3,
        appUrl,
      });

      await supabase.from("briefing_send_log").insert({
        user_id: pref.user_id,
        status: "sent",
        local_date: day,
        signal_count: top3.length,
        resend_id: resendId,
      });
      sent++;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown send error";
      console.error(`[cron/daily-briefing] send failed for ${pref.user_id}:`, message);
      await supabase.from("briefing_send_log").insert({
        user_id: pref.user_id,
        status: "failed",
        local_date: day,
        signal_count: top3.length,
        error: message,
      });
      failed++;
    }
  }

  return NextResponse.json({
    checked: prefRows.length,
    due: due.length,
    sent,
    failed,
    skipped,
  });
}

export async function GET(request: NextRequest) {
  return handle(request);
}

export async function POST(request: NextRequest) {
  return handle(request);
}

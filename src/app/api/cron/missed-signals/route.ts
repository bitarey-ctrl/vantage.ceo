/**
 * GET/POST /api/cron/missed-signals
 *
 * Runs daily at 08:00 UTC via Vercel Cron (vercel.json). For each user opted
 * in to missed-signal nudges, finds urgent ('act_this_week') signals that have
 * been sitting un-reviewed for 3+ days (but no older than 7 days) and that we
 * haven't already emailed them about, then sends a single matter-of-fact nudge
 * containing the top 3 by relevance.
 *
 * Protected by CRON_SECRET (Vercel sends it as `Authorization: Bearer <secret>`).
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { sendMissedSignalsEmail } from "@/lib/email/resend";
import type { MissedSignal } from "@/lib/email/templates/missed-signals";
import type { SignalUrgency } from "@/types/database";

export const maxDuration = 300;

const MAX_PER_EMAIL = 3;

interface CandidateSignal {
  id: string;
  title: string;
  urgency: SignalUrgency | null;
  created_at: string;
}

function daysAgo(iso: string, now: number): number {
  return Math.floor((now - new Date(iso).getTime()) / 86_400_000);
}

async function handle(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const supabase = await createAdminClient();
  const now = Date.now();
  const sevenDaysAgo = new Date(now - 7 * 86_400_000).toISOString();
  const threeDaysAgo = new Date(now - 3 * 86_400_000).toISOString();

  // 1. Global pool of urgent signals that have sat un-reviewed for 3–7 days.
  const { data: signalRows, error: signalsError } = await supabase
    .from("signals")
    .select("id, title, urgency, created_at")
    .eq("urgency", "act_this_week")
    .is("reviewed_at", null)
    .gte("created_at", sevenDaysAgo)
    .lte("created_at", threeDaysAgo);

  if (signalsError) {
    console.error("[cron/missed-signals] signals query failed:", signalsError);
    return NextResponse.json({ error: "Query failed" }, { status: 500 });
  }

  const candidates = (signalRows ?? []) as CandidateSignal[];
  if (candidates.length === 0) {
    return NextResponse.json({ users: 0, sent: 0, reason: "no candidate signals" });
  }
  const candidateIds = candidates.map((s) => s.id);
  const candidateMap = new Map(candidates.map((s) => [s.id, s]));

  // 2. Users opted in to missed-signal nudges.
  const { data: prefs, error: prefsError } = await supabase
    .from("notification_preferences")
    .select("user_id")
    .eq("missed_signals", true);

  if (prefsError) {
    console.error("[cron/missed-signals] prefs query failed:", prefsError);
    return NextResponse.json({ error: "Query failed" }, { status: 500 });
  }

  const userIds = (prefs ?? []).map((p) => p.user_id as string);
  if (userIds.length === 0) {
    return NextResponse.json({ users: 0, sent: 0, reason: "no opted-in users" });
  }

  // 3. Profiles (email + name) for the opted-in users.
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, email, full_name")
    .in("id", userIds);
  const profileMap = new Map(
    (profiles ?? []).map((p) => [
      p.id as string,
      p as { id: string; email: string | null; full_name: string | null },
    ])
  );

  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const userId of userIds) {
    const profile = profileMap.get(userId);
    if (!profile?.email) {
      skipped++;
      continue;
    }

    // 3a. Which candidate signals are relevant to this user (+ their score)?
    const { data: triages } = await supabase
      .from("signal_triages")
      .select("signal_id, relevance_score")
      .eq("profile_id", userId)
      .eq("relevant", true)
      .in("signal_id", candidateIds);

    const scoreById = new Map(
      (triages ?? []).map((t) => [t.signal_id as string, (t.relevance_score as number) ?? 0])
    );
    if (scoreById.size === 0) {
      skipped++;
      continue;
    }

    // 3b. Drop ones we've already nudged this user about.
    const relevantIds = [...scoreById.keys()];
    const { data: alreadySent } = await supabase
      .from("missed_signal_emails")
      .select("signal_id")
      .eq("user_id", userId)
      .in("signal_id", relevantIds);
    const sentSet = new Set((alreadySent ?? []).map((r) => r.signal_id as string));

    const pending = relevantIds
      .filter((id) => !sentSet.has(id))
      .map((id) => ({ signal: candidateMap.get(id)!, score: scoreById.get(id) ?? 0 }))
      .filter((p) => p.signal)
      .sort((a, b) => b.score - a.score);

    if (pending.length === 0) {
      skipped++;
      continue;
    }

    const top = pending.slice(0, MAX_PER_EMAIL);
    const emailSignals: MissedSignal[] = top.map(({ signal }) => ({
      id: signal.id,
      title: signal.title,
      urgency: signal.urgency ?? "act_this_week",
      daysAgo: daysAgo(signal.created_at, now),
    }));

    const firstName = (profile.full_name ?? "").trim().split(/\s+/)[0] || "there";

    try {
      await sendMissedSignalsEmail({
        to: profile.email,
        firstName,
        signals: emailSignals,
        appUrl,
      });

      // Log only the signals actually included, so any overflow gets picked up
      // on a later run rather than being silently suppressed.
      await supabase.from("missed_signal_emails").insert(
        top.map(({ signal }) => ({
          user_id: userId,
          signal_id: signal.id,
          sent_at: new Date().toISOString(),
        }))
      );
      sent++;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown send error";
      console.error(`[cron/missed-signals] send failed for ${userId}:`, message);
      failed++;
    }
  }

  return NextResponse.json({ users: userIds.length, sent, failed, skipped });
}

export async function GET(request: NextRequest) {
  return handle(request);
}

export async function POST(request: NextRequest) {
  return handle(request);
}

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

const EVENT_KEYS = [
  "signal_refreshed",
  "signal_analysed",
  "strategy_generated",
  "strategy_accepted",
  "strategy_rejected",
  "decision_logged",
  "assessment_generated",
  "report_generated",
] as const;

type EventKey = typeof EVENT_KEYS[number];
type Events7d = Record<EventKey, number>;

interface UserRow {
  profile_id: string;
  company_name: string | null;
  industry: string | null;
  joined: string;
  events_7d: Events7d;
  last_seen: string | null;
}

interface FeedbackRow {
  id: string;
  profile_id: string | null;
  rating: number | null;
  category: string | null;
  message: string;
  page: string | null;
  created_at: string;
}

interface StatsResponse {
  users: UserRow[];
  totals: {
    total_users: number;
    active_7d: number;
    total_events_7d: number;
  };
  feedback: FeedbackRow[];
}

export async function GET(request: NextRequest) {
  const password = request.headers.get("X-Admin-Password");
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminPassword || password !== adminPassword) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const admin = await createAdminClient();
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const [profilesRes, eventsRes, allEventsRes, feedbackRes] = await Promise.all([
      admin.from("profiles").select("id, company_name, industry, created_at"),
      admin.from("feature_events").select("profile_id, event, created_at").gte("created_at", sevenDaysAgo),
      admin.from("feature_events").select("profile_id, created_at").order("created_at", { ascending: false }),
      admin.from("feedback").select("id, profile_id, rating, category, message, page, created_at").order("created_at", { ascending: false }).limit(20),
    ]);

    // Surface DB errors so we can diagnose missing tables
    if (eventsRes.error) {
      console.error("[admin/stats] feature_events query error:", eventsRes.error.message);
      return NextResponse.json(
        { error: `feature_events table error: ${eventsRes.error.message}` },
        { status: 500 }
      );
    }

    const profiles = profilesRes.data ?? [];
    const events7d = eventsRes.data ?? [];
    const allEvents = allEventsRes.data ?? [];
    const feedbackRows = (feedbackRes.data ?? []) as FeedbackRow[];

    // Build last_seen per profile from all events
    const lastSeenMap = new Map<string, string>();
    for (const e of allEvents) {
      if (!lastSeenMap.has(e.profile_id)) {
        lastSeenMap.set(e.profile_id, e.created_at);
      }
    }

    // Build events_7d counts per profile per event type
    const countsMap = new Map<string, Map<string, number>>();
    for (const e of events7d) {
      if (!countsMap.has(e.profile_id)) {
        countsMap.set(e.profile_id, new Map());
      }
      const byEvent = countsMap.get(e.profile_id)!;
      byEvent.set(e.event, (byEvent.get(e.event) ?? 0) + 1);
    }

    const usersWithEvents = profiles.map((p): UserRow => {
      const byEvent = countsMap.get(p.id);
      const events_7d = {} as Events7d;
      for (const key of EVENT_KEYS) {
        events_7d[key] = byEvent?.get(key) ?? 0;
      }
      return {
        profile_id: p.id,
        company_name: p.company_name ?? null,
        industry: p.industry ?? null,
        joined: p.created_at,
        events_7d,
        last_seen: lastSeenMap.get(p.id) ?? null,
      };
    });

    // Sort by last_seen DESC
    usersWithEvents.sort((a, b) => {
      if (!a.last_seen && !b.last_seen) return 0;
      if (!a.last_seen) return 1;
      if (!b.last_seen) return -1;
      return b.last_seen.localeCompare(a.last_seen);
    });

    const active7dSet = new Set(events7d.map((e) => e.profile_id));
    const total_events_7d = events7d.length;

    const response: StatsResponse = {
      users: usersWithEvents,
      totals: {
        total_users: profiles.length,
        active_7d: active7dSet.size,
        total_events_7d,
      },
      feedback: feedbackRows,
    };

    return NextResponse.json(response);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[GET /api/admin/stats]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

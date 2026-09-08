"use server";

import { createClient } from "@/lib/supabase/server";

import {
  NOTIFICATION_DEFAULTS,
  type NotificationPrefsInput,
} from "./prefs";

const SELECT_COLS =
  "daily_briefing, missed_signals, monthly_recap, decision_nudges, briefing_time, timezone";

/**
 * Load the signed-in user's notification preferences. Returns the row defaults
 * (without writing) when the user has never saved — the row is created lazily
 * on the first save.
 */
export async function getNotificationPreferences(): Promise<NotificationPrefsInput> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data, error } = await supabase
    .from("notification_preferences")
    .select(SELECT_COLS)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return { ...NOTIFICATION_DEFAULTS };

  return data as unknown as NotificationPrefsInput;
}

/**
 * Upsert the signed-in user's notification preferences. RLS guarantees a user
 * can only write their own row; we also scope by user_id explicitly.
 */
export async function saveNotificationPreferences(
  prefs: NotificationPrefsInput
): Promise<{ ok: true }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { error } = await supabase.from("notification_preferences").upsert(
    {
      user_id: user.id,
      daily_briefing: prefs.daily_briefing,
      missed_signals: prefs.missed_signals,
      monthly_recap: prefs.monthly_recap,
      decision_nudges: prefs.decision_nudges,
      briefing_time: prefs.briefing_time,
      timezone: prefs.timezone,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );

  if (error) throw new Error(error.message);
  return { ok: true };
}

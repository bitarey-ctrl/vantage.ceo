import { createAdminClient } from "@/lib/supabase/server";

export const EVENTS = {
  signal_refreshed:    "signal_refreshed",
  signal_analysed:     "signal_analysed",
  strategy_generated:  "strategy_generated",
  strategy_accepted:   "strategy_accepted",
  strategy_rejected:   "strategy_rejected",
  decision_logged:     "decision_logged",
  assessment_generated:"assessment_generated",
  report_generated:    "report_generated",
  briefing_viewed:     "briefing_viewed",
  digital_twin_viewed: "digital_twin_viewed",
  blind_spot_scan:     "blind_spot_scan",
} as const;

export async function logEvent(
  profileId: string,
  event: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  try {
    const admin = await createAdminClient();
    await admin.from("feature_events").insert({
      profile_id: profileId,
      event,
      metadata: metadata ?? {},
    });
  } catch (err) {
    console.error("[logEvent] Failed to log event:", event, err);
  }
}

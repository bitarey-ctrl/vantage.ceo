/*
 * Shared shape + defaults for notification preferences.
 *
 * These live outside actions.ts on purpose: that file is "use server", and
 * Next.js only allows a "use server" module to export async functions. Having
 * NOTIFICATION_DEFAULTS (a plain object) exported from there made every
 * import of the module throw
 *   Error: A "use server" file can only export async functions, found object
 * which is what was breaking /settings — not a missing migration.
 */

export interface NotificationPrefsInput {
  daily_briefing: boolean;
  missed_signals: boolean;
  monthly_recap: boolean;
  decision_nudges: boolean;
  briefing_time: string;
  timezone: string;
}

export const NOTIFICATION_DEFAULTS: NotificationPrefsInput = {
  daily_briefing: true,
  missed_signals: true,
  monthly_recap: true,
  decision_nudges: true,
  briefing_time: "07:00",
  timezone: "UTC",
};

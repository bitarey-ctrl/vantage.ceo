"use client";

import React, { useEffect, useMemo, useState, useCallback } from "react";
import { Bell, Clock, Globe, Check, Loader2 } from "lucide-react";
import {
  getNotificationPreferences,
  saveNotificationPreferences,
  NOTIFICATION_DEFAULTS,
  type NotificationPrefsInput,
} from "./actions";

// ─── Notification rows ──────────────────────────────────────────────────────────

type ToggleKey =
  | "daily_briefing"
  | "missed_signals"
  | "monthly_recap"
  | "decision_nudges";

const NOTIFICATION_ROWS: { key: ToggleKey; label: string; description: string }[] = [
  {
    key: "daily_briefing",
    label: "Daily Briefing",
    description:
      "Your morning intelligence brief — top signals and recommended actions — emailed at your chosen time each day.",
  },
  {
    key: "missed_signals",
    label: "Missed Signals",
    description:
      "A same-day email when high-urgency signals go unread, so nothing time-sensitive slips past you.",
  },
  {
    key: "monthly_recap",
    label: "Monthly Recap",
    description:
      "A month-in-review of your decisions, outcomes, and strategic shifts — sent on the 1st of each month.",
  },
  {
    key: "decision_nudges",
    label: "Decision Nudges",
    description:
      "Periodic reminders to revisit decisions you've flagged or have been avoiding, before the window closes.",
  },
];

// Curated fallback when Intl.supportedValuesOf is unavailable in the runtime.
const FALLBACK_TIMEZONES = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Sao_Paulo",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Istanbul",
  "Africa/Cairo",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Asia/Shanghai",
  "Asia/Tokyo",
  "Australia/Sydney",
];

function getTimezones(): string[] {
  try {
    const supported = (
      Intl as unknown as { supportedValuesOf?: (k: string) => string[] }
    ).supportedValuesOf?.("timeZone");
    if (supported && supported.length) return supported;
  } catch {
    /* fall through */
  }
  return FALLBACK_TIMEZONES;
}

function guessLocalTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

// ─── Toggle switch ──────────────────────────────────────────────────────────────

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full border transition-colors duration-200 ${
        checked ? "hairline-strong" : "hairline surf-2"
      }`}
      style={checked ? { backgroundColor: "var(--brand-accent)" } : undefined}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform duration-200 ${
          checked ? "translate-x-[22px]" : "translate-x-[3px]"
        }`}
      />
    </button>
  );
}

// ─── Page ───────────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const [prefs, setPrefs] = useState<NotificationPrefsInput | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [saveError, setSaveError] = useState("");

  const timezones = useMemo(() => getTimezones(), []);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const data = await getNotificationPreferences();
        if (!active) return;
        // If the user has never saved (still on UTC default), pre-fill their
        // detected local timezone so the daily briefing fires at a sane hour.
        const isDefault =
          data.timezone === NOTIFICATION_DEFAULTS.timezone &&
          data.briefing_time === NOTIFICATION_DEFAULTS.briefing_time;
        setPrefs(
          isDefault ? { ...data, timezone: guessLocalTimezone() } : data
        );
      } catch {
        if (active) setLoadError(true);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  // Optimistically apply a change, persist in the background, revert on failure.
  const persist = useCallback(
    async (next: NotificationPrefsInput, previous: NotificationPrefsInput) => {
      setSaving(true);
      setSaveError("");
      try {
        await saveNotificationPreferences(next);
        setSavedAt(Date.now());
      } catch (err) {
        setPrefs(previous); // revert optimistic update
        setSaveError(
          err instanceof Error ? err.message : "Couldn't save. Try again."
        );
      } finally {
        setSaving(false);
      }
    },
    []
  );

  const update = useCallback(
    (patch: Partial<NotificationPrefsInput>) => {
      setPrefs((current) => {
        if (!current) return current;
        const previous = current;
        const next = { ...current, ...patch };
        void persist(next, previous);
        return next;
      });
    },
    [persist]
  );

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <div className="sticky top-0 z-20 border-b hairline glass px-6 py-4">
        <div className="relative z-10 flex items-center justify-between gap-4">
          <div>
            <p className="rule-label mb-0.5">
              Account
            </p>
            {/* display-hero not used here — see the same call on Advisor's
                header: its min size nearly doubles a persistent sticky bar's
                height, which this compact settings header can't absorb. */}
            <h1 className="display-font text-lg text-foreground">Settings</h1>
          </div>
          {/* Save status */}
          <div className="flex items-center gap-2 text-[11px] font-mono text-muted-foreground">
            {saving ? (
              <>
                <Loader2 size={12} className="animate-spin" />
                Saving…
              </>
            ) : saveError ? (
              <span className="text-foreground">{saveError}</span>
            ) : savedAt ? (
              <>
                <Check size={12} /> Saved
              </>
            ) : null}
          </div>
        </div>
      </div>

      <div className="px-6 py-6 max-w-3xl mx-auto">
        {loading ? (
          <div className="flex flex-col gap-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="glass rounded-2xl p-5 animate-pulse h-20" />
            ))}
          </div>
        ) : loadError || !prefs ? (
          <div className="glass rounded-2xl p-8 text-center">
            <div className="relative z-10">
              <p className="text-sm text-muted-foreground mb-3">
                Unable to load your settings
              </p>
              <button
                onClick={() => window.location.reload()}
                className="text-[11px] font-semibold uppercase tracking-wider text-foreground hover:underline"
              >
                Retry
              </button>
            </div>
          </div>
        ) : (
          <section>
            <div className="flex items-center gap-2 mb-2">
              <Bell size={14} className="text-muted-foreground" />
              <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
                Notifications
              </h2>
            </div>
            <p className="text-xs text-muted-foreground mb-4">
              Email-only for now. Choose which intelligence reaches your inbox —
              changes save automatically.
            </p>

            <div className="glass glass-sheen rounded-2xl">
              <div className="relative z-10 divide-y divide-[var(--hairline,rgba(255,255,255,0.06))]">
                {NOTIFICATION_ROWS.map((row) => (
                  <div key={row.key}>
                    <div className="flex items-start justify-between gap-4 p-5">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-foreground mb-1">
                          {row.label}
                        </p>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          {row.description}
                        </p>
                      </div>
                      <Toggle
                        label={row.label}
                        checked={prefs[row.key]}
                        onChange={(next) => update({ [row.key]: next })}
                      />
                    </div>

                    {/* Daily Briefing: time + timezone controls */}
                    {row.key === "daily_briefing" && (
                      <div
                        className={`px-5 pb-5 -mt-1 flex flex-wrap items-end gap-4 transition-opacity duration-200 ${
                          prefs.daily_briefing ? "opacity-100" : "opacity-40"
                        }`}
                      >
                        <div className="flex flex-col gap-1.5">
                          <label className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                            <Clock size={11} /> Delivery time
                          </label>
                          <input
                            type="time"
                            value={prefs.briefing_time}
                            disabled={!prefs.daily_briefing}
                            onChange={(e) =>
                              update({ briefing_time: e.target.value })
                            }
                            className="rounded-md border hairline surf-2 px-3 py-2 text-sm text-foreground focus:outline-none focus:border-foreground/30 disabled:cursor-not-allowed"
                          />
                        </div>
                        <div className="flex flex-col gap-1.5 min-w-[200px]">
                          <label className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                            <Globe size={11} /> Timezone
                          </label>
                          <select
                            value={prefs.timezone}
                            disabled={!prefs.daily_briefing}
                            onChange={(e) =>
                              update({ timezone: e.target.value })
                            }
                            className="rounded-md border hairline surf-2 px-3 py-2 text-sm text-foreground focus:outline-none focus:border-foreground/30 disabled:cursor-not-allowed"
                          >
                            {/* Ensure the saved value is selectable even if not in the list */}
                            {!timezones.includes(prefs.timezone) && (
                              <option value={prefs.timezone}>
                                {prefs.timezone}
                              </option>
                            )}
                            {timezones.map((tz) => (
                              <option key={tz} value={tz}>
                                {tz.replace(/_/g, " ")}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

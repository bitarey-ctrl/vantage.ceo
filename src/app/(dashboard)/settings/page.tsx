"use client";

import React, { useEffect, useMemo, useState, useCallback } from "react";

import { getNotificationPreferences, saveNotificationPreferences } from "./actions";
import { NOTIFICATION_DEFAULTS, type NotificationPrefsInput } from "./prefs";

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
      className="vx-toggle"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
    >
      <i />
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

  /*
   * Rebuilt to the prototype's settings screen (components/redesign/
   * screens.tsx): eyebrow + heading, then vx-settings-panel sections of
   * vx-setting-row entries with vx-toggle switches on the right.
   *
   * OMITTED from the prototype: its "Proposed settings experience" callout
   * (a note about this page erroring during their review — migration 015 is
   * applied and it loads), and the Appearance & density section, which has
   * no real setting behind it. Theme lives in the sidebar.
   *
   * Behaviour is unchanged: every control still writes through `update`,
   * which applies optimistically and reverts on failure.
   */
  const status = saving
    ? "Saving…"
    : saveError
    ? saveError
    : savedAt
    ? "Saved."
    : "Changes save automatically.";

  return (
    <>
      <div className="vx-page-heading">
        <div>
          <span className="vx-eyebrow">WORKSPACE PREFERENCES</span>
          <h1>Settings</h1>
          <p>Quiet defaults. Deliberate control.</p>
        </div>
      </div>

      {loading ? (
        <div className="vx-empty"><h2>Loading your settings…</h2></div>
      ) : loadError || !prefs ? (
        <div className="vx-empty">
          <h2>Couldn&apos;t load your settings</h2>
          <button className="vx-btn" onClick={() => window.location.reload()}>Try again</button>
        </div>
      ) : (
        <>
          <p className="vx-settings-note vx-quiet-note" role="status">{status}</p>

          <section className="vx-panel vx-settings-panel">
            <div className="vx-panel-head">
              <h2>Email notifications</h2>
            </div>
            {NOTIFICATION_ROWS.map((row) => (
              <div className="vx-setting-row" key={row.key}>
                <div>
                  <strong>{row.label}</strong>
                  <p>{row.description}</p>
                </div>
                <Toggle
                  label={row.label}
                  checked={prefs[row.key]}
                  onChange={(next) => update({ [row.key]: next })}
                />
              </div>
            ))}
          </section>

          <section className="vx-panel vx-settings-panel">
            <div className="vx-panel-head">
              <h2>Daily briefing delivery</h2>
            </div>
            <div className="vx-setting-row">
              <div>
                <strong>Delivery time</strong>
                <p>When your morning brief lands. Turn the daily briefing on to change it.</p>
              </div>
              <input
                type="time"
                aria-label="Delivery time"
                value={prefs.briefing_time}
                disabled={!prefs.daily_briefing}
                onChange={(e) => update({ briefing_time: e.target.value })}
              />
            </div>
            <div className="vx-setting-row">
              <div>
                <strong>Timezone</strong>
                <p>The clock your delivery time is read against.</p>
              </div>
              <select
                aria-label="Timezone"
                value={prefs.timezone}
                disabled={!prefs.daily_briefing}
                onChange={(e) => update({ timezone: e.target.value })}
              >
                {/* Keep a saved value selectable even if the runtime omits it. */}
                {!timezones.includes(prefs.timezone) && (
                  <option value={prefs.timezone}>{prefs.timezone}</option>
                )}
                {timezones.map((tz) => (
                  <option key={tz} value={tz}>{tz.replace(/_/g, " ")}</option>
                ))}
              </select>
            </div>
          </section>
        </>
      )}
    </>
  );
}

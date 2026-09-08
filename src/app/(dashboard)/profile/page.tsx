'use client';

import React, { useEffect, useState, useCallback } from 'react';

/*
 * Profile — rebuilt to the prototype's structure (components/redesign/
 * screens.tsx, the `area==='Profile'` block): eyebrow + heading, two tabs,
 * and a single vx-profile-form whose fields sit in a vx-form-grid with one
 * save in the vx-actions footer.
 *
 * What changed: fields are now directly editable instead of each card
 * carrying its own Edit / Save / Cancel cycle, and one Save writes the whole
 * tab. The API is unchanged — PATCH /api/profile still takes
 * { profile: {...} } or { context: {...} } and returns the fresh
 * ProfileResponse, which is what we put back into state.
 *
 * OMITTED from the prototype: the "Example workspace" tag (it was preview
 * chrome). The banner and 128px avatar from the old page are gone; the
 * prototype's profile has neither.
 */

interface ProfileData {
  id: string;
  email?: string;
  company_name?: string;
  full_name?: string;
  timezone?: string;
  brief_delivery_time?: string;
  onboarding_completed?: boolean;
}

interface ContextData {
  strategic_priorities?: unknown;
  revenue_model?: string;
  monthly_revenue_range?: string;
  competitors?: unknown;
  avoided_decision?: string;
  sector?: string;
}

interface ProfileResponse {
  profile: ProfileData;
  context: ContextData | null;
}

type ProfileTab = 'context' | 'account';

const TABS: { value: ProfileTab; label: string }[] = [
  { value: 'context', label: 'Strategic context' },
  { value: 'account', label: 'Account settings' },
];

const CONTEXT_FIELDS: {
  dbKey: keyof ContextData;
  label: string;
  placeholder: string;
  multiline?: boolean;
}[] = [
  {
    dbKey: 'strategic_priorities',
    label: 'Strategic priorities',
    placeholder: 'Expand into Europe, cut churn below 3%, hire a VP Sales',
    multiline: true,
  },
  {
    dbKey: 'revenue_model',
    label: 'Revenue model',
    placeholder: 'Subscription software',
  },
  {
    dbKey: 'monthly_revenue_range',
    label: 'Monthly revenue range',
    placeholder: '$50k–$200k / mo',
  },
  {
    dbKey: 'competitors',
    label: 'Competitive landscape',
    placeholder: 'The two or three names you lose deals to',
    multiline: true,
  },
  {
    dbKey: 'avoided_decision',
    label: 'Avoided decision',
    placeholder: 'The call you know you need to make but keep deferring',
    multiline: true,
  },
  {
    dbKey: 'sector',
    label: 'Sector & geography',
    placeholder: 'B2B SaaS · UK and US',
  },
];

const ACCOUNT_FIELDS: { key: keyof ProfileData; label: string; type?: string }[] = [
  { key: 'full_name', label: 'Full name' },
  { key: 'email', label: 'Email', type: 'email' },
  { key: 'company_name', label: 'Company name' },
  { key: 'timezone', label: 'Timezone' },
];

// Context columns are jsonb — arrays of strings or of {name}-ish objects.
function toDisplayString(val: unknown): string {
  if (!val) return '';
  if (typeof val === 'string') return val;
  if (Array.isArray(val)) {
    return val
      .map((item) => {
        if (typeof item === 'string') return item;
        if (typeof item === 'object' && item !== null) {
          const obj = item as Record<string, unknown>;
          return String(obj.name ?? obj.title ?? obj.text ?? JSON.stringify(item));
        }
        return String(item);
      })
      .join(', ');
  }
  return JSON.stringify(val);
}

export default function ProfilePage() {
  const [data, setData] = useState<ProfileResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [tab, setTab] = useState<ProfileTab>('context');
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState('');

  const hydrate = useCallback((json: ProfileResponse) => {
    setData(json);
    const next: Record<string, string> = {};
    for (const f of CONTEXT_FIELDS) next[f.dbKey] = toDisplayString(json.context?.[f.dbKey]);
    for (const f of ACCOUNT_FIELDS) next[f.key] = (json.profile?.[f.key] as string) ?? '';
    setDraft(next);
  }, []);

  const fetchProfile = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await fetch('/api/profile');
      if (!res.ok) throw new Error('failed');
      hydrate((await res.json()) as ProfileResponse);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [hydrate]);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  const set = (key: string, value: string) => {
    setDraft((d) => ({ ...d, [key]: value }));
    setSaved(false);
    setSaveError('');
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setSaveError('');
    const body =
      tab === 'context'
        ? { context: Object.fromEntries(CONTEXT_FIELDS.map((f) => [f.dbKey, draft[f.dbKey] ?? ''])) }
        : { profile: Object.fromEntries(ACCOUNT_FIELDS.map((f) => [f.key, draft[f.key] ?? ''])) };
    try {
      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as { error?: string; detail?: string } & ProfileResponse;
      if (!res.ok) throw new Error(json.detail ?? json.error ?? 'Save failed');
      hydrate(json);
      setSaved(true);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Save failed. Try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="vx-page-heading">
        <div>
          <span className="vx-eyebrow">YOUR BUSINESS, IN CONTEXT</span>
          <h1>Profile</h1>
          <p>Better context makes every recommendation more relevant.</p>
        </div>
      </div>

      <div className="vx-tabs">
        {TABS.map((t) => (
          <button
            key={t.value}
            aria-pressed={tab === t.value}
            onClick={() => {
              setTab(t.value);
              setSaved(false);
              setSaveError('');
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="vx-empty"><h2>Loading your profile…</h2></div>
      ) : error ? (
        <div className="vx-empty">
          <h2>Couldn&apos;t load your profile</h2>
          <button className="vx-btn" onClick={fetchProfile}>Try again</button>
        </div>
      ) : data ? (
        <form className="vx-panel vx-profile-form" key={tab} onSubmit={save}>
          <div className="vx-panel-head">
            <h2>{tab === 'context' ? 'Strategic context' : 'Account settings'}</h2>
          </div>

          {tab === 'context' && (
            <p className="vx-quiet-note">
              This context shapes every signal you see and every brief you get. Keep it current.
            </p>
          )}

          <div className="vx-form-grid">
            {tab === 'context'
              ? CONTEXT_FIELDS.map((f) => (
                  <label key={f.dbKey}>
                    {f.label}
                    {f.multiline ? (
                      <textarea
                        value={draft[f.dbKey] ?? ''}
                        placeholder={f.placeholder}
                        onChange={(e) => set(f.dbKey, e.target.value)}
                      />
                    ) : (
                      <input
                        value={draft[f.dbKey] ?? ''}
                        placeholder={f.placeholder}
                        onChange={(e) => set(f.dbKey, e.target.value)}
                      />
                    )}
                  </label>
                ))
              : ACCOUNT_FIELDS.map((f) => (
                  <label key={f.key}>
                    {f.label}
                    <input
                      type={f.type ?? 'text'}
                      value={draft[f.key] ?? ''}
                      onChange={(e) => set(f.key, e.target.value)}
                    />
                  </label>
                ))}
          </div>

          <footer className="vx-actions">
            <button className="vx-btn vx-primary" type="submit" disabled={saving}>
              {saving ? 'Saving…' : 'Save changes'}
            </button>
            {saved && <span role="status">Saved.</span>}
            {saveError && <span role="status">{saveError}</span>}
          </footer>
        </form>
      ) : null}
    </>
  );
}

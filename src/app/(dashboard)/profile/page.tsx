'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Edit2, Check, X, User, Building2 } from 'lucide-react';

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

function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded surf-2 ${className ?? ''}`} />;
}

// Map display key → actual DB column
const CONTEXT_SECTIONS: {
  dbKey: keyof ContextData;
  label: string;
  question: string;
  placeholder: string;
  multiline?: boolean;
}[] = [
  {
    dbKey: 'strategic_priorities',
    label: 'Strategic Priorities',
    question: 'What are your top 3 strategic priorities right now?',
    placeholder: 'e.g. Expand into Europe, reduce churn below 3%, hire VP Sales',
    multiline: true,
  },
  {
    dbKey: 'revenue_model',
    label: 'Revenue Model',
    question: 'How does your company make money?',
    placeholder: 'e.g. SaaS subscriptions, professional services, marketplace fees',
  },
  {
    dbKey: 'monthly_revenue_range',
    label: 'Monthly Revenue Range',
    question: "What's your current monthly revenue range?",
    placeholder: 'e.g. $50K – $200K / mo',
  },
  {
    dbKey: 'competitors',
    label: 'Competitive Landscape',
    question: 'Who are your primary competitors?',
    placeholder: 'e.g. Palantir, NexStrat, Exploding Topics',
    multiline: true,
  },
  {
    dbKey: 'avoided_decision',
    label: 'Avoided Decision',
    question: 'What decision have you been avoiding, and why?',
    placeholder: 'The decision you know you need to make but keep deferring...',
    multiline: true,
  },
  {
    dbKey: 'sector',
    label: 'Sector & Geography',
    question: 'What sector and geography do you operate in?',
    placeholder: 'e.g. B2B SaaS, Turkey, fintech vertical',
  },
];

// Convert any DB value to a display string
function toDisplayString(val: unknown): string {
  if (!val) return '';
  if (typeof val === 'string') return val;
  if (Array.isArray(val)) {
    return val.map((item) => {
      if (typeof item === 'string') return item;
      if (typeof item === 'object' && item !== null) {
        const obj = item as Record<string, unknown>;
        return obj.name ?? obj.title ?? obj.text ?? JSON.stringify(item);
      }
      return String(item);
    }).join(', ');
  }
  return JSON.stringify(val);
}

function ContextCard({
  label, question, placeholder, value, multiline, onSave,
}: {
  label: string;
  question: string;
  placeholder: string;
  value: string;
  multiline?: boolean;
  onSave: (val: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  const handleSave = async () => {
    setSaving(true);
    setSaveError('');
    try {
      await onSave(draft);
      setEditing(false);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Save failed. Try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="glass glass-sheen rounded-2xl p-5">
      <div className="relative z-10">
      <div className="flex items-start justify-between mb-3 gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-0.5">{label}</p>
          <p className="text-xs text-muted-foreground">{question}</p>
        </div>
        {!editing && (
          <button
            onClick={() => { setDraft(value); setSaveError(''); setEditing(true); }}
            className="flex-shrink-0 flex items-center gap-1.5 rounded border hairline surf-2 surf-hover px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground transition-all hover:text-foreground"
          >
            <Edit2 size={10} /> Edit
          </button>
        )}
      </div>
      <AnimatePresence mode="wait">
        {editing ? (
          <motion.div key="editing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
            {multiline ? (
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={placeholder}
                className="w-full rounded-md border hairline surf-2 px-3 py-2 text-sm text-foreground placeholder-muted-foreground/50 focus:outline-none focus:border-foreground/30 resize-none min-h-[100px]"
              />
            ) : (
              <input
                type="text"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={placeholder}
                className="w-full rounded-md border hairline surf-2 px-3 py-2 text-sm text-foreground placeholder-muted-foreground/50 focus:outline-none focus:border-foreground/30"
              />
            )}
            {saveError && <p className="mt-1 text-xs text-muted-foreground">{saveError}</p>}
            <div className="flex items-center gap-2 mt-3">
              <button onClick={handleSave} disabled={saving} className="flex items-center gap-1.5 rounded border hairline-strong surf-3 surf-hover px-3 py-1.5 text-xs font-semibold text-foreground disabled:opacity-40">
                {saving ? <span className="h-3 w-3 animate-spin rounded-full border border-foreground border-t-transparent" /> : <Check size={11} />}
                Save
              </button>
              <button onClick={() => { setEditing(false); setSaveError(''); }} className="flex items-center gap-1.5 rounded border hairline surf-2 px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground">
                <X size={11} /> Cancel
              </button>
            </div>
          </motion.div>
        ) : (
          <motion.div key="display" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
            {value
              ? <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">{value}</p>
              : <p className="text-sm text-muted-foreground/60 italic">{placeholder}</p>}
          </motion.div>
        )}
      </AnimatePresence>
      </div>
    </div>
  );
}

function AccountField({ label, value, type, fieldKey, onSave }: {
  label: string; value: string; type?: string; fieldKey: string;
  onSave: (key: string, value: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  const handleSave = async () => {
    setSaving(true);
    setSaveError('');
    try {
      await onSave(fieldKey, draft);
      setEditing(false);
    } catch {
      setSaveError('Save failed.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex items-center justify-between gap-4 py-3 border-b hairline last:border-0">
      <div className="flex-1 min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-0.5">{label}</p>
        {editing ? (
          <div className="flex items-center gap-2 mt-1">
            <input type={type ?? 'text'} value={draft} onChange={(e) => setDraft(e.target.value)}
              className="flex-1 rounded border hairline surf-2 px-2.5 py-1.5 text-sm text-foreground focus:outline-none focus:border-foreground/30" />
            <button onClick={handleSave} disabled={saving} className="flex items-center gap-1 rounded border hairline-strong surf-3 surf-hover px-2 py-1 text-[11px] font-semibold text-foreground disabled:opacity-40">
              {saving ? <span className="h-3 w-3 animate-spin rounded-full border border-foreground border-t-transparent" /> : <Check size={11} />}
            </button>
            <button onClick={() => { setEditing(false); setDraft(value); }} className="flex items-center gap-1 rounded border hairline surf-2 px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground">
              <X size={11} />
            </button>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{value || <span className="text-muted-foreground/60">—</span>}</p>
        )}
        {saveError && <p className="mt-1 text-xs text-muted-foreground">{saveError}</p>}
      </div>
      {!editing && (
        <button onClick={() => { setDraft(value); setEditing(true); setSaveError(''); }}
          className="flex-shrink-0 flex items-center gap-1 rounded border hairline surf-2 surf-hover px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground">
          <Edit2 size={10} /> Edit
        </button>
      )}
    </div>
  );
}

type ProfileTab = "context" | "account";

const PROFILE_TABS: { value: ProfileTab; label: string }[] = [
  { value: "context", label: "Strategic Context" },
  { value: "account", label: "Account Settings" },
];

function initialsFor(name: string | undefined, email: string | undefined): string {
  if (name && name.trim()) {
    const parts = name.trim().split(/\s+/);
    return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
  }
  if (email) return email[0]?.toUpperCase() ?? "?";
  return "?";
}

function handleFor(email: string | undefined): string | null {
  if (!email) return null;
  return `@${email.split("@")[0]}`;
}

export default function ProfilePage() {
  const [data, setData] = useState<ProfileResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [tab, setTab] = useState<ProfileTab>("context");

  const fetchProfile = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await fetch('/api/profile');
      if (!res.ok) throw new Error('failed');
      const json = await res.json() as ProfileResponse;
      setData(json);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchProfile(); }, [fetchProfile]);

  const handleContextSave = async (dbKey: keyof ContextData, value: string) => {
    const res = await fetch('/api/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ context: { [dbKey]: value } }),
    });
    const json = await res.json() as { error?: string; detail?: string } & ProfileResponse;
    if (!res.ok) throw new Error(json.detail ?? json.error ?? 'Save failed');
    setData(json);
  };

  const handleAccountSave = async (key: string, value: string) => {
    const res = await fetch('/api/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profile: { [key]: value } }),
    });
    const json = await res.json() as { error?: string; detail?: string } & ProfileResponse;
    if (!res.ok) throw new Error(json.detail ?? json.error ?? 'Save failed');
    setData(json);
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="px-6 py-8 max-w-3xl mx-auto">
        {loading ? (
          <div className="flex flex-col gap-4">
            <Skeleton className="h-[200px] w-full rounded-2xl" />
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-28 w-full rounded-2xl" />)}
          </div>
        ) : error ? (
          <div className="glass rounded-2xl p-8 text-center">
            <p className="text-sm text-muted-foreground mb-3">Unable to load profile</p>
            <button onClick={fetchProfile} className="text-[11px] font-semibold uppercase tracking-wider text-foreground hover:underline">Retry</button>
          </div>
        ) : data ? (
          <div className="flex flex-col gap-8">
            <p className="rule-label">Profile</p>
            {/* Banner + avatar */}
            <div>
              <div
                className="relative rounded-t-2xl hairline border"
                style={{ height: 200, background: 'var(--metric-bg)' }}
              >
                <span className="hairline-strong surf-2 absolute left-5 top-5 inline-flex items-center rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Personal
                </span>
              </div>
              {/* Below md the 128px avatar next to a name/handle block has no
                  room beside a 200px banner on a phone — stack and center
                  instead of sitting side-by-side. */}
              <div className="flex flex-col items-center gap-3 px-8 -mt-16 text-center md:flex-row md:items-end md:gap-4 md:text-left">
                <div
                  className="hairline-strong surf-3 flex items-center justify-center rounded-full border flex-shrink-0"
                  style={{ width: 128, height: 128 }}
                >
                  <span className="display-font text-3xl text-foreground">
                    {initialsFor(data.profile?.full_name, data.profile?.email)}
                  </span>
                </div>
                <div className="pb-2">
                  <p className="display-font text-2xl text-foreground leading-tight">
                    {data.profile?.full_name || data.profile?.company_name || 'Your profile'}
                  </p>
                  {handleFor(data.profile?.email) && (
                    <p className="text-sm text-muted-foreground mt-0.5">
                      {handleFor(data.profile?.email)}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Segmented tab strip */}
            <div className="glass-pill grid grid-cols-2 p-1">
              {PROFILE_TABS.map((t) => (
                <button
                  key={t.value}
                  onClick={() => setTab(t.value)}
                  className={`rounded-full py-2.5 text-[11px] font-bold uppercase tracking-wider transition-all ${
                    tab === t.value
                      ? "glass-pill-active text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* Tab content */}
            {tab === "context" ? (
              <section>
                <div className="flex items-center gap-2 mb-4">
                  <Building2 size={14} className="text-muted-foreground" />
                  <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">Strategic Context</h2>
                </div>
                <p className="text-xs text-muted-foreground mb-4">This context powers your daily intelligence brief and signal analysis. Keep it current.</p>
                <div className="section-container">
                  <div className="flex flex-col gap-3">
                    {CONTEXT_SECTIONS.map((section) => (
                      <ContextCard
                        key={section.dbKey}
                        label={section.label}
                        question={section.question}
                        placeholder={section.placeholder}
                        value={toDisplayString(data.context?.[section.dbKey])}
                        multiline={section.multiline}
                        onSave={(val) => handleContextSave(section.dbKey, val)}
                      />
                    ))}
                  </div>
                </div>
              </section>
            ) : (
              <section>
                <div className="flex items-center gap-2 mb-4">
                  <User size={14} className="text-muted-foreground" />
                  <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">Account Settings</h2>
                </div>
                <div className="section-container py-2">
                  <AccountField label="Full Name" value={data.profile?.full_name ?? ''} fieldKey="full_name" onSave={handleAccountSave} />
                  <AccountField label="Email" value={data.profile?.email ?? ''} type="email" fieldKey="email" onSave={handleAccountSave} />
                  <AccountField label="Company Name" value={data.profile?.company_name ?? ''} fieldKey="company_name" onSave={handleAccountSave} />
                  <AccountField label="Timezone" value={data.profile?.timezone ?? ''} fieldKey="timezone" onSave={handleAccountSave} />
                </div>
              </section>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}

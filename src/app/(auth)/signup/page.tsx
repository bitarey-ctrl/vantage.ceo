'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Lock, Mail, User, AlertCircle, ArrowRight, Loader2, KeyRound, Check } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

/*
 * Signup is INVITE-ONLY.
 *
 * Three states, so nobody is ever shown a form that cannot succeed:
 *   'checking' — verifying a code from ?code= on mount
 *   'gated'    — no code, or an invalid/used one: explain, offer a code
 *                field, and collect contact details instead
 *   'open'     — valid unused code: the real signup form
 *
 * The code is only VERIFIED here (read-only). It is claimed atomically inside
 * /api/auth/signup at the moment the account is created, so two people racing
 * on one code cannot both get in.
 *
 * "Sign up with Google" is deliberately absent during the invite phase: OAuth
 * goes straight to /auth/callback and never touches /api/auth/signup, so
 * leaving it up would be an unguarded way in. Restore it when signups open.
 */

const FIELD_CLASS =
  'w-full bg-[#111111] border border-[#242424] text-[#f5f5f5] text-sm pl-9 pr-4 py-3 rounded-none outline-none placeholder:text-[#404040] focus:border-[#1b7ff0] transition-colors duration-150 font-mono';
const LABEL_CLASS = 'text-[#a0a0a0] text-xs font-mono tracking-widest uppercase';

type GateState = 'checking' | 'gated' | 'open';

function SignupInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Derived at first render rather than set inside the effect: with no ?code=
  // there is nothing to verify, so we can start in the gated state directly.
  const codeFromUrl = searchParams.get('code');
  const [gate, setGate] = useState<GateState>(codeFromUrl ? 'checking' : 'gated');
  const [inviteCode, setInviteCode] = useState('');
  const [codeInput, setCodeInput] = useState('');
  const [codeError, setCodeError] = useState('');
  const [checkingCode, setCheckingCode] = useState(false);

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  /** Read-only check. Never consumes the code. */
  const verifyCode = useCallback(async (candidate: string): Promise<boolean> => {
    try {
      const res = await fetch('/api/auth/verify-invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: candidate }),
      });
      const data = (await res.json()) as { valid?: boolean; code?: string };
      if (data.valid && data.code) {
        setInviteCode(data.code);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }, []);

  // A code in the URL opens the form directly, so an invite link just works.
  useEffect(() => {
    if (!codeFromUrl) return;
    let active = true;
    void verifyCode(codeFromUrl).then((ok) => {
      if (!active) return;
      if (ok) {
        setGate('open');
      } else {
        setCodeInput(codeFromUrl);
        setCodeError('That invite code is not valid, or it has already been used.');
        setGate('gated');
      }
    });
    return () => {
      active = false;
    };
  }, [codeFromUrl, verifyCode]);

  async function handleCodeSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!codeInput.trim() || checkingCode) return;
    setCheckingCode(true);
    setCodeError('');
    const ok = await verifyCode(codeInput);
    setCheckingCode(false);
    if (ok) {
      setGate('open');
    } else {
      setCodeError('That invite code is not valid, or it has already been used.');
    }
  }

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      setLoading(false);
      return;
    }

    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, fullName, inviteCode }),
      });

      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        existing?: boolean;
        recovered?: boolean;
        inviteRequired?: boolean;
      };

      if (!res.ok) {
        // The code was taken between verification and submit — send them back
        // to the gate rather than leaving a form that can never succeed.
        if (data.inviteRequired) {
          setInviteCode('');
          setCodeInput('');
          setCodeError(data.error ?? 'That invite code is no longer valid.');
          setGate('gated');
          return;
        }
        setError(data.error ?? 'Could not create account.');
        return;
      }

      const supabase = createClient();
      const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password });

      if (signInErr) {
        router.push('/login');
        return;
      }

      router.push('/onboarding');
      router.refresh();
    } catch {
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  if (gate === 'checking') {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <Loader2 size={18} className="animate-spin text-[#1b7ff0]" />
        <p className="text-[#a0a0a0] text-xs font-mono">Checking your invite…</p>
      </div>
    );
  }

  if (gate === 'gated') {
    return <InviteGate
      codeInput={codeInput}
      setCodeInput={setCodeInput}
      codeError={codeError}
      checking={checkingCode}
      onSubmit={handleCodeSubmit}
    />;
  }

  return (
    <div>
      <div className="mb-8 flex flex-col items-center text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="VANTAGE" className="h-20 w-20 object-contain mb-5 rounded-2xl" />
        <h1 className="text-[#f5f5f5] text-2xl font-light tracking-tight mb-2">
          Create your command profile
        </h1>
        <p className="text-[#a0a0a0] text-sm font-mono">
          Strategic intelligence starts with context
        </p>
      </div>

      <div className="h-px bg-[#242424] mb-6" />

      {/* Confirmation that the invite is good, so the code is visible before submit */}
      <div className="flex items-center gap-2 bg-[#0c1a0c] border border-[#1d3a1d] px-3 py-2.5 mb-6">
        <Check size={14} className="text-[#4ba34b] shrink-0" />
        <p className="text-[#7cc47c] text-xs font-mono">
          Invite accepted — <span className="text-[#a8dca8]">{inviteCode}</span>
        </p>
      </div>

      <form onSubmit={handleSignup} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label className={LABEL_CLASS}>Full Name</label>
          <div className="relative">
            <User className="absolute left-3 top-1/2 -translate-y-1/2 text-[#a0a0a0]" size={14} />
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
              autoComplete="name"
              placeholder="Alex Chen"
              className={FIELD_CLASS}
            />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className={LABEL_CLASS}>Email</label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-[#a0a0a0]" size={14} />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              placeholder="you@company.com"
              className={FIELD_CLASS}
            />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className={LABEL_CLASS}>Password</label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-[#a0a0a0]" size={14} />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="new-password"
              placeholder="Minimum 8 characters"
              className={FIELD_CLASS}
            />
          </div>
          <p className="text-[#404040] text-xs font-mono">
            Use a strong passphrase. This account will hold strategic intelligence.
          </p>
        </div>

        {error && (
          <div className="flex items-start gap-2 bg-[#1a0a0a] border border-[#3a1010] px-3 py-2.5">
            <AlertCircle size={14} className="text-[#e05252] mt-0.5 shrink-0" />
            <p className="text-[#e05252] text-xs font-mono leading-relaxed">{error}</p>
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="mt-2 flex items-center justify-center gap-2 bg-[#1b7ff0] hover:bg-[#1a6fd0] text-white text-sm font-mono tracking-widest uppercase py-3 px-6 transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? (
            <>
              <Loader2 size={14} className="animate-spin" />
              <span>Initializing...</span>
            </>
          ) : (
            <>
              <span>Initialize Profile</span>
              <ArrowRight size={14} />
            </>
          )}
        </button>
      </form>

      <div className="mt-8 pt-6 border-t border-[#242424]">
        <p className="text-[#a0a0a0] text-xs font-mono text-center">
          Already have access?{' '}
          <Link href="/login" className="text-[#1b7ff0] hover:text-[#4a9ff5] transition-colors duration-150">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}

/* ── Invite-only screen ─────────────────────────────────────────────────────
 * Shown when there is no code or the code failed. Two ways forward: enter a
 * code, or leave contact details. Never a dead end.
 */
function InviteGate({
  codeInput,
  setCodeInput,
  codeError,
  checking,
  onSubmit,
}: {
  codeInput: string;
  setCodeInput: (v: string) => void;
  codeError: string;
  checking: boolean;
  onSubmit: (e: React.FormEvent) => void;
}) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [context, setContext] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [requestError, setRequestError] = useState('');

  async function handleRequest(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    setRequestError('');
    try {
      const res = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: name,
          email,
          challenge: context,
          source: 'signup_gate',
        }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) {
        setRequestError(data.error ?? 'Could not send your request. Please try again.');
        return;
      }
      setSent(true);
    } catch {
      setRequestError('Could not send your request. Please try again.');
    } finally {
      setSending(false);
    }
  }

  return (
    <div>
      <div className="mb-8 flex flex-col items-center text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="VANTAGE" className="h-20 w-20 object-contain mb-5 rounded-2xl" />
        <h1 className="text-[#f5f5f5] text-2xl font-light tracking-tight mb-2">
          Vantage is invite-only right now
        </h1>
        <p className="text-[#a0a0a0] text-sm font-mono leading-relaxed">
          We&apos;re onboarding a small number of founders at a time.
        </p>
      </div>

      <div className="h-px bg-[#242424] mb-8" />

      {/* Have a code */}
      <form onSubmit={onSubmit} className="flex flex-col gap-1.5 mb-8">
        <label className={LABEL_CLASS}>Have an invite code?</label>
        <div className="relative">
          <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 text-[#a0a0a0]" size={14} />
          <input
            type="text"
            value={codeInput}
            onChange={(e) => setCodeInput(e.target.value)}
            placeholder="VNTG-XXXX-XXXX"
            autoComplete="off"
            spellCheck={false}
            className={`${FIELD_CLASS} uppercase`}
          />
        </div>
        {codeError && (
          <div className="flex items-start gap-2 bg-[#1a0a0a] border border-[#3a1010] px-3 py-2.5 mt-1.5">
            <AlertCircle size={14} className="text-[#e05252] mt-0.5 shrink-0" />
            <p className="text-[#e05252] text-xs font-mono leading-relaxed">{codeError}</p>
          </div>
        )}
        <button
          type="submit"
          disabled={checking || !codeInput.trim()}
          className="mt-2 flex items-center justify-center gap-2 bg-[#1b7ff0] hover:bg-[#1a6fd0] text-white text-sm font-mono tracking-widest uppercase py-3 px-6 transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {checking ? (
            <>
              <Loader2 size={14} className="animate-spin" />
              <span>Checking...</span>
            </>
          ) : (
            <>
              <span>Continue</span>
              <ArrowRight size={14} />
            </>
          )}
        </button>
      </form>

      <div className="flex items-center gap-3 mb-6">
        <div className="flex-1 h-px bg-[#222222]" />
        <span className="text-[#343434] text-[10px] font-mono uppercase tracking-widest">or</span>
        <div className="flex-1 h-px bg-[#222222]" />
      </div>

      {/* Request access */}
      {sent ? (
        <div className="flex items-start gap-2 bg-[#0c1a0c] border border-[#1d3a1d] px-4 py-4">
          <Check size={14} className="text-[#4ba34b] mt-0.5 shrink-0" />
          <div>
            <p className="text-[#7cc47c] text-sm font-mono mb-1">Request received.</p>
            <p className="text-[#5a8a5a] text-xs font-mono leading-relaxed">
              We&apos;ll be in touch when a place opens up.
            </p>
          </div>
        </div>
      ) : (
        <form onSubmit={handleRequest} className="flex flex-col gap-4">
          <p className="text-[#a0a0a0] text-xs font-mono">Request access</p>

          <div className="flex flex-col gap-1.5">
            <label className={LABEL_CLASS}>Full Name</label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 text-[#a0a0a0]" size={14} />
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                autoComplete="name"
                placeholder="Alex Chen"
                className={FIELD_CLASS}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className={LABEL_CLASS}>Work Email</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-[#a0a0a0]" size={14} />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                placeholder="you@company.com"
                className={FIELD_CLASS}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className={LABEL_CLASS}>What are you trying to solve? (optional)</label>
            <textarea
              value={context}
              onChange={(e) => setContext(e.target.value)}
              rows={3}
              maxLength={1000}
              placeholder="One honest sentence is enough."
              className="w-full bg-[#111111] border border-[#242424] text-[#f5f5f5] text-sm px-4 py-3 rounded-none outline-none placeholder:text-[#404040] focus:border-[#1b7ff0] transition-colors duration-150 font-mono resize-none"
            />
          </div>

          {requestError && (
            <div className="flex items-start gap-2 bg-[#1a0a0a] border border-[#3a1010] px-3 py-2.5">
              <AlertCircle size={14} className="text-[#e05252] mt-0.5 shrink-0" />
              <p className="text-[#e05252] text-xs font-mono leading-relaxed">{requestError}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={sending}
            className="mt-2 flex items-center justify-center gap-2 bg-[#1a1a1a] border border-[#282828] hover:border-[#1b7ff0]/40 text-[#c8c8c8] text-sm font-mono tracking-widest uppercase py-3 px-6 transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {sending ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                <span>Sending...</span>
              </>
            ) : (
              <span>Request Access</span>
            )}
          </button>
        </form>
      )}

      <div className="mt-8 pt-6 border-t border-[#242424]">
        <p className="text-[#a0a0a0] text-xs font-mono text-center">
          Already have access?{' '}
          <Link href="/login" className="text-[#1b7ff0] hover:text-[#4a9ff5] transition-colors duration-150">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}

// useSearchParams needs a Suspense boundary so the route can still prerender.
export default function SignupPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-20">
          <Loader2 size={18} className="animate-spin text-[#1b7ff0]" />
        </div>
      }
    >
      <SignupInner />
    </Suspense>
  );
}

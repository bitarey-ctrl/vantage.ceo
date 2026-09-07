'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Lock, Mail, User, AlertCircle, ArrowRight, Loader2, Check } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { GoogleButton } from '@/components/auth/GoogleButton';

/*
 * Signup is OPEN — no invite code required.
 *
 * A ?code= in the URL is still honoured: it is verified for display and passed
 * to /api/auth/signup, which claims it so /admin/invites keeps recording who
 * redeemed what. An absent or invalid code never blocks signup.
 */

const FIELD_CLASS =
  'w-full bg-[#111111] border border-[#242424] text-[#f5f5f5] text-sm pl-9 pr-4 py-3 rounded-none outline-none placeholder:text-[#404040] focus:border-[#1b7ff0] transition-colors duration-150 font-mono';
const LABEL_CLASS = 'text-[#a0a0a0] text-xs font-mono tracking-widest uppercase';

function SignupInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const codeFromUrl = searchParams.get('code');

  const [inviteCode, setInviteCode] = useState('');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  /* Display only — the code is claimed server-side during signup. */
  const verifyCode = useCallback(async (candidate: string) => {
    try {
      const res = await fetch('/api/auth/verify-invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: candidate }),
      });
      const data = (await res.json()) as { valid?: boolean; code?: string };
      if (data.valid && data.code) setInviteCode(data.code);
    } catch {
      /* A bad code is not a blocker any more — stay silent. */
    }
  }, []);

  useEffect(() => {
    if (codeFromUrl) void verifyCode(codeFromUrl);
  }, [codeFromUrl, verifyCode]);

  async function handleGoogleSignup() {
    setGoogleLoading(true);
    setError('');
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: `${window.location.origin}/auth/callback?next=/onboarding` },
      });
      if (error) {
        setError(error.message);
        setGoogleLoading(false);
      }
      // On success Supabase redirects the browser — no manual push needed.
    } catch {
      setError('Google sign-in failed. Please try again.');
      setGoogleLoading(false);
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
        body: JSON.stringify({ email, password, fullName, inviteCode: inviteCode || undefined }),
      });

      const data = (await res.json()) as { ok?: boolean; error?: string };

      if (!res.ok) {
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

      <div className="h-px bg-[#242424] mb-8" />

      {inviteCode && (
        <div className="flex items-center gap-2 bg-[#0c1a0c] border border-[#1d3a1d] px-3 py-2.5 mb-6">
          <Check size={14} className="text-[#4ba34b] shrink-0" />
          <p className="text-[#7cc47c] text-xs font-mono">
            Invite recognised — <span className="text-[#a8dca8]">{inviteCode}</span>
          </p>
        </div>
      )}

      <GoogleButton
        label="Sign up with Google"
        loading={googleLoading}
        disabled={loading}
        onClick={handleGoogleSignup}
      />

      <div className="flex items-center gap-3 mb-6">
        <div className="flex-1 h-px bg-[#222222]" />
        <span className="text-[#343434] text-[10px] font-mono uppercase tracking-widest">or</span>
        <div className="flex-1 h-px bg-[#222222]" />
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
          disabled={loading || googleLoading}
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

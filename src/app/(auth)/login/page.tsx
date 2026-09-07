'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Lock, Mail, AlertCircle, ArrowRight, Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const supabase = createClient();
      const { error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) {
        setError(authError.message);
        return;
      }

      router.push('/');
      router.refresh();
    } catch {
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-8 flex flex-col items-center text-center">
        <img
          src="/logo.png"
          alt="VANTAGE"
          className="h-20 w-20 object-contain mb-5 rounded-2xl"
        />
        <h1 className="text-[#f5f5f5] text-2xl font-light tracking-tight mb-2">
          Access your intelligence
        </h1>
        <p className="text-[#a0a0a0] text-sm font-mono">
          Authenticated session required
        </p>
      </div>

      {/* Divider */}
      <div className="h-px bg-[#242424] mb-8" />

      {/*
       * "Continue with Google" is deliberately absent during the invite-only
       * phase. signInWithOAuth CREATES an account on first sign-in and never
       * touches /api/auth/signup, so leaving it here let anyone bypass the
       * invite-code gate entirely from the login page. Restore it — here and
       * on /signup — when signups open publicly.
       */}

      <form onSubmit={handleLogin} className="flex flex-col gap-4">
        {/* Email */}
        <div className="flex flex-col gap-1.5">
          <label className="text-[#a0a0a0] text-xs font-mono tracking-widest uppercase">
            Email
          </label>
          <div className="relative">
            <Mail
              className="absolute left-3 top-1/2 -translate-y-1/2 text-[#a0a0a0]"
              size={14}
            />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              placeholder="you@company.com"
              className="w-full bg-[#111111] border border-[#242424] text-[#f5f5f5] text-sm pl-9 pr-4 py-3 rounded-none outline-none placeholder:text-[#404040] focus:border-[#1b7ff0] transition-colors duration-150 font-mono"
            />
          </div>
        </div>

        {/* Password */}
        <div className="flex flex-col gap-1.5">
          <label className="text-[#a0a0a0] text-xs font-mono tracking-widest uppercase">
            Password
          </label>
          <div className="relative">
            <Lock
              className="absolute left-3 top-1/2 -translate-y-1/2 text-[#a0a0a0]"
              size={14}
            />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              placeholder="••••••••••••"
              className="w-full bg-[#111111] border border-[#242424] text-[#f5f5f5] text-sm pl-9 pr-4 py-3 rounded-none outline-none placeholder:text-[#404040] focus:border-[#1b7ff0] transition-colors duration-150 font-mono tracking-widest"
            />
          </div>
        </div>

        {/* Error — actionable based on what Supabase returned */}
        {error && (
          <div className="flex flex-col gap-2 bg-[#1a0a0a] border border-[#3a1010] px-3 py-2.5">
            <div className="flex items-start gap-2">
              <AlertCircle size={14} className="text-[#e05252] mt-0.5 shrink-0" />
              <p className="text-[#e05252] text-xs font-mono leading-relaxed">{error}</p>
            </div>

            {/* Recovery actions appear based on which error fired */}
            {/email not confirmed/i.test(error) && (
              <Link
                href={`/signup?email=${encodeURIComponent(email)}`}
                className="text-[#1b7ff0] hover:text-[#4a9ff5] text-xs font-mono underline ml-6"
              >
                Confirm this email & set a new password →
              </Link>
            )}
            {/invalid login credentials/i.test(error) && (
              <div className="flex flex-col gap-1 ml-6">
                <Link
                  href={`/forgot-password?email=${encodeURIComponent(email)}`}
                  className="text-[#1b7ff0] hover:text-[#4a9ff5] text-xs font-mono underline"
                >
                  Reset your password →
                </Link>
                <Link
                  href={`/signup?email=${encodeURIComponent(email)}`}
                  className="text-[#a0a0a0] hover:text-[#1b7ff0] text-xs font-mono underline"
                >
                  Don&apos;t have an account? Sign up →
                </Link>
              </div>
            )}
          </div>
        )}

        {/* Submit */}
        <button
          type="submit"
          disabled={loading}
          className="mt-2 flex items-center justify-center gap-2 bg-[#1b7ff0] hover:bg-[#1a6fd0] text-white text-sm font-mono tracking-widest uppercase py-3 px-6 transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? (
            <>
              <Loader2 size={14} className="animate-spin" />
              <span>Authenticating...</span>
            </>
          ) : (
            <>
              <span>Enter</span>
              <ArrowRight size={14} />
            </>
          )}
        </button>

        {/* Forgot password */}
        <div className="text-center">
          <Link
            href="/forgot-password"
            className="text-[#a0a0a0] hover:text-[#1b7ff0] text-xs font-mono transition-colors duration-150"
          >
            Forgot password?
          </Link>
        </div>
      </form>

      {/* Footer link */}
      <div className="mt-8 pt-6 border-t border-[#242424]">
        <p className="text-[#a0a0a0] text-xs font-mono text-center">
          No access credentials?{' '}
          <Link
            href="/signup"
            className="text-[#1b7ff0] hover:text-[#4a9ff5] transition-colors duration-150"
          >
            Request access
          </Link>
        </p>
      </div>
    </div>
  );
}

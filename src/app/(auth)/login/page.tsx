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
  const [googleLoading, setGoogleLoading] = useState(false);

  async function handleGoogleLogin() {
    setGoogleLoading(true);
    setError('');
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback?next=/command`,
        },
      });
      if (error) {
        setError(error.message);
        setGoogleLoading(false);
      }
      // On success: Supabase redirects the browser — no manual push needed
    } catch {
      setError('Google sign-in failed. Please try again.');
      setGoogleLoading(false);
    }
  }

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

      {/* Google OAuth */}
      <button
        type="button"
        onClick={handleGoogleLogin}
        disabled={googleLoading || loading}
        className="w-full flex items-center justify-center gap-3 bg-[#1a1a1a] border border-[#282828] hover:border-[#9F0202]/30 hover:bg-[#1a1a1a] text-[#c8c8c8] text-sm font-mono py-3 px-4 transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed mb-4"
      >
        {googleLoading ? (
          <Loader2 size={14} className="animate-spin text-[#8a8a8a]" />
        ) : (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
        )}
        <span>{googleLoading ? 'Connecting...' : 'Continue with Google'}</span>
      </button>

      {/* Divider between Google and email form */}
      <div className="flex items-center gap-3 mb-6">
        <div className="flex-1 h-px bg-[#222222]" />
        <span className="text-[#343434] text-[10px] font-mono uppercase tracking-widest">or</span>
        <div className="flex-1 h-px bg-[#222222]" />
      </div>

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

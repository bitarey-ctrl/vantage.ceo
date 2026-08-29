'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Lock, Mail, User, AlertCircle, ArrowRight, Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

export default function SignupPage() {
  const router = useRouter();
  const [fullName, setFullName] = useState('');
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
          redirectTo: `${window.location.origin}/auth/callback?next=/onboarding`,
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
      // Server-side signup uses the admin client with email_confirm: true,
      // so the account is immediately usable. No confirmation email needed.
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, fullName }),
      });

      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        existing?: boolean;
        recovered?: boolean;
      };

      if (!res.ok) {
        setError(data.error ?? "Could not create account.");
        return;
      }

      // Account exists and is now ready — sign in client-side so we get
      // the auth cookies set on this browser session, then redirect.
      const supabase = createClient();
      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInErr) {
        // Edge case: account created but sign-in failed. Bounce to login.
        router.push("/login");
        return;
      }

      router.push("/onboarding");
      router.refresh();
    } catch {
      setError("An unexpected error occurred. Please try again.");
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
          Create your command profile
        </h1>
        <p className="text-[#a0a0a0] text-sm font-mono">
          Strategic intelligence starts with context
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
        <span>{googleLoading ? 'Connecting...' : 'Sign up with Google'}</span>
      </button>

      {/* Divider between Google and email form */}
      <div className="flex items-center gap-3 mb-6">
        <div className="flex-1 h-px bg-[#222222]" />
        <span className="text-[#343434] text-[10px] font-mono uppercase tracking-widest">or</span>
        <div className="flex-1 h-px bg-[#222222]" />
      </div>

      <form onSubmit={handleSignup} className="flex flex-col gap-4">
        {/* Full Name */}
        <div className="flex flex-col gap-1.5">
          <label className="text-[#a0a0a0] text-xs font-mono tracking-widest uppercase">
            Full Name
          </label>
          <div className="relative">
            <User
              className="absolute left-3 top-1/2 -translate-y-1/2 text-[#a0a0a0]"
              size={14}
            />
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
              autoComplete="name"
              placeholder="Alex Chen"
              className="w-full bg-[#111111] border border-[#242424] text-[#f5f5f5] text-sm pl-9 pr-4 py-3 rounded-none outline-none placeholder:text-[#404040] focus:border-[#1b7ff0] transition-colors duration-150 font-mono"
            />
          </div>
        </div>

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
              autoComplete="new-password"
              placeholder="Minimum 8 characters"
              className="w-full bg-[#111111] border border-[#242424] text-[#f5f5f5] text-sm pl-9 pr-4 py-3 rounded-none outline-none placeholder:text-[#404040] focus:border-[#1b7ff0] transition-colors duration-150 font-mono"
            />
          </div>
          <p className="text-[#404040] text-xs font-mono">
            Use a strong passphrase. This account will hold strategic intelligence.
          </p>
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-start gap-2 bg-[#1a0a0a] border border-[#3a1010] px-3 py-2.5">
            <AlertCircle size={14} className="text-[#e05252] mt-0.5 shrink-0" />
            <p className="text-[#e05252] text-xs font-mono leading-relaxed">{error}</p>
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

      {/* Footer link */}
      <div className="mt-8 pt-6 border-t border-[#242424]">
        <p className="text-[#a0a0a0] text-xs font-mono text-center">
          Already have access?{' '}
          <Link
            href="/login"
            className="text-[#1b7ff0] hover:text-[#4a9ff5] transition-colors duration-150"
          >
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}

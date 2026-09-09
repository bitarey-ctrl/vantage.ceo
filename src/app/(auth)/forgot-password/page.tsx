'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Mail, AlertCircle, ArrowRight, Loader2, CheckCircle2 } from 'lucide-react';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      if (!res.ok) {
        setError('Could not send reset link. Please try again.');
        return;
      }

      setSent(true);
    } catch {
      setError('Unexpected error. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <div className="mb-8 flex flex-col items-center text-center">
        <h1 className="text-[#e8eaee] text-2xl font-light tracking-tight mb-2">
          Reset your password
        </h1>
        <p className="text-[#959ca7] text-sm font-mono">
          We&apos;ll send a recovery link to your email
        </p>
      </div>

      <div className="h-px bg-[#ffffff13] mb-8" />

      {sent ? (
        <div className="flex flex-col items-center gap-4 py-4">
          <CheckCircle2 size={32} className="text-[#ff321f]" />
          <p className="text-[#e8eaee] text-sm text-center">
            If an account exists for <span className="font-mono">{email}</span>, a recovery link has been sent.
          </p>
          <p className="text-[#959ca7] text-xs font-mono text-center max-w-sm">
            Check your inbox and spam folder. The link expires in 1 hour.
            <br />
            <br />
            In development, the link is also printed to your server console.
          </p>
          <Link
            href="/login"
            className="mt-4 text-[#ff321f] hover:text-[#ff6657] text-xs font-mono transition-colors duration-150"
          >
            ← Back to sign in
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-[#959ca7] text-xs font-mono tracking-widest uppercase">
              Email
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-[#959ca7]" size={14} />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                placeholder="you@company.com"
                className="w-full bg-[#111214] border border-[#ffffff13] text-[#e8eaee] text-sm pl-9 pr-4 py-3 rounded-none outline-none placeholder:text-[#737d8a] focus:border-[#ff321f] transition-colors duration-150 font-mono"
              />
            </div>
          </div>

          {error && (
            <div className="flex items-start gap-2 bg-[#ff321f0d] border border-[#ff321f33] px-3 py-2.5">
              <AlertCircle size={14} className="text-[#ff4938] mt-0.5 shrink-0" />
              <p className="text-[#ff4938] text-xs font-mono leading-relaxed">{error}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="mt-2 flex items-center justify-center gap-2 bg-[#ff321f] hover:bg-[#e02c1b] text-white text-sm font-mono tracking-widest uppercase py-3 px-6 transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                <span>Sending...</span>
              </>
            ) : (
              <>
                <span>Send Reset Link</span>
                <ArrowRight size={14} />
              </>
            )}
          </button>
        </form>
      )}

      <div className="mt-8 pt-6 border-t border-[#ffffff13]">
        <p className="text-[#959ca7] text-xs font-mono text-center">
          Remembered it?{' '}
          <Link href="/login" className="text-[#ff321f] hover:text-[#ff6657] transition-colors duration-150">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}

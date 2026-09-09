'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Lock, AlertCircle, ArrowRight, Loader2, CheckCircle2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      const supabase = createClient();
      const { error: updateErr } = await supabase.auth.updateUser({ password });
      if (updateErr) {
        setError(updateErr.message);
        return;
      }
      setDone(true);
      setTimeout(() => {
        router.push('/');
        router.refresh();
      }, 1500);
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
          Set a new password
        </h1>
        <p className="text-[#959ca7] text-sm font-mono">
          You&apos;ll be signed in automatically
        </p>
      </div>

      <div className="h-px bg-[#ffffff13] mb-8" />

      {done ? (
        <div className="flex flex-col items-center gap-4 py-4">
          <CheckCircle2 size={32} className="text-[#ff321f]" />
          <p className="text-[#e8eaee] text-sm">Password updated. Redirecting...</p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-[#959ca7] text-xs font-mono tracking-widest uppercase">
              New Password
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-[#959ca7]" size={14} />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="new-password"
                placeholder="Minimum 8 characters"
                className="w-full bg-[#111214] border border-[#ffffff13] text-[#e8eaee] text-sm pl-9 pr-4 py-3 rounded-none outline-none placeholder:text-[#737d8a] focus:border-[#ff321f] transition-colors duration-150 font-mono"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[#959ca7] text-xs font-mono tracking-widest uppercase">
              Confirm Password
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-[#959ca7]" size={14} />
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                autoComplete="new-password"
                placeholder="Re-enter password"
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
                <span>Updating...</span>
              </>
            ) : (
              <>
                <span>Update Password</span>
                <ArrowRight size={14} />
              </>
            )}
          </button>
        </form>
      )}

      <div className="mt-8 pt-6 border-t border-[#ffffff13]">
        <p className="text-[#959ca7] text-xs font-mono text-center">
          <Link href="/login" className="text-[#ff321f] hover:text-[#ff6657] transition-colors duration-150">
            ← Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}

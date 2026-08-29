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
        <img src="/logo.png" alt="VANTAGE" className="h-20 w-20 object-contain mb-5 rounded-2xl" />
        <h1 className="text-[#f5f5f5] text-2xl font-light tracking-tight mb-2">
          Set a new password
        </h1>
        <p className="text-[#a0a0a0] text-sm font-mono">
          You&apos;ll be signed in automatically
        </p>
      </div>

      <div className="h-px bg-[#242424] mb-8" />

      {done ? (
        <div className="flex flex-col items-center gap-4 py-4">
          <CheckCircle2 size={32} className="text-[#1b7ff0]" />
          <p className="text-[#f5f5f5] text-sm">Password updated. Redirecting...</p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-[#a0a0a0] text-xs font-mono tracking-widest uppercase">
              New Password
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-[#a0a0a0]" size={14} />
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
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[#a0a0a0] text-xs font-mono tracking-widest uppercase">
              Confirm Password
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-[#a0a0a0]" size={14} />
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                autoComplete="new-password"
                placeholder="Re-enter password"
                className="w-full bg-[#111111] border border-[#242424] text-[#f5f5f5] text-sm pl-9 pr-4 py-3 rounded-none outline-none placeholder:text-[#404040] focus:border-[#1b7ff0] transition-colors duration-150 font-mono"
              />
            </div>
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

      <div className="mt-8 pt-6 border-t border-[#242424]">
        <p className="text-[#a0a0a0] text-xs font-mono text-center">
          <Link href="/login" className="text-[#1b7ff0] hover:text-[#4a9ff5] transition-colors duration-150">
            ← Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}

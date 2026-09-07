"use client";

import { useState } from "react";
import { AlertCircle, Check, Loader2, Mail, User } from "lucide-react";

/*
 * "Request access" — for people who want to reach out without creating an
 * account yet.
 *
 * Extracted from the invite-only gate that used to sit on /signup. Signup is
 * open now, so this is no longer a blocker: it is a contact form, reachable
 * from /request-access and linked at the bottom of /login.
 *
 * Writes to waitlist_requests via /api/waitlist. `source` distinguishes where
 * the request came from; the API whitelists the accepted values.
 */

const FIELD_CLASS =
  "w-full bg-[#111111] border border-[#242424] text-[#f5f5f5] text-sm pl-9 pr-4 py-3 rounded-none outline-none placeholder:text-[#404040] focus:border-[#1b7ff0] transition-colors duration-150 font-mono";
const LABEL_CLASS = "text-[#a0a0a0] text-xs font-mono tracking-widest uppercase";

export function RequestAccessForm({ source = "login_link" }: { source?: string }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [context, setContext] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    setError("");
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName: name, email, challenge: context, source }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) {
        setError(data.error ?? "Could not send your request. Please try again.");
        return;
      }
      setSent(true);
    } catch {
      setError("Could not send your request. Please try again.");
    } finally {
      setSending(false);
    }
  }

  if (sent) {
    return (
      <div className="flex items-start gap-2 bg-[#0c1a0c] border border-[#1d3a1d] px-4 py-4">
        <Check size={14} className="text-[#4ba34b] mt-0.5 shrink-0" />
        <div>
          <p className="text-[#7cc47c] text-sm font-mono mb-1">Request received.</p>
          <p className="text-[#5a8a5a] text-xs font-mono leading-relaxed">
            We&apos;ll be in touch shortly.
          </p>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
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

      {error && (
        <div className="flex items-start gap-2 bg-[#1a0a0a] border border-[#3a1010] px-3 py-2.5">
          <AlertCircle size={14} className="text-[#e05252] mt-0.5 shrink-0" />
          <p className="text-[#e05252] text-xs font-mono leading-relaxed">{error}</p>
        </div>
      )}

      <button
        type="submit"
        disabled={sending}
        className="mt-2 flex items-center justify-center gap-2 bg-[#1b7ff0] hover:bg-[#1a6fd0] text-white text-sm font-mono tracking-widest uppercase py-3 px-6 transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {sending ? (
          <>
            <Loader2 size={14} className="animate-spin" />
            <span>Sending...</span>
          </>
        ) : (
          <span>Send Request</span>
        )}
      </button>
    </form>
  );
}

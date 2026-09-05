"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, Plus, Copy, Check, ArrowLeft, RefreshCw } from "lucide-react";

/*
 * Invite code admin.
 *
 * Auth reuses the existing /admin mechanism exactly: the password lives in
 * sessionStorage under "admin_pw" and is sent as X-Admin-Password, same as
 * /api/admin/stats. Signing in on either page signs you in on both.
 */

interface InviteCode {
  id: string;
  code: string;
  note: string | null;
  created_at: string;
  used_at: string | null;
  used_by_email: string | null;
}

interface Totals {
  total: number;
  used: number;
  unused: number;
}

type Filter = "all" | "unused" | "used";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function InvitesPage() {
  const [password, setPassword] = useState("");
  const [authed, setAuthed] = useState(false);
  const [wrongPw, setWrongPw] = useState(false);
  const [codes, setCodes] = useState<InviteCode[]>([]);
  const [totals, setTotals] = useState<Totals>({ total: 0, used: 0, unused: 0 });
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [copied, setCopied] = useState<string | null>(null);

  const fetchCodes = useCallback(async (pw: string) => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/invites", {
        headers: { "X-Admin-Password": pw },
      });
      if (res.status === 401) {
        setWrongPw(true);
        setAuthed(false);
        return;
      }
      if (!res.ok) {
        setError("Failed to load invite codes");
        return;
      }
      const json = (await res.json()) as { codes: InviteCode[]; totals: Totals };
      setCodes(json.codes);
      setTotals(json.totals);
      setAuthed(true);
      sessionStorage.setItem("admin_pw", pw);
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const saved = sessionStorage.getItem("admin_pw");
    if (saved) {
      setPassword(saved);
      void fetchCodes(saved);
    }
  }, [fetchCodes]);

  async function createCode() {
    const pw = sessionStorage.getItem("admin_pw") ?? password;
    setCreating(true);
    setError("");
    try {
      const res = await fetch("/api/admin/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Admin-Password": pw },
        body: JSON.stringify({ note: note.trim() || undefined }),
      });
      if (!res.ok) {
        setError("Could not create a code");
        return;
      }
      const json = (await res.json()) as { code: InviteCode };
      setCodes((prev) => [json.code, ...prev]);
      setTotals((t) => ({ ...t, total: t.total + 1, unused: t.unused + 1 }));
      setNote("");
    } catch {
      setError("Network error");
    } finally {
      setCreating(false);
    }
  }

  async function copyLink(code: string) {
    const url = `${window.location.origin}/signup?code=${code}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(code);
      window.setTimeout(() => setCopied(null), 1600);
    } catch {
      setError("Could not copy to clipboard");
    }
  }

  if (!authed) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <div className="w-full max-w-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#444444] mb-1 text-center">
            VANTAGE
          </p>
          <h1 className="text-xl font-semibold text-[#f5f5f5] mb-6 text-center">Invite Codes</h1>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setWrongPw(false);
              void fetchCodes(password);
            }}
            className="flex flex-col gap-3"
          >
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Admin password"
              autoFocus
              className="w-full rounded-lg border border-[#242424] bg-[#111111] px-4 py-3 text-sm text-[#f5f5f5] placeholder-[#444444] outline-none focus:border-[#1b7ff0]/60 transition-colors"
            />
            {wrongPw && <p className="text-xs text-[#e5463e]">Wrong password</p>}
            <button
              type="submit"
              disabled={loading || !password}
              className="w-full rounded-lg bg-[#CC1F1F] py-3 text-sm font-semibold text-white hover:bg-[#b01818] transition-colors disabled:opacity-40"
            >
              {loading ? "Checking..." : "Enter"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  const visible = codes.filter((c) =>
    filter === "all" ? true : filter === "used" ? Boolean(c.used_at) : !c.used_at
  );

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#f5f5f5] p-8">
      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <Link
            href="/admin"
            className="inline-flex items-center gap-1.5 text-xs text-[#666666] hover:text-[#1b7ff0] transition-colors mb-2"
          >
            <ArrowLeft size={12} /> Admin
          </Link>
          <h1 className="text-xl font-semibold text-[#f5f5f5]">Invite Codes</h1>
          <p className="text-xs text-[#444444] mt-0.5">
            {totals.total} issued · {totals.unused} unused · {totals.used} used
          </p>
        </div>
        <button
          onClick={() => void fetchCodes(sessionStorage.getItem("admin_pw") ?? password)}
          disabled={loading}
          className="flex items-center gap-2 rounded-lg border border-[#242424] px-4 py-2 text-xs font-semibold text-[#a0a0a0] hover:border-[#1b7ff0]/40 hover:text-[#1b7ff0] transition-colors disabled:opacity-40"
        >
          <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      {/* Create */}
      <div className="rounded-lg border border-[#242424] bg-[#0f0f0f] p-5 mb-8">
        <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[#666666] mb-3">
          Generate a code
        </p>
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void createCode();
            }}
            placeholder="Optional label — e.g. Sarah @ Acme"
            maxLength={200}
            className="flex-1 rounded-lg border border-[#242424] bg-[#111111] px-4 py-3 text-sm text-[#f5f5f5] placeholder-[#444444] outline-none focus:border-[#1b7ff0]/60 transition-colors"
          />
          <button
            onClick={() => void createCode()}
            disabled={creating}
            className="flex items-center justify-center gap-2 rounded-lg bg-[#CC1F1F] px-6 py-3 text-sm font-semibold text-white hover:bg-[#b01818] transition-colors disabled:opacity-40 whitespace-nowrap"
          >
            {creating ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            New code
          </button>
        </div>
      </div>

      {error && (
        <p className="mb-4 rounded-lg border border-[#3a1010] bg-[#1a0a0a] px-4 py-2.5 text-xs text-[#e5463e]">
          {error}
        </p>
      )}

      {/* Filter */}
      <div className="flex gap-2 mb-4">
        {(["all", "unused", "used"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-lg border px-3 py-1.5 text-xs font-semibold capitalize transition-colors ${
              filter === f
                ? "border-[#1b7ff0]/50 bg-[#1b7ff0]/10 text-[#1b7ff0]"
                : "border-[#242424] text-[#666666] hover:text-[#a0a0a0]"
            }`}
          >
            {f} · {f === "all" ? totals.total : f === "used" ? totals.used : totals.unused}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="rounded-lg border border-[#242424] overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-[#0f0f0f]">
            <tr className="text-[10px] uppercase tracking-[0.15em] text-[#555555]">
              <th className="px-4 py-3 font-semibold">Code</th>
              <th className="px-4 py-3 font-semibold">Label</th>
              <th className="px-4 py-3 font-semibold">Created</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold">Used by</th>
              <th className="px-4 py-3 font-semibold" />
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-sm text-[#555555]">
                  {codes.length === 0
                    ? "No codes yet — generate one above."
                    : "No codes match this filter."}
                </td>
              </tr>
            ) : (
              visible.map((c) => (
                <tr key={c.id} className="border-t border-[#1a1a1a] text-sm">
                  <td className="px-4 py-3 font-mono text-[#f5f5f5] whitespace-nowrap">{c.code}</td>
                  <td className="px-4 py-3 text-[#a0a0a0]">{c.note ?? "—"}</td>
                  <td className="px-4 py-3 text-[#666666] whitespace-nowrap">
                    {formatDate(c.created_at)}
                  </td>
                  <td className="px-4 py-3">
                    {c.used_at ? (
                      <span className="inline-block rounded-full border border-[#3a2a10] bg-[#1a1408] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-[#c99a3a]">
                        Used
                      </span>
                    ) : (
                      <span className="inline-block rounded-full border border-[#1d3a1d] bg-[#0c1a0c] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-[#4ba34b]">
                        Unused
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-[#a0a0a0]">
                    {c.used_by_email ? (
                      <span>
                        {c.used_by_email}
                        <span className="block text-[10px] text-[#555555]">
                          {formatDate(c.used_at)}
                        </span>
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {!c.used_at && (
                      <button
                        onClick={() => void copyLink(c.code)}
                        title="Copy invite link"
                        className="inline-flex items-center gap-1.5 rounded-lg border border-[#242424] px-3 py-1.5 text-xs text-[#a0a0a0] hover:border-[#1b7ff0]/40 hover:text-[#1b7ff0] transition-colors"
                      >
                        {copied === c.code ? <Check size={12} /> : <Copy size={12} />}
                        {copied === c.code ? "Copied" : "Link"}
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

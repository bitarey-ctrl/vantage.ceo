"use client";

import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { Send, Loader2, Plus, MessageSquare, PanelLeftClose, PanelLeftOpen, Pencil, Trash2, Check, X, Search } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface SessionMeta {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

interface SessionFull extends SessionMeta {
  messages: Message[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STARTERS = [
  "What signals should I be acting on right now?",
  "What patterns do you see in my decisions?",
  "What's my biggest strategic blind spot?",
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function ThinkingDots() {
  return (
    <span className="inline-flex items-center gap-1.5">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="w-2 h-2 rounded-full bg-foreground/40 animate-pulse"
          style={{ animationDelay: `${i * 0.2}s` }}
        />
      ))}
    </span>
  );
}

function trimToWord(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max).replace(/\s+\S*$/, "");
  return (cut || text.slice(0, max)) + "...";
}

function formatSessionDate(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  if (
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear()
  ) {
    return "Today";
  }
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ─── Markdown renderer ────────────────────────────────────────────────────────

function renderInline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return <strong key={i} className="font-semibold text-foreground">{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
      return (
        <code key={i} className="px-1.5 py-0.5 rounded surf-3 font-mono text-[12px]">
          {part.slice(1, -1)}
        </code>
      );
    }
    if (part.startsWith("*") && part.endsWith("*") && part.length > 2) {
      return <em key={i} className="italic">{part.slice(1, -1)}</em>;
    }
    return <React.Fragment key={i}>{part}</React.Fragment>;
  });
}

function renderTextBlocks(text: string): React.ReactNode {
  const paragraphs = text.split(/\n\n+/);
  return paragraphs.map((para, pi) => {
    const lines = para.split("\n");

    if (lines.every((l) => /^\d+\.\s/.test(l.trim()))) {
      return (
        <ol key={pi} className="list-decimal list-inside space-y-1.5 my-2 text-[13px]">
          {lines.map((l, i) => (
            <li key={i}>{renderInline(l.replace(/^\d+\.\s/, ""))}</li>
          ))}
        </ol>
      );
    }

    if (lines.every((l) => /^[-•]\s/.test(l.trim()))) {
      return (
        <ul key={pi} className="space-y-1.5 my-2">
          {lines.map((l, i) => (
            <li key={i} className="flex gap-2 text-[13px]">
              <span className="text-muted-foreground flex-shrink-0 mt-0.5">·</span>
              <span>{renderInline(l.replace(/^[-•]\s/, ""))}</span>
            </li>
          ))}
        </ul>
      );
    }

    if (lines[0]?.startsWith("##")) {
      const headingText = lines[0].replace(/^#{2,3}\s/, "");
      return (
        <p key={pi} className="font-semibold text-[13px] mb-1 mt-2 text-foreground">
          {headingText}
        </p>
      );
    }

    return (
      <p key={pi} className={`text-[13px] leading-[1.7] ${pi < paragraphs.length - 1 ? "mb-3" : ""}`}>
        {lines.map((line, li) => (
          <React.Fragment key={li}>
            {li > 0 && <br />}
            {renderInline(line)}
          </React.Fragment>
        ))}
      </p>
    );
  });
}

// Splits out ``` fenced code blocks, rendering everything between them as
// regular text blocks. An unterminated fence (mid-stream) renders as a code
// block so streaming output stays stable.
function renderMarkdown(text: string): React.ReactNode {
  const blocks: React.ReactNode[] = [];
  const fence = /```\w*\n?([\s\S]*?)(?:```|$)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = fence.exec(text)) !== null) {
    if (match.index > last) {
      blocks.push(
        <React.Fragment key={`t-${last}`}>
          {renderTextBlocks(text.slice(last, match.index))}
        </React.Fragment>
      );
    }
    blocks.push(
      <pre
        key={`c-${match.index}`}
        className="my-2 rounded-lg surf-3 border hairline px-4 py-3 overflow-x-auto"
      >
        <code className="font-mono text-[12px] leading-[1.6] whitespace-pre">
          {match[1].replace(/\n$/, "")}
        </code>
      </pre>
    );
    last = fence.lastIndex;
  }
  if (last < text.length) {
    blocks.push(
      <React.Fragment key={`t-${last}`}>
        {renderTextBlocks(text.slice(last))}
      </React.Fragment>
    );
  }
  return blocks;
}

// ─── Memoized message bubble ──────────────────────────────────────────────────
// React.memo keeps completed messages from re-rendering while a new one
// streams; the rAF batching in send() caps parses of the streaming message at
// ~60/sec, which is cheap for chat-sized strings. Markdown renders live during
// streaming so the user never sees raw ** syntax.

const MessageBubble = React.memo(function MessageBubble({
  role,
  content,
}: {
  role: "user" | "assistant";
  content: string;
}) {
  const rendered = useMemo(
    () => (role === "assistant" ? renderMarkdown(content) : null),
    [role, content]
  );

  if (role === "user") {
    return (
      <div className="flex flex-col gap-1.5 items-end">
        <span className="text-[9px] font-bold uppercase tracking-[0.15em] text-muted-foreground">
          YOU
        </span>
        <div className="max-w-[85%] rounded-2xl rounded-br-md px-5 py-3.5 text-[13px] leading-[1.7] border hairline surf-2 text-foreground whitespace-pre-wrap">
          {content}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5 items-start">
      <span className="text-[9px] font-bold uppercase tracking-[0.15em] text-foreground/60">
        VANTAGE ADVISOR
      </span>
      <div className="max-w-[85%] glass rounded-2xl rounded-tl-md px-5 py-3.5 text-[13px] leading-[1.7] text-foreground">
        <div className="relative z-10">{rendered}</div>
      </div>
    </div>
  );
});

// ─── Main chat component ──────────────────────────────────────────────────────

function AdvisorChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [error, setError] = useState("");
  const [sessions, setSessions] = useState<SessionMeta[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [showSidebar, setShowSidebar] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [initComplete, setInitComplete] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showMemoryHint, setShowMemoryHint] = useState(false);
  const [sessionSearch, setSessionSearch] = useState("");

  // One-time, per-session note that the memory engine is always-on. Shown under
  // the input on the first interaction of a new session, then never again.
  useEffect(() => {
    if (!sessionStorage.getItem("advisor_memory_hint_seen")) {
      setShowMemoryHint(true);
    }
  }, []);

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Refs that always hold the latest values — safe to read inside async closures
  const messagesRef = useRef<Message[]>([]);
  const currentSessionIdRef = useRef<string | null>(null);
  messagesRef.current = messages;
  currentSessionIdRef.current = currentSessionId;

  // Scroll to bottom — instant during streaming (much cheaper), smooth otherwise.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({
      behavior: sending ? "instant" : "smooth",
      block: "end",
    });
  }, [messages, sending, thinking]);

  // Load sessions on mount — silent failure if table is not yet created
  useEffect(() => {
    const init = async () => {
      try {
        const res = await fetch("/api/advisor/sessions");
        if (!res.ok) {
          setInitComplete(true);
          return;
        }

        const data = (await res.json()) as SessionMeta[];
        setSessions(data);

        if (data.length > 0) {
          try {
            const sessionRes = await fetch(`/api/advisor/sessions/${data[0].id}`);
            if (sessionRes.ok) {
              const session = (await sessionRes.json()) as SessionFull;
              setMessages((session.messages ?? []) as Message[]);
              setCurrentSessionId(session.id);
            }
          } catch {}
        } else {
          try {
            const createRes = await fetch("/api/advisor/sessions", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ title: "New conversation" }),
            });
            if (createRes.ok) {
              const newSession = (await createRes.json()) as SessionMeta;
              setSessions([newSession]);
              setCurrentSessionId(newSession.id);
            }
          } catch {}
        }
      } catch {
        setCurrentSessionId(null);
      } finally {
        // CRITICAL: mark init complete so the prefill effect can safely fire
        // without racing the session-load setMessages call.
        setInitComplete(true);
      }
    };
    init();
  }, []);

  // Prefill from sessionStorage — waits for init to finish so the prefilled
  // user message isn't overwritten by the session-load setMessages.
  useEffect(() => {
    if (!initComplete) return;
    const prefill = sessionStorage.getItem("advisor_prefill");
    if (!prefill) return;
    try {
      const parsed = JSON.parse(prefill) as { message: string; source: string };
      sessionStorage.removeItem("advisor_prefill");
      // Start a fresh chat for the prefilled question so it doesn't pollute
      // the currently selected session.
      handleNewChat().then(() => {
        send(parsed.message);
      });
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initComplete]);

  // ── New Chat ────────────────────────────────────────────────────────────────

  const handleNewChat = useCallback(async () => {
    // Sync the refs immediately: callers may invoke send() right after this
    // resolves (e.g. the prefill effect), before React re-renders — send()
    // reads these refs, so leaving them stale would append the new message
    // to the previous session's history and persist it there.
    try {
      const res = await fetch("/api/advisor/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "New conversation" }),
      });
      if (!res.ok) {
        // If sessions aren't available, still clear to a fresh chat
        setMessages([]);
        setCurrentSessionId(null);
        messagesRef.current = [];
        currentSessionIdRef.current = null;
        setError("");
        setTimeout(() => inputRef.current?.focus(), 50);
        return;
      }
      const newSession = (await res.json()) as SessionMeta;
      setSessions((prev) => [newSession, ...prev]);
      setCurrentSessionId(newSession.id);
      setMessages([]);
      messagesRef.current = [];
      currentSessionIdRef.current = newSession.id;
      setError("");
      setTimeout(() => inputRef.current?.focus(), 50);
    } catch {
      setMessages([]);
      setCurrentSessionId(null);
      messagesRef.current = [];
      currentSessionIdRef.current = null;
      setError("");
    }
  }, []);

  // ── Select Session ──────────────────────────────────────────────────────────

  const handleSelectSession = useCallback(async (id: string) => {
    if (id === currentSessionIdRef.current) {
      setShowSidebar(false); // mobile: return to the chat pane
      return;
    }
    try {
      const res = await fetch(`/api/advisor/sessions/${id}`);
      if (!res.ok) return;
      const session = (await res.json()) as SessionFull;
      setMessages((session.messages ?? []) as Message[]);
      setCurrentSessionId(id);
      setError("");
      setShowSidebar(false); // mobile: return to the chat pane
    } catch {}
  }, []);

  // ── Send ────────────────────────────────────────────────────────────────────

  // Rename + delete session handlers

  const startRename = useCallback((session: SessionMeta, e: React.MouseEvent) => {
    e.stopPropagation();
    setRenamingId(session.id);
    setRenameDraft(session.title);
  }, []);

  const cancelRename = useCallback(() => {
    setRenamingId(null);
    setRenameDraft("");
  }, []);

  const commitRename = useCallback(async (id: string) => {
    const newTitle = renameDraft.trim();
    if (!newTitle) {
      cancelRename();
      return;
    }
    setSessions((prev) =>
      prev.map((s) => (s.id === id ? { ...s, title: newTitle } : s))
    );
    setRenamingId(null);
    setRenameDraft("");
    try {
      await fetch(`/api/advisor/sessions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newTitle }),
      });
    } catch {}
  }, [renameDraft, cancelRename]);

  const handleDelete = useCallback(async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (deletingId === id) {
      // Second click — confirm delete
      setDeletingId(null);
      setSessions((prev) => prev.filter((s) => s.id !== id));
      if (currentSessionIdRef.current === id) {
        setMessages([]);
        setCurrentSessionId(null);
      }
      try {
        await fetch(`/api/advisor/sessions/${id}`, { method: "DELETE" });
      } catch {}
      return;
    }
    // First click — arm confirmation, auto-disarm in 3s
    setDeletingId(id);
    setTimeout(() => {
      setDeletingId((prev) => (prev === id ? null : prev));
    }, 3000);
  }, [deletingId]);

  const send = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;

    // Read latest state via refs so stale closures (prefill) get current values
    const currentMessages = messagesRef.current;
    const isFirstMessage = currentMessages.length === 0;
    const userMsg: Message = { role: "user", content: trimmed };
    const next = [...currentMessages, userMsg];

    setMessages(next);
    setInput("");
    setSending(true);
    setThinking(true);
    setError("");

    // First interaction — retire the memory hint for the rest of the session.
    if (showMemoryHint) {
      setShowMemoryHint(false);
      sessionStorage.setItem("advisor_memory_hint_seen", "1");
    }

    // Ensure we have a session to save into — silently skip if unavailable
    let sid = currentSessionIdRef.current;
    if (!sid) {
      try {
        const res = await fetch("/api/advisor/sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: "New conversation" }),
        });
        if (res.ok) {
          const newSession = (await res.json()) as SessionMeta;
          sid = newSession.id;
          setCurrentSessionId(newSession.id);
          currentSessionIdRef.current = newSession.id;
          setSessions((prev) => [newSession, ...prev]);
        }
      } catch {}
    }

    let fullReply = "";
    let isFirstChunk = true;
    let pendingDelta = ""; // accumulate chunks between animation frames
    let rafId: number | null = null;

    // Flush accumulated text to React state at most once per animation frame (~60fps).
    // Without this, setMessages fires on every SSE chunk (can be 100+/sec),
    // creating a new array and triggering a full re-render each time.
    const flushPending = () => {
      rafId = null;
      if (!pendingDelta) return;
      const toFlush = pendingDelta;
      pendingDelta = "";
      if (isFirstChunk) {
        isFirstChunk = false;
        setThinking(false);
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: toFlush },
        ]);
      } else {
        setMessages((prev) => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last?.role === "assistant") {
            updated[updated.length - 1] = {
              ...last,
              content: last.content + toFlush,
            };
          }
          return updated;
        });
      }
    };

    try {
      const response = await fetch("/api/advisor/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next }),
      });

      if (!response.ok) {
        let errMsg = "Request failed";
        try {
          const data = (await response.json()) as { error?: string };
          errMsg = data.error ?? errMsg;
        } catch {}
        throw new Error(errMsg);
      }

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6).trim();
          if (data === "[DONE]") continue;

          let parsed: { delta?: string; error?: string };
          try {
            parsed = JSON.parse(data) as { delta?: string; error?: string };
          } catch {
            continue;
          }

          if (parsed.error) throw new Error(parsed.error);

          if (parsed.delta) {
            fullReply += parsed.delta;
            pendingDelta += parsed.delta;
            // Schedule a flush on the next animation frame if not already scheduled.
            // Multiple chunks arriving before the next frame get batched into one render.
            if (rafId === null) {
              rafId = requestAnimationFrame(flushPending);
            }
          }
        }
      }

      // Stream done — flush any remaining buffered text immediately
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      flushPending();

      // Persist the completed conversation — fire and forget, never block on failures
      if (sid && fullReply) {
        const finalMessages: Message[] = [
          ...next,
          { role: "assistant", content: fullReply },
        ];
        const patchBody: { messages: Message[]; title?: string } = {
          messages: finalMessages,
        };

        if (isFirstMessage) {
          const autoTitle = trimToWord(trimmed, 38);
          patchBody.title = autoTitle;
          const savedSid = sid;
          setSessions((prev) =>
            prev.map((s) =>
              s.id === savedSid ? { ...s, title: autoTitle } : s
            )
          );
        }

        fetch(`/api/advisor/sessions/${sid}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patchBody),
        }).catch(() => {});
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Something went wrong. Try again."
      );
    } finally {
      setSending(false);
      setThinking(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div
      className="flex bg-background text-foreground overflow-hidden"
      // 96px accounts for the shell's new topbar chrome above <main> (26px
      // canvas top padding + the topbar row + its 32px bottom margin) — the
      // old 72px was sized for a bottom tab bar that no longer exists. The
      // dashboard layout also skips its usual 126px bottom canvas padding on
      // this route (see (dashboard)/layout.tsx's isAdvisor check), since the
      // CommandBar is hidden here and nothing needs that space reserved.
      style={{ height: "calc(100dvh - 96px - env(safe-area-inset-bottom))" }}
    >

      {/* ── Sidebar ──────────────────────────────────────────────────────────── */}
      {/* Below md this is a full-width pane, toggled by `showSidebar` (mobile
          push-flow); at md+ it's the collapsible 380px rail, driven by
          `sidebarOpen` as before — the two states are independent so desktop
          behaviour is untouched. Always mounted so session state, scroll
          position, and the composer's draft text survive switching panes. */}
      <aside
        className={`flex flex-col flex-shrink-0 h-full overflow-hidden transition-all duration-200 border-r hairline glass ${
          showSidebar ? "w-full" : "w-0"
        } ${sidebarOpen ? "md:w-[380px]" : "md:w-0"}`}
      >
        {/* Accent line at top */}
        <div className="relative z-10 h-1 bg-gradient-to-r from-foreground/15 via-foreground/5 to-transparent flex-shrink-0" />

        <div className="relative z-10 flex flex-col flex-1 overflow-hidden">
        {/* Branding */}
        <div className="px-4 pt-4 pb-3">
          <p className="text-[10px] font-black tracking-[0.25em] text-foreground uppercase leading-none">
            VANTAGE
          </p>
          <p className="text-[9px] font-medium tracking-[0.2em] uppercase mt-0.5 text-muted-foreground">
            ADVISOR
          </p>
        </div>

        {/* Search field */}
        <div className="mx-3 mb-3">
          <div className="hairline surf-2 relative flex items-center rounded-lg border px-3 py-2">
            <Search size={13} className="text-muted-foreground flex-shrink-0" strokeWidth={1.8} />
            <input
              type="text"
              value={sessionSearch}
              onChange={(e) => setSessionSearch(e.target.value)}
              placeholder="Search chats..."
              className="bg-transparent border-none outline-none flex-1 ml-2 text-[12px] text-foreground placeholder:text-muted-foreground min-w-0"
            />
          </div>
        </div>

        {/* New Chat button */}
        <div className="mx-3 mb-4">
          <button
            onClick={() => { handleNewChat(); setShowSidebar(false); }}
            className="w-full surf-2 surf-hover border hairline rounded-lg py-2.5 text-xs font-bold text-foreground tracking-wider uppercase transition-all duration-150 flex items-center justify-center gap-2"
          >
            <Plus size={11} />
            New Chat
          </button>
        </div>

        {/* Divider + RECENT label */}
        <div className="mx-4 mb-3 border-t hairline" />
        <p className="text-[9px] font-semibold uppercase tracking-[0.2em] px-4 pb-2 text-muted-foreground">
          RECENT
        </p>

        {/* Sessions list */}
        <div className="flex-1 overflow-y-auto">
          {sessions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8">
              <MessageSquare size={16} className="text-muted-foreground" />
              <p className="text-[11px] mt-2 text-muted-foreground">No chats yet</p>
            </div>
          ) : sessions.filter((s) =>
              !sessionSearch.trim() || s.title.toLowerCase().includes(sessionSearch.trim().toLowerCase())
            ).length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8">
              <p className="text-[11px] text-muted-foreground">No chats match your search</p>
            </div>
          ) : (
            sessions
              .filter((s) =>
                !sessionSearch.trim() || s.title.toLowerCase().includes(sessionSearch.trim().toLowerCase())
              )
              .map((session) => {
              const isActive = session.id === currentSessionId;
              const isRenaming = renamingId === session.id;
              const isDeleteArmed = deletingId === session.id;
              return (
                <div
                  key={session.id}
                  className={`group relative border-l-2 transition-all duration-100 ${
                    isActive
                      ? "surf-3 hairline-strong border-l-foreground/30"
                      : "border-transparent surf-hover"
                  }`}
                >
                  {isRenaming ? (
                    <div className="flex items-center gap-1 px-3 py-2.5">
                      <input
                        autoFocus
                        value={renameDraft}
                        onChange={(e) => setRenameDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") commitRename(session.id);
                          else if (e.key === "Escape") cancelRename();
                        }}
                        onBlur={() => commitRename(session.id)}
                        className="flex-1 bg-transparent text-[12px] outline-none border-b hairline-strong text-foreground px-1 py-0.5"
                      />
                      <button
                        onClick={() => commitRename(session.id)}
                        className="p-1 text-muted-foreground hover:text-foreground transition-colors"
                        title="Save"
                      >
                        <Check size={11} />
                      </button>
                      <button
                        onClick={cancelRename}
                        className="p-1 text-muted-foreground hover:text-foreground transition-colors"
                        title="Cancel"
                      >
                        <X size={11} />
                      </button>
                    </div>
                  ) : (
                    <div
                      onClick={() => handleSelectSession(session.id)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          handleSelectSession(session.id);
                        }
                      }}
                      className="w-full px-3 py-2.5 text-left relative overflow-hidden cursor-pointer"
                    >
                      <span
                        className={`text-[12px] leading-snug truncate block mb-0.5 pr-12 ${
                          isActive ? "text-foreground font-medium" : "text-muted-foreground"
                        }`}
                      >
                        {session.title}
                      </span>
                      <span className="text-[10px] font-mono text-muted-foreground">
                        {formatSessionDate(session.updated_at)}
                      </span>

                      {/* Hover-revealed actions */}
                      <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={(e) => startRename(session, e)}
                          className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:surf-2 transition-colors"
                          title="Rename"
                          type="button"
                        >
                          <Pencil size={11} />
                        </button>
                        <button
                          onClick={(e) => handleDelete(session.id, e)}
                          className={`p-1.5 rounded transition-colors ${
                            isDeleteArmed
                              ? "text-[var(--brand-accent)] surf-2"
                              : "text-muted-foreground hover:text-foreground hover:surf-2"
                          }`}
                          title={isDeleteArmed ? "Click again to confirm" : "Delete"}
                          type="button"
                        >
                          <Trash2 size={11} />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Collapse button — desktop: collapses the rail. Mobile: this is the
            only "back to chat" control while the sessions pane is showing. */}
        <div className="border-t hairline py-2.5 px-3 flex items-center justify-center flex-shrink-0">
          <button
            onClick={() => { setSidebarOpen(false); setShowSidebar(false); }}
            className="w-full flex items-center justify-center gap-2 transition-colors py-1 hover:opacity-70 text-muted-foreground"
            style={{ minHeight: 44 }}
          >
            <PanelLeftClose size={13} />
            <span className="md:hidden text-[11px] font-bold uppercase tracking-wider">Back to chat</span>
          </button>
        </div>
        </div>
      </aside>

      {/* ── Chat Area ────────────────────────────────────────────────────────── */}
      {/* Below md: hidden while the sessions pane is showing (mobile
          push-flow). At md+: always visible, alongside the collapsible rail —
          matches the desktop behaviour from before this pass. */}
      <div className={`flex-1 flex-col h-full bg-background ${showSidebar ? "hidden md:flex" : "flex"}`}>

        {/* Header */}
        <div className="sticky top-0 z-20 border-b hairline glass flex-shrink-0">
          <div className="relative z-10">
          <div className="h-px bg-gradient-to-r from-foreground/20 via-transparent to-transparent" />
          <div className="px-6 py-4 flex items-center gap-3">
            <button
              onClick={() => { setSidebarOpen((s) => !s); setShowSidebar(true); }}
              className="flex-shrink-0 p-1.5 rounded surf-hover transition-colors text-muted-foreground"
              aria-label="Show conversations"
              style={{ minWidth: 44, minHeight: 44 }}
            >
              <span className="md:hidden"><PanelLeftOpen size={14} /></span>
              <span className="hidden md:inline-flex">
                {sidebarOpen ? <PanelLeftClose size={14} /> : <PanelLeftOpen size={14} />}
              </span>
            </button>
            <div>
              <p className="rule-label mb-0.5">
                Strategic Counsel
              </p>
              {/* display-hero is not used here — its clamp(2.75rem,7vw,5.5rem)
                  min size nearly doubled this persistent sticky header's
                  height in testing (80px → 165px), eating into the chat
                  scroll area on the tight mobile viewport budget. The
                  eyebrow still upgrades to rule-label; the title stays at
                  its original compact size. */}
              <h1 className="display-font text-[1.75rem] tracking-tight leading-none text-foreground">
                Advisor
              </h1>
              <p className="text-[11px] mt-1 text-muted-foreground">
                Ask anything about your signals, decisions, and strategy
              </p>
            </div>
          </div>
          </div>
        </div>

        {/* Messages + Input — flex-1/min-h-0 fills whatever the header leaves
            behind, so the composer pins to the bottom of THIS column instead
            of a calc(100vh - Npx) guess that ignored the mobile tab bar. */}
        <div className="flex flex-col flex-1 min-h-0">
          <div className="scroll-pane flex-1 px-6 py-8">

            {/* Empty state — suggested starters */}
            {messages.length === 0 && !sending && (
              <div className="max-w-2xl mx-auto">
                <p className="text-[9px] font-bold uppercase tracking-[0.2em] mb-5 text-muted-foreground">
                  START WITH A QUESTION
                </p>
                <div className="flex flex-col gap-2">
                  {STARTERS.map((s) => (
                    <button
                      key={s}
                      onClick={() => send(s)}
                      className="group flex items-center justify-between px-5 py-4 rounded-xl border hairline surf-2 surf-hover text-[13px] text-muted-foreground transition-all duration-150"
                    >
                      <span>{s}</span>
                      <span className="ml-auto pl-3 flex-shrink-0 text-muted-foreground group-hover:text-foreground">
                        →
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Message thread */}
            <div className="max-w-2xl mx-auto flex flex-col gap-5">
              {messages.map((msg, i) => (
                <MessageBubble key={i} role={msg.role} content={msg.content} />
              ))}

              {/* Thinking indicator */}
              {thinking && (
                <div className="flex flex-col gap-1.5 items-start">
                  <span className="text-[9px] font-bold uppercase tracking-[0.15em] text-foreground/60">
                    VANTAGE ADVISOR
                  </span>
                  <div className="glass rounded-2xl rounded-tl-md px-5 py-3.5">
                    <div className="relative z-10">
                      <ThinkingDots />
                    </div>
                  </div>
                </div>
              )}

              {error && (
                <p className="text-xs text-foreground border hairline-strong surf-2 rounded-xl px-4 py-2.5">
                  {error}
                </p>
              )}

              <div ref={bottomRef} />
            </div>
          </div>

          {/* Input bar */}
          <div className="border-t hairline glass px-6 py-4">
            <div className="relative z-10">
            <div className="max-w-2xl mx-auto flex items-end gap-3">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask your advisor anything..."
                rows={1}
                className="flex-1 resize-none rounded-xl px-5 py-3.5 text-[13px] outline-none focus:border-foreground/30 transition-colors leading-relaxed border hairline surf-2 text-foreground"
                style={{ maxHeight: "120px" }}
                onInput={(e) => {
                  const el = e.currentTarget;
                  el.style.height = "auto";
                  el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
                }}
              />
              {/* The one primary CTA on this screen (§2, §6) */}
              <button
                onClick={() => send(input)}
                disabled={!input.trim() || sending}
                className="btn-primary flex-shrink-0 flex items-center justify-center w-11 h-11 rounded-xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {sending ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Send size={16} />
                )}
              </button>
            </div>
            <p className="max-w-2xl mx-auto mt-2 text-[10px] text-muted-foreground">
              {showMemoryHint
                ? "VANTAGE remembers your business context — no setup needed."
                : "Press Enter to send · Shift+Enter for new line"}
            </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Page shell ───────────────────────────────────────────────────────────────

export default function AdvisorPage() {
  return <AdvisorChat />;
}

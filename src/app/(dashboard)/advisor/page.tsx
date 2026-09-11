"use client";

import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { ArrowUpRight, Loader2, Plus, MessageSquare, ChevronRight, Search } from "lucide-react";

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


/*
 * The advisor can propose one profile update per reply, as a marker on the
 * final line. It is machine-read and must never reach the screen — including
 * mid-stream, when only half of it has arrived, so the pattern also matches a
 * partial marker and hides it until it is complete or abandoned.
 */
const MEMORY_MARKER = /\[\[VANTAGE_MEMORY\]\]\s*(\{[\s\S]*?\})\s*$/;
const PARTIAL_MARKER = /\[?\[?V?A?N?T?A?G?E?_?M?E?M?O?R?Y?\]?\]?\s*\{?[^}]*$/;

export interface MemorySuggestion {
  field: string;
  value: string;
  label: string;
}

const MEMORY_FIELDS = new Set([
  "competitors",
  "top_priority",
  "product_description",
  "target_customer",
  "arr_band",
]);

/** Split an assistant reply into what to show and what to offer saving. */
function splitMemory(content: string): { visible: string; memory: MemorySuggestion | null } {
  const full = content.match(MEMORY_MARKER);
  if (full) {
    const visible = content.slice(0, full.index).trimEnd();
    try {
      const parsed = JSON.parse(full[1]) as Partial<MemorySuggestion>;
      if (
        parsed.field &&
        MEMORY_FIELDS.has(parsed.field) &&
        typeof parsed.value === "string" &&
        parsed.value.trim()
      ) {
        return {
          visible,
          memory: {
            field: parsed.field,
            value: parsed.value.trim(),
            label: (parsed.label ?? parsed.value).toString().trim(),
          },
        };
      }
    } catch {
      /* malformed marker — drop it, never render it */
    }
    return { visible, memory: null };
  }
  // Mid-stream: hide anything that looks like the start of a marker.
  const idx = content.lastIndexOf("[[");
  if (idx !== -1 && PARTIAL_MARKER.test(content.slice(idx))) {
    return { visible: content.slice(0, idx).trimEnd(), memory: null };
  }
  return { visible: content, memory: null };
}

const FIELD_LABEL: Record<string, string> = {
  competitors: "Competitors",
  top_priority: "#1 priority",
  product_description: "What you build",
  target_customer: "Target customer",
  arr_band: "ARR band",
};

const MessageBubble = React.memo(function MessageBubble({
  role,
  content,
}: {
  role: "user" | "assistant";
  content: string;
}) {
  const rendered = useMemo(
    () => (role === "assistant" ? renderMarkdown(splitMemory(content).visible) : null),
    [role, content]
  );

  if (role === "user") {
    return <div className="vx-user-message">{content}</div>;
  }

  return (
    <div className="vx-advisor-answer">
      <span>VANTAGE ADVISOR</span>
      {rendered}
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
  const [initComplete, setInitComplete] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showMemoryHint, setShowMemoryHint] = useState(false);
  // One pending profile suggestion from the latest reply. Never auto-applied.
  const [memory, setMemory] = useState<MemorySuggestion | null>(null);
  const [memorySaving, setMemorySaving] = useState(false);
  const [memorySaved, setMemorySaved] = useState<string | null>(null);
  const [memoryError, setMemoryError] = useState("");
  const [sessionSearch, setSessionSearch] = useState("");

  // One-time, per-session note that the memory engine is always-on. Shown under
  // the input on the first interaction of a new session, then never again.
  useEffect(() => {
    if (!sessionStorage.getItem("advisor_memory_hint_seen")) {
      setShowMemoryHint(true);
    }
  }, []);

  const bottomRef = useRef<HTMLDivElement>(null);
  const threadRef = useRef<HTMLElement>(null);
  // Follow the stream only while the reader is parked at the bottom. The
  // moment they scroll up mid-answer we stop yanking them back, and resume
  // as soon as they return to the end.
  const stickToBottom = useRef(true);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Refs that always hold the latest values — safe to read inside async closures
  const messagesRef = useRef<Message[]>([]);
  const currentSessionIdRef = useRef<string | null>(null);
  messagesRef.current = messages;
  currentSessionIdRef.current = currentSessionId;

  /*
   * Follow-the-stream, and why the first attempt at this did not work.
   *
   * The old version inferred "has the reader scrolled away?" purely from
   * scroll position, inside the onScroll handler. That cannot work while a
   * response is streaming, because our OWN scrollTo fires scroll events too,
   * and the stream flushes on every animation frame — so roughly 60 times a
   * second we scrolled to the bottom, the browser queued a scroll event for
   * it, and that event re-measured the position as "at the bottom" and
   * re-armed the lock. Scroll events are dispatched asynchronously, so
   * whichever of the user's scroll and ours was processed last won. In
   * practice ours did, and the reader was dragged back mid-answer.
   *
   * Two changes make it hold:
   *   1. Programmatic scrolls are marked, and the scroll events they cause
   *      are ignored — only genuine user scrolling moves the lock.
   *   2. A wheel/touch gesture upward releases the lock immediately, without
   *      waiting for a scroll event to be measured at all.
   *
   * Re-engagement is unchanged: scroll back to within 80px of the end and
   * following resumes.
   */
  const AT_BOTTOM_PX = 80;

  /*
   * The auto-follow records exactly where it put the scroll position. Any
   * scroll event that lands somewhere else came from the reader.
   *
   * A time-based guard does not work here, which is what the first attempt
   * got wrong: the stream flushes on every animation frame, so a "we are
   * scrolling programmatically" flag is re-armed ~60 times a second and is
   * true for most of the wall clock. The reader's scroll events land inside
   * that window and get ignored, so the lock never releases. Comparing
   * against the last position we set has no timing component at all.
   */
  const lastAutoTop = useRef(-1);

  const isAtBottom = (el: HTMLElement) =>
    el.scrollHeight - el.scrollTop - el.clientHeight < AT_BOTTOM_PX;

  const handleThreadScroll = useCallback(() => {
    const el = threadRef.current;
    if (!el) return;
    // Within a pixel or two of where we last parked it: that was us.
    if (Math.abs(el.scrollTop - lastAutoTop.current) <= 2) return;
    stickToBottom.current = isAtBottom(el);
  }, []);

  // Gesture handlers release on intent, before any position is measured.
  // Belt and braces — the check above is what actually carries this.
  const handleThreadWheel = useCallback((e: React.WheelEvent) => {
    if (e.deltaY < 0) stickToBottom.current = false;
  }, []);

  const touchY = useRef(0);
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchY.current = e.touches[0]?.clientY ?? 0;
  }, []);
  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    const y = e.touches[0]?.clientY ?? 0;
    if (y > touchY.current + 2) stickToBottom.current = false;
    touchY.current = y;
  }, []);

  useEffect(() => {
    if (!stickToBottom.current) return;
    const el = threadRef.current;
    if (!el) return;

    // Instant, not smooth: a smooth animation keeps emitting scroll events
    // long after the call returns, and each one would read as a user scroll.
    el.scrollTop = el.scrollHeight;
    // Read back rather than reusing scrollHeight — the browser clamps it.
    lastAutoTop.current = el.scrollTop;
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

  /*
   * Hand-off from a signal, strategy, blind spot or the command bar.
   *
   * Contract: the caller leaves a message behind, we open a FRESH thread and
   * send it. A fresh thread on purpose — the seeded question would otherwise
   * be appended to whatever session happened to load last, which reads as the
   * advisor replying to the wrong conversation.
   *
   * Two accepted forms. sessionStorage is what four of the five callers use.
   * `?q=` is honoured too because signals used to send that and nothing read
   * it — accepting both here means a caller can never silently drop context
   * again by picking the wrong one. Both funnel through one code path.
   *
   * Waits for initComplete so the seeded message is not overwritten by the
   * session-load setMessages, and consumes the source before doing any async
   * work so a re-render (or React's double-invoke in dev) cannot send twice.
   */
  useEffect(() => {
    if (!initComplete) return;

    let message: string | null = null;

    const stored = sessionStorage.getItem("advisor_prefill");
    if (stored) {
      sessionStorage.removeItem("advisor_prefill");
      try {
        message = (JSON.parse(stored) as { message?: string }).message ?? null;
      } catch {
        message = null;
      }
    }

    if (!message) {
      // Read the URL directly rather than useSearchParams: this is a
      // client-only effect and it avoids dragging in a Suspense boundary.
      const q = new URLSearchParams(window.location.search).get("q");
      if (q) {
        message = q;
        // Drop it from the URL so a refresh does not re-send the question.
        window.history.replaceState(null, "", window.location.pathname);
      }
    }

    if (!message) return;

    const seeded = message;
    stickToBottom.current = true;
    handleNewChat().then(() => send(seeded));
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
    stickToBottom.current = true;
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
    // A suggestion belongs to the reply that produced it.
    setMemory(null);
    setMemorySaved(null);
    setMemoryError("");

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

      // Marker only after the stream is complete — a partially-arrived one is
      // not valid JSON, and splitMemory hides it from the screen until then.
      const proposed = splitMemory(fullReply).memory;
      if (proposed) setMemory(proposed);

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

  // Anything the user sends is theirs to watch — re-anchor on send.
  const saveMemory = async () => {
    if (!memory || memorySaving) return;
    setMemorySaving(true);
    setMemoryError("");
    try {
      const res = await fetch("/api/advisor/memory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ field: memory.field, value: memory.value }),
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? "Could not save");
      setMemorySaved(memory.label);
      setMemory(null);
    } catch (err) {
      setMemoryError(err instanceof Error ? err.message : "Could not save");
    } finally {
      setMemorySaving(false);
    }
  };

  const sendAnchored = (text: string) => {
    stickToBottom.current = true;
    send(text);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendAnchored(input);
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  // Structure lifted from the design package's advisor.tsx. What changed is
  // only markup: the old 380px collapsible rail is now the vx-history-popover
  // that drops under the heading, and the sticky header is now vx-page-heading.
  // Every handler, fetch, stream and piece of state below is untouched.

  const currentSession = sessions.find((x) => x.id === currentSessionId) ?? null;
  // Drives the collapsed heading. `sending` is included so the switch happens
  // the instant a question is sent, not after the first token lands.
  const hasMessages = messages.length > 0 || sending;
  const visibleSessions = sessions.filter(
    (x) =>
      !sessionSearch.trim() ||
      x.title.toLowerCase().includes(sessionSearch.trim().toLowerCase())
  );

  return (
    <div className="vx-advisor-page">
      {/*
        * The heading is a welcome mat, not a permanent fixture. At full size
        * it costs ~120px of a laptop viewport, which is real reading area
        * once there is a conversation to read. Full size while the thread is
        * empty (it is the only thing on screen then); collapsed to a single
        * small line the moment there are messages.
        */}
      <div className={"vx-page-heading" + (hasMessages ? " vx-advisor-heading-compact" : "")}>
        <div>
          <h1>Advisor</h1>
          {!hasMessages && <p>Work through the decision. Keep the context.</p>}
        </div>
        <div className="vx-advisor-tools">
          <button
            className="vx-btn"
            type="button"
            aria-expanded={showSidebar}
            onClick={() => setShowSidebar((v) => !v)}
          >
            <MessageSquare size={15} />History
          </button>
          <button
            className="vx-btn"
            type="button"
            onClick={() => {
              handleNewChat();
              setShowSidebar(false);
            }}
          >
            <Plus size={15} />New chat
          </button>
        </div>
      </div>

      {showSidebar && (
        <section className="vx-history-popover" aria-label="Conversation history">
          <label className="vx-search">
            <Search size={16} />
            <input
              aria-label="Search conversations"
              placeholder="Search conversations…"
              value={sessionSearch}
              onChange={(e) => setSessionSearch(e.target.value)}
            />
          </label>
          {visibleSessions.map((session) => (
            <button
              className="vx-history-item"
              key={session.id}
              type="button"
              onClick={() => {
                handleSelectSession(session.id);
                setShowSidebar(false);
              }}
            >
              <span>
                {session.title}
                <small>{formatSessionDate(session.updated_at)}</small>
              </span>
              <ChevronRight size={15} />
            </button>
          ))}
          {!visibleSessions.length && (
            <p className="vx-quiet-note">
              {sessions.length
                ? "No conversations match your search."
                : "No conversations yet."}
            </p>
          )}
        </section>
      )}

      {currentSession && renamingId !== currentSession.id && (
        <div className="vx-chat-title">
          <span>{currentSession.title}</span>
          <details>
            <summary aria-label="Conversation actions">•••</summary>
            <button
              type="button"
              onClick={(e) => startRename(currentSession, e)}
            >
              Rename
            </button>
            <button
              type="button"
              onClick={(e) => handleDelete(currentSession.id, e)}
            >
              {deletingId === currentSession.id ? "Click again to confirm" : "Delete"}
            </button>
          </details>
        </div>
      )}

      {currentSession && renamingId === currentSession.id && (
        <form
          className="vx-rename"
          onSubmit={(e) => {
            e.preventDefault();
            commitRename(currentSession.id);
          }}
        >
          <input
            autoFocus
            aria-label="Conversation name"
            value={renameDraft}
            onChange={(e) => setRenameDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") cancelRename();
            }}
            required
            maxLength={100}
          />
          <button className="vx-btn" type="submit">Save</button>
          <button className="vx-text-btn" type="button" onClick={cancelRename}>
            Cancel
          </button>
        </form>
      )}

      <section
        className="vx-advisor-thread"
        aria-label="Conversation"
        ref={threadRef}
        onScroll={handleThreadScroll}
        onWheel={handleThreadWheel}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
      >
        {!messages.length && !sending ? (
          <div className="vx-advisor-welcome">
            <div className="vx-advisor-mark">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo-transparent.png" alt="" />
            </div>
            <h2>What are you weighing?</h2>
            <p>
              Bring a decision, a changing signal, or an assumption you want
              challenged. Your business context is already attached.
            </p>
            <div className="vx-prompt-options">
              {STARTERS.map((starter) => (
                <button key={starter} type="button" onClick={() => sendAnchored(starter)}>
                  {starter}
                  <ArrowUpRight size={13} />
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((msg, i) => (
            <MessageBubble key={i} role={msg.role} content={msg.content} />
          ))
        )}

        {thinking && (
          <div className="vx-advisor-answer">
            <span>VANTAGE ADVISOR</span>
            <ThinkingDots />
          </div>
        )}

        {error && <p className="vx-quiet-note">{error}</p>}

        {/*
          * Proposal, not an action. The field it would change is named on the
          * chip so nothing is saved that the reader has not actually read.
          */}
        {memory && !sending && (
          <div className="vx-memory-offer" role="status">
            <div className="vx-memory-offer-text">
              <span className="vx-section-label">REMEMBER THIS?</span>
              <p>{memory.label}</p>
              <small>
                Updates <strong>{FIELD_LABEL[memory.field] ?? memory.field}</strong> in your profile
                {memory.field === "competitors" ? " (added to the list)" : ""} — future
                conversations will know.
              </small>
              {memoryError && <small className="vx-red">{memoryError}</small>}
            </div>
            <div className="vx-memory-offer-actions">
              <button className="vx-btn vx-primary" onClick={saveMemory} disabled={memorySaving}>
                {memorySaving ? "Saving…" : "Save to profile"}
              </button>
              <button className="vx-text-btn" onClick={() => setMemory(null)} disabled={memorySaving}>
                Not now
              </button>
            </div>
          </div>
        )}

        {memorySaved && (
          <p className="vx-quiet-note" role="status">
            Saved to your profile — {memorySaved}.
          </p>
        )}

        <div ref={bottomRef} />
      </section>

      <form
        className="vx-composer vx-advisor-composer"
        onSubmit={(e) => {
          e.preventDefault();
          sendAnchored(input);
        }}
      >
        <textarea
          ref={inputRef}
          aria-label="Message Advisor"
          placeholder="Ask your advisor…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <div>
          <small>
            {showMemoryHint
              ? "VANTAGE remembers your business context — no setup needed."
              : "Enter to send · Shift + Enter for a new line"}
          </small>
          <button
            className="vx-btn vx-primary"
            type="submit"
            aria-label="Send message"
            disabled={!input.trim() || sending}
          >
            {sending ? <Loader2 size={18} className="vx-refreshing" /> : <ArrowUpRight size={18} />}
          </button>
        </div>
      </form>
    </div>
  );
}

// ─── Page shell ───────────────────────────────────────────────────────────────

export default function AdvisorPage() {
  return <AdvisorChat />;
}

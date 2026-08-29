"use client";

import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Plus, Mic, ArrowUpRight } from "lucide-react";

// Concept `.command-bar` — fixed, bottom-center, ask-Vantage input.
// Wired to the SAME sessionStorage handoff SignalCard's "Discuss with
// Advisor" button already uses: stash the message, navigate to /advisor,
// which reads it on mount, starts a fresh chat, and sends it — no new API,
// no touch to Advisor's own streaming logic.
export function CommandBar() {
  const router = useRouter();
  const pathname = usePathname();
  const [value, setValue] = useState("");

  // Advisor already IS the full-page version of this exact "ask Vantage"
  // experience, with its own composer — a second input here would just
  // duplicate it and confuse which one is "live".
  if (pathname?.startsWith("/advisor")) return null;

  const handleSend = () => {
    const trimmed = value.trim();
    if (!trimmed) return;
    sessionStorage.setItem(
      "advisor_prefill",
      JSON.stringify({ message: trimmed, source: "command-bar" })
    );
    router.push("/advisor");
    setValue("");
  };

  return (
    <div
      className="cx-command-bar fixed bottom-[23px] left-1/2 z-[5] flex w-[min(690px,calc(100vw-40px))] -translate-x-1/2 items-center gap-[7px] rounded-[23px] p-[7px] max-[560px]:bottom-[15px] max-[560px]:w-[calc(100vw-26px)] max-[560px]:rounded-[19px]"
    >
      {/* Neither this nor voice input has a real implementation in the
          concept either (its own JS only wires the ask input + send) —
          disabled with an explanation rather than a fake control. */}
      <button
        type="button"
        disabled
        title="Add context — not available yet"
        aria-label="Add context — not available yet"
        className="cx-bar-btn flex h-[42px] w-[42px] flex-shrink-0 cursor-not-allowed items-center justify-center opacity-40 max-[560px]:h-[38px] max-[560px]:w-[38px] max-[560px]:rounded-[13px]"
      >
        <Plus size={19} />
      </button>
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") handleSend();
        }}
        placeholder="Ask Vantage about a decision…"
        className="cx-ask flex-1 px-[10px] py-[13px] text-[13px] max-[560px]:text-[12px]"
      />
      <button
        type="button"
        disabled
        title="Voice input — not available yet"
        aria-label="Voice input — not available yet"
        className="cx-bar-btn flex h-[42px] w-[42px] flex-shrink-0 cursor-not-allowed items-center justify-center opacity-40 max-[560px]:h-[38px] max-[560px]:w-[38px] max-[560px]:rounded-[13px]"
      >
        <Mic size={17} />
      </button>
      <button
        type="button"
        onClick={handleSend}
        title="Send"
        aria-label="Send to Advisor"
        className="cx-bar-btn cx-send flex h-[42px] w-[42px] flex-shrink-0 items-center justify-center max-[560px]:h-[38px] max-[560px]:w-[38px] max-[560px]:rounded-[13px]"
      >
        <ArrowUpRight size={18} />
      </button>
    </div>
  );
}

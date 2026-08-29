"use client";

import { useState } from "react";
import { MessageCircle, X, Star } from "lucide-react";
import { usePathname } from "next/navigation";

const CATEGORIES = [
  { value: "signal_quality",    label: "Signal Quality" },
  { value: "strategy_quality",  label: "Strategy Quality" },
  { value: "ui_ux",             label: "UI & Design" },
  { value: "feature_request",   label: "Feature Request" },
  { value: "general",           label: "General" },
];

export function FeedbackWidget() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [category, setCategory] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const reset = () => {
    setRating(0);
    setHoverRating(0);
    setCategory("");
    setMessage("");
    setError("");
    setSuccess(false);
  };

  const handleOpen = () => {
    reset();
    setOpen(true);
  };

  const handleClose = () => {
    setOpen(false);
    reset();
  };

  const handleSubmit = async () => {
    if (!message.trim()) {
      setError("Please write a message.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rating: rating > 0 ? rating : undefined,
          category: category || undefined,
          message: message.trim(),
          page: pathname,
        }),
      });
      if (!res.ok) {
        const data = await res.json() as { error?: string };
        throw new Error(data.error ?? "Submission failed");
      }
      setSuccess(true);
      setTimeout(() => handleClose(), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      {/* Floating button — the nav is no longer a bottom bar (it moved to a
          horizontal row at the top on mobile, and a grid column on desktop),
          but there's now a fixed CommandBar centered at the true bottom of
          every screen (~79px tall from the viewport edge, all breakpoints).
          This offset clears it instead of the old nav bar. */}
      <button
        onClick={handleOpen}
        className="fixed right-4 md:right-6 z-50 flex items-center gap-2 rounded-full bg-[#CC1F1F] px-4 py-2.5 text-xs font-semibold text-white shadow-lg hover:bg-[#b01818] transition-colors"
        style={{ bottom: "calc(95px + env(safe-area-inset-bottom))" }}
      >
        <MessageCircle size={14} />
        Feedback
      </button>

      {/* Modal — width capped to the viewport so it doesn't force horizontal
          scroll under 360px, and bottom offset follows the button above. */}
      {open && (
        <div
          className="fixed right-4 md:right-6 z-50 w-[360px] max-w-[calc(100vw-2rem)] rounded-xl border border-[#242424] bg-[#111111] shadow-2xl"
          style={{ bottom: "calc(150px + env(safe-area-inset-bottom))" }}
        >
          {/* Header */}
          <div className="flex items-start justify-between px-5 pt-5 pb-4 border-b border-[#1a1a1a]">
            <div>
              <p className="text-sm font-semibold text-[#f5f5f5]">Share your feedback</p>
              <p className="text-xs text-[#555555] mt-0.5">Help us make VANTAGE better</p>
            </div>
            <button
              onClick={handleClose}
              className="text-[#444444] hover:text-[#888888] transition-colors"
            >
              <X size={16} />
            </button>
          </div>

          {success ? (
            <div className="px-5 py-8 text-center">
              <p className="text-sm font-semibold text-[#34d399]">Thank you —</p>
              <p className="text-xs text-[#666666] mt-1">your feedback shapes VANTAGE</p>
            </div>
          ) : (
            <div className="px-5 py-4 flex flex-col gap-4">
              {/* Star rating */}
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[#555555] mb-2">
                  Rating
                </p>
                <div className="flex items-center gap-1">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      onClick={() => setRating(star)}
                      onMouseEnter={() => setHoverRating(star)}
                      onMouseLeave={() => setHoverRating(0)}
                      className="transition-colors"
                    >
                      <Star
                        size={20}
                        className={
                          star <= (hoverRating || rating)
                            ? "fill-[#f59e0b] text-[#f59e0b]"
                            : "text-[#2a2a2a]"
                        }
                      />
                    </button>
                  ))}
                </div>
              </div>

              {/* Category */}
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[#555555] mb-2">
                  Category
                </p>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full rounded-md border border-[#242424] bg-[#0d0d0d] px-3 py-2 text-sm text-[#a0a0a0] outline-none focus:border-[#CC1F1F]/40 transition-colors"
                >
                  <option value="">Select a category...</option>
                  {CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Message */}
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[#555555] mb-2">
                  Message
                </p>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="What's working? What's not? What do you need?"
                  rows={4}
                  maxLength={1000}
                  className="w-full resize-none rounded-md border border-[#242424] bg-[#0d0d0d] px-3 py-2 text-sm text-[#f5f5f5] placeholder-[#444444] outline-none focus:border-[#CC1F1F]/40 transition-colors"
                />
                <p className="text-[9px] text-[#333333] text-right mt-0.5">
                  {message.length}/1000
                </p>
              </div>

              {error && (
                <p className="text-xs text-[#e5463e] bg-[#e5463e]/8 border border-[#e5463e]/20 rounded px-3 py-2">
                  {error}
                </p>
              )}

              <button
                onClick={handleSubmit}
                disabled={submitting || !message.trim()}
                className="w-full py-2.5 rounded-lg bg-[#CC1F1F] text-sm font-semibold text-white hover:bg-[#b01818] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {submitting ? "Sending..." : "Send Feedback"}
              </button>
            </div>
          )}
        </div>
      )}
    </>
  );
}

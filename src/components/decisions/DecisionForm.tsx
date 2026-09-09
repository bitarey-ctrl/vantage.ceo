"use client";

import React, { useState } from "react";
import { X, Plus, Check, Loader2 } from "lucide-react";
import { ShellPortal } from "@/components/ui/ShellPortal";
import type { Decision, DecisionConfidence } from "@/types/database";

const CONFIDENCE_OPTIONS: { value: DecisionConfidence; label: string }[] = [
  { value: "confident", label: "Pretty sure, just want a sanity check" },
  { value: "torn", label: "Genuinely torn" },
  { value: "exploring", label: "Just exploring the idea" },
];

const LABEL =
  "block text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground mb-1.5";
const FIELD =
  "hairline surf-1 w-full rounded-xl border px-3 py-2.5 text-[14px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:hairline-strong";

export interface DecisionFormInitial {
  title?: string;
  description?: string | null;
  rationale?: string | null;
  confidence?: DecisionConfidence;
  deadline?: string | null;
  knownContext?: string | null;
  openQuestions?: string | null;
}

// Converts an ISO timestamp to yyyy-mm-dd for <input type="date">.
function toDateInput(deadline: string | null | undefined): string {
  if (!deadline) return "";
  return new Date(deadline).toISOString().slice(0, 10);
}

export default function DecisionForm({
  mode,
  decisionId,
  initial,
  onClose,
  onSaved,
}: {
  mode: "create" | "edit";
  decisionId?: string;
  initial?: DecisionFormInitial;
  onClose: () => void;
  onSaved: (decision: Decision) => void;
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [rationale, setRationale] = useState(initial?.rationale ?? "");
  const [confidence, setConfidence] = useState<DecisionConfidence | "">(
    initial?.confidence ?? ""
  );
  const [deadline, setDeadline] = useState(toDateInput(initial?.deadline));
  const [knownContext, setKnownContext] = useState(initial?.knownContext ?? "");
  const [openQuestions, setOpenQuestions] = useState(initial?.openQuestions ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const titleValid = title.trim().length > 0 && title.trim().length <= 120;
  const descriptionValid = description.trim().length >= 30;
  const rationaleValid = rationale.trim().length >= 20;
  const valid = titleValid && descriptionValid && rationaleValid && confidence !== "";

  const submit = async () => {
    if (!valid || saving) return;
    setSaving(true);
    setError("");

    const payload = {
      title: title.trim(),
      description: description.trim(),
      rationale: rationale.trim(),
      confidence,
      knownContext: knownContext.trim() || null,
      openQuestions: openQuestions.trim() || null,
      deadline: deadline ? new Date(deadline).toISOString() : null,
      ...(mode === "create" ? { source: "manual" } : {}),
    };

    try {
      const res = await fetch(
        mode === "create" ? "/api/decisions" : `/api/decisions/${decisionId}`,
        {
          method: mode === "create" ? "POST" : "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      if (!res.ok) {
        const b = (await res.json().catch(() => ({}))) as {
          error?: string;
          code?: string | null;
          details?: string | null;
          hint?: string | null;
        };
        // Put the whole thing in the console. The reported symptom was a bare
        // "Failed to create decision" with nothing anywhere to diagnose from;
        // whatever the server knows should be one keystroke away.
        console.error("[DecisionForm] save failed", {
          status: res.status,
          ...b,
          sent: {
            title_len: payload.title.length,
            description_len: payload.description.length,
            rationale_len: payload.rationale.length,
            confidence: payload.confidence,
            has_deadline: Boolean(payload.deadline),
          },
        });
        const parts = [b.error ?? "Failed to save decision"];
        if (b.code) parts.push(`(${b.code})`);
        throw new Error(parts.join(" "));
      }
      const saved = (await res.json()) as Decision;
      onSaved(saved);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to save decision";
      // Covers the cases the response branch cannot see: a dropped
      // connection, or a serverless function killed before it replies.
      console.error("[DecisionForm] save threw", err);
      setError(message);
      setSaving(false);
    }
  };

  return (
    <ShellPortal>
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 py-8">
      <div className="w-full max-w-lg max-h-full overflow-y-auto rounded-2xl border border-white/10 bg-popover shadow-2xl">
        <div className="p-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="display-font text-[1.25rem] tracking-tight text-foreground">
              {mode === "create" ? "New Decision" : "Add more context"}
            </h2>
            <button
              onClick={onClose}
              className="text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Close"
            >
              <X size={18} />
            </button>
          </div>

          {/* Title */}
          <label className={LABEL}>Decision title</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={120}
            placeholder="e.g. Raise prices on Pro tier from $99 to $149"
            className={`${FIELD} mb-1`}
          />
          <p className="text-[10px] text-muted-foreground/60 mb-4 text-right">
            {title.trim().length}/120
          </p>

          {/* Description */}
          <label className={LABEL}>What you&apos;re actually deciding</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            placeholder="The full description with context — the options on the table, what's at stake…"
            className={`${FIELD} resize-none mb-1`}
          />
          <p
            className={`text-[10px] mb-4 text-right ${
              descriptionValid ? "text-muted-foreground/60" : "text-[var(--urgency-decide)]/80"
            }`}
          >
            {description.trim().length} chars (min 30)
          </p>

          {/* Rationale */}
          <label className={LABEL}>Why you&apos;re considering this</label>
          <textarea
            value={rationale}
            onChange={(e) => setRationale(e.target.value)}
            rows={3}
            placeholder="The rationale — what's pushing you toward it…"
            className={`${FIELD} resize-none mb-1`}
          />
          <p
            className={`text-[10px] mb-4 text-right ${
              rationaleValid ? "text-muted-foreground/60" : "text-[var(--urgency-decide)]/80"
            }`}
          >
            {rationale.trim().length} chars (min 20)
          </p>

          {/* Confidence */}
          <label className={LABEL}>Confidence level</label>
          <div className="flex flex-col gap-2 mb-4">
            {CONFIDENCE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setConfidence(opt.value)}
                className={`hairline flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left text-[13px] transition-all ${
                  confidence === opt.value
                    ? "surf-3 hairline-strong text-foreground"
                    : "surf-1 text-muted-foreground hover:text-foreground"
                }`}
              >
                <span
                  className={`flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center rounded-full border ${
                    confidence === opt.value
                      ? "border-foreground"
                      : "border-muted-foreground/50"
                  }`}
                >
                  {confidence === opt.value && (
                    <span className="h-1.5 w-1.5 rounded-full bg-foreground" />
                  )}
                </span>
                {opt.label}
              </button>
            ))}
          </div>

          {/* Deadline */}
          <label className={LABEL}>
            Deadline <span className="text-muted-foreground/60">(optional)</span>
          </label>
          <input
            type="date"
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
            className={`${FIELD} mb-4`}
          />

          {/* Known context */}
          <label className={LABEL}>
            What you already know about this{" "}
            <span className="text-muted-foreground/60">(optional)</span>
          </label>
          <textarea
            value={knownContext}
            onChange={(e) => setKnownContext(e.target.value)}
            rows={3}
            placeholder="Facts, data, prior experience that's already informing the call…"
            className={`${FIELD} resize-none mb-4`}
          />

          {/* Open questions */}
          <label className={LABEL}>
            What you&apos;re unsure about{" "}
            <span className="text-muted-foreground/60">(optional)</span>
          </label>
          <textarea
            value={openQuestions}
            onChange={(e) => setOpenQuestions(e.target.value)}
            rows={3}
            placeholder="The specific question marks that are making this hard…"
            className={`${FIELD} resize-none mb-5`}
          />

          {error && (
            <p className="hairline surf-2 text-[12px] text-foreground mb-4 border rounded-xl px-3 py-2">
              {error}
            </p>
          )}

          <div className="flex items-center justify-end gap-2">
            <button
              onClick={onClose}
              className="hairline surf-hover px-4 py-2 rounded-xl border text-[11px] font-bold text-muted-foreground hover:text-foreground uppercase tracking-wider transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={submit}
              disabled={!valid || saving}
              className="hairline-strong surf-3 inset-sheen surf-hover flex items-center gap-2 px-5 py-2 rounded-xl border text-[11px] font-bold text-foreground uppercase tracking-wider transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? (
                <Loader2 size={12} className="animate-spin" />
              ) : mode === "create" ? (
                <Plus size={12} />
              ) : (
                <Check size={12} />
              )}
              {mode === "create" ? "Create" : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
    </ShellPortal>
  );
}

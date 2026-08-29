'use client';

import React, { useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import type {
  DecisionCategory,
  UrgencyLevel,
  AlternativeConsidered,
} from '@/types/database';

/** Camelcase draft shape sent to POST /api/decisions */
export interface DecisionDraft {
  title: string;
  category: DecisionCategory;
  rationale: string;
  predictedOutcome: string;
  confidenceScore: number;
  urgencyLevel: UrgencyLevel;
  emotionalContext?: string;
  alternativesConsidered: AlternativeConsidered[];
}

interface DecisionLogModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (decision: DecisionDraft) => void;
  initialData?: DecisionDraft;
  mode?: 'create' | 'edit';
}

const CATEGORIES: { value: DecisionCategory; label: string }[] = [
  { value: 'hiring', label: 'Hiring' },
  { value: 'pricing', label: 'Pricing' },
  { value: 'expansion', label: 'Expansion' },
  { value: 'product', label: 'Product' },
  { value: 'team', label: 'Team' },
  { value: 'regulatory', label: 'Regulatory' },
  { value: 'partnerships', label: 'Partnerships' },
  { value: 'fundraising', label: 'Fundraising' },
  { value: 'marketing', label: 'Marketing' },
  { value: 'operations', label: 'Operations' },
  { value: 'other', label: 'Other' },
];

const URGENCY_OPTIONS: { value: UrgencyLevel; label: string; color: string }[] = [
  { value: 'low', label: 'Low', color: 'text-[#34d399] border-[#34d399]/30 hover:bg-[#34d399]/5 data-[active=true]:bg-[#34d399]/10 data-[active=true]:border-[#34d399]/40 data-[active=true]:text-[#34d399]' },
  { value: 'medium', label: 'Medium', color: 'text-[#f59e0b] border-[#f59e0b]/30 hover:bg-[#f59e0b]/5 data-[active=true]:bg-[#f59e0b]/10 data-[active=true]:border-[#f59e0b]/40 data-[active=true]:text-[#f59e0b]' },
  { value: 'high', label: 'High', color: 'text-[#f59e0b] border-[#f59e0b]/30 hover:bg-[#f59e0b]/5 data-[active=true]:bg-[#f59e0b]/10 data-[active=true]:border-[#f59e0b]/40 data-[active=true]:text-[#f59e0b]' },
  { value: 'critical', label: 'Critical', color: 'text-[#e5463e] border-[#e5463e]/30 hover:bg-[#e5463e]/5 data-[active=true]:bg-[#e5463e]/10 data-[active=true]:border-[#e5463e]/40 data-[active=true]:text-[#e5463e]' },
];

function StarSelector({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  const [hovered, setHovered] = useState(0);

  return (
    <div className="flex items-center gap-1" onMouseLeave={() => setHovered(0)}>
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          onClick={() => onChange(star)}
          onMouseEnter={() => setHovered(star)}
          className="transition-transform duration-100 hover:scale-110 focus:outline-none"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 20 20"
            fill={star <= (hovered || value) ? '#1b7ff0' : 'none'}
            stroke={star <= (hovered || value) ? '#1b7ff0' : '#333333'}
            strokeWidth="1.5"
          >
            <path d="M10 2L12.39 7.26L18.18 8.09L14.09 12.08L15.12 17.85L10 15.12L4.88 17.85L5.91 12.08L1.82 8.09L7.61 7.26L10 2Z" strokeLinejoin="round" />
          </svg>
        </button>
      ))}
      <span className="ml-2 text-xs text-[#666666]">
        {value > 0 ? `${value}/5` : 'Select'}
      </span>
    </div>
  );
}

function FieldLabel({
  children,
  required,
  sub,
}: {
  children: React.ReactNode;
  required?: boolean;
  sub?: string;
}) {
  return (
    <div className="mb-1.5">
      <label className="text-[11px] font-semibold uppercase tracking-widest text-[#666666]">
        {children}
        {required && <span className="ml-1 text-[#e5463e]">*</span>}
      </label>
      {sub && <p className="mt-0.5 text-[11px] text-[#444444]">{sub}</p>}
    </div>
  );
}

export function DecisionLogModal({ isOpen, onClose, onSave, initialData, mode = 'create' }: DecisionLogModalProps) {
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<DecisionCategory>('product');
  const [rationale, setRationale] = useState('');
  const [predictedOutcome, setPredictedOutcome] = useState('');
  const [confidenceScore, setConfidenceScore] = useState(0);
  const [urgencyLevel, setUrgencyLevel] = useState<UrgencyLevel>('medium');
  const [emotionalContext, setEmotionalContext] = useState('');
  const [alternatives, setAlternatives] = useState<AlternativeConsidered[]>([
    { description: '', reasonRejected: '' },
  ]);

  // Populate from initialData when opening (edit mode) or reset for create mode
  useEffect(() => {
    if (!isOpen) return;
    if (initialData) {
      setTitle(initialData.title);
      setCategory(initialData.category);
      setRationale(initialData.rationale);
      setPredictedOutcome(initialData.predictedOutcome);
      setConfidenceScore(initialData.confidenceScore);
      setUrgencyLevel(initialData.urgencyLevel);
      setEmotionalContext(initialData.emotionalContext ?? '');
      setAlternatives(
        initialData.alternativesConsidered.length > 0
          ? initialData.alternativesConsidered
          : [{ description: '', reasonRejected: '' }]
      );
    } else {
      setTitle('');
      setCategory('product');
      setRationale('');
      setPredictedOutcome('');
      setConfidenceScore(0);
      setUrgencyLevel('medium');
      setEmotionalContext('');
      setAlternatives([{ description: '', reasonRejected: '' }]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  // Lock scroll
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  const addAlternative = () => {
    setAlternatives((prev) => [...prev, { description: '', reasonRejected: '' }]);
  };

  const removeAlternative = (index: number) => {
    setAlternatives((prev) => prev.filter((_, i) => i !== index));
  };

  const updateAlternative = (
    index: number,
    field: keyof AlternativeConsidered,
    value: string
  ) => {
    setAlternatives((prev) =>
      prev.map((alt, i) => (i === index ? { ...alt, [field]: value } : alt))
    );
  };

  const handleSave = () => {
    if (!title.trim() || !rationale.trim() || !predictedOutcome.trim()) return;
    onSave({
      title: title.trim(),
      category,
      rationale: rationale.trim(),
      predictedOutcome: predictedOutcome.trim(),
      confidenceScore,
      urgencyLevel,
      emotionalContext: emotionalContext.trim() || undefined,
      alternativesConsidered: alternatives.filter((a) => a.description.trim()),
    });
  };

  const isValid = title.trim() && rationale.trim() && predictedOutcome.trim();

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="fixed inset-0 z-40 bg-black/80 backdrop-blur-sm"
          />

          {/* Panel */}
          <motion.div
            key="panel"
            initial={{ opacity: 0, y: 24, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.97 }}
            transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative w-full max-w-2xl max-h-[92vh] overflow-y-auto rounded-xl border border-[#242424] bg-[#111111] shadow-2xl">
              {/* Header */}
              <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[#1a1a1a] bg-[#111111] px-6 py-4">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-[#666666]">
                    Strategic Input
                  </p>
                  <h2 className="text-base font-semibold text-[#f5f5f5]">
                    {mode === 'edit' ? 'Edit Decision' : 'Log This Decision'}
                  </h2>
                </div>
                <button
                  onClick={onClose}
                  className="flex h-8 w-8 items-center justify-center rounded border border-[#242424] text-[#666666] transition-colors hover:border-[#333333] hover:text-[#a0a0a0]"
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                    <path d="M2 2L12 12M12 2L2 12" />
                  </svg>
                </button>
              </div>

              {/* Body */}
              <div className="px-6 py-6 flex flex-col gap-6">
                {/* Title */}
                <div>
                  <FieldLabel required>Decision Title</FieldLabel>
                  <Input
                    placeholder="What decision are you making?"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="text-sm"
                  />
                </div>

                {/* Category */}
                <div>
                  <FieldLabel>Category</FieldLabel>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value as DecisionCategory)}
                    className="flex h-9 w-full rounded-md border border-[#242424] bg-[#1a1a1a] px-3 py-2 text-sm text-[#f5f5f5] focus:outline-none focus:border-[#1b7ff0] focus:ring-1 focus:ring-[#1b7ff0]/40 transition-colors"
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c.value} value={c.value} className="bg-[#1a1a1a]">
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Rationale */}
                <div>
                  <FieldLabel required sub="Why are you making this decision now?">
                    Rationale
                  </FieldLabel>
                  <Textarea
                    placeholder="Describe the reasoning behind this decision..."
                    value={rationale}
                    onChange={(e) => setRationale(e.target.value)}
                    className="min-h-[100px]"
                  />
                </div>

                {/* Predicted Outcome */}
                <div>
                  <FieldLabel required sub="What do you expect to happen?">
                    Predicted Outcome
                  </FieldLabel>
                  <Textarea
                    placeholder="Describe the outcome you expect within a specific timeframe..."
                    value={predictedOutcome}
                    onChange={(e) => setPredictedOutcome(e.target.value)}
                    className="min-h-[80px]"
                  />
                </div>

                {/* Confidence Score */}
                <div>
                  <FieldLabel sub="How confident are you in this decision?">
                    Confidence Level
                  </FieldLabel>
                  <StarSelector value={confidenceScore} onChange={setConfidenceScore} />
                </div>

                {/* Urgency Level */}
                <div>
                  <FieldLabel>Urgency Level</FieldLabel>
                  <div className="flex gap-2 flex-wrap">
                    {URGENCY_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        data-active={urgencyLevel === opt.value}
                        onClick={() => setUrgencyLevel(opt.value)}
                        className={cn(
                          'rounded border px-3 py-1.5 text-xs font-semibold uppercase tracking-wide transition-all duration-150',
                          'border-[#242424] text-[#666666]',
                          opt.color
                        )}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Emotional Context */}
                <div>
                  <FieldLabel sub="Optional — your emotional state influences decisions.">
                    How are you feeling about this decision?
                  </FieldLabel>
                  <Textarea
                    placeholder="E.g. Anxious about the timing, excited about the opportunity, uncertain about the team's readiness..."
                    value={emotionalContext}
                    onChange={(e) => setEmotionalContext(e.target.value)}
                    className="min-h-[70px]"
                  />
                </div>

                {/* Alternatives Considered */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <FieldLabel sub="What else did you consider?">
                      Alternatives Considered
                    </FieldLabel>
                    <button
                      type="button"
                      onClick={addAlternative}
                      className="text-[11px] font-semibold uppercase tracking-wide text-[#1b7ff0] hover:text-[#1570d8] transition-colors"
                    >
                      + Add
                    </button>
                  </div>

                  <div className="flex flex-col gap-3">
                    {alternatives.map((alt, index) => (
                      <div
                        key={index}
                        className="rounded-lg border border-[#1a1a1a] bg-[#0d0d0d] p-4 relative"
                      >
                        {alternatives.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeAlternative(index)}
                            className="absolute top-3 right-3 text-[#444444] hover:text-[#e5463e] transition-colors"
                          >
                            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                              <path d="M2 2L10 10M10 2L2 10" />
                            </svg>
                          </button>
                        )}
                        <div className="flex flex-col gap-2">
                          <div>
                            <p className="text-[10px] font-semibold uppercase tracking-widest text-[#444444] mb-1">
                              Alternative {index + 1}
                            </p>
                            <Input
                              placeholder="Describe the alternative..."
                              value={alt.description}
                              onChange={(e) =>
                                updateAlternative(index, 'description', e.target.value)
                              }
                              className="text-sm"
                            />
                          </div>
                          <div>
                            <p className="text-[10px] font-semibold uppercase tracking-widest text-[#444444] mb-1">
                              Why Rejected
                            </p>
                            <Input
                              placeholder="Why didn't you go with this?"
                              value={alt.reasonRejected}
                              onChange={(e) =>
                                updateAlternative(index, 'reasonRejected', e.target.value)
                              }
                              className="text-sm"
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="sticky bottom-0 flex items-center justify-between gap-3 border-t border-[#1a1a1a] bg-[#111111] px-6 py-4">
                <Button variant="ghost" size="md" onClick={onClose}>
                  Cancel
                </Button>
                <Button
                  variant="default"
                  size="md"
                  onClick={handleSave}
                  disabled={!isValid}
                  className="min-w-[160px]"
                >
                  {mode === 'edit' ? 'Update Decision' : 'Log This Decision'}
                </Button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

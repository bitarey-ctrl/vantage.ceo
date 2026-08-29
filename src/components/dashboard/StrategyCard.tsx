'use client';

import React, { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

type ImpactLevel = 'high' | 'medium' | 'low' | 'none';

interface ImpactMatrix {
  revenue: ImpactLevel;
  cost: ImpactLevel;
  competitive_position: ImpactLevel;
  regulatory_exposure: ImpactLevel;
}

interface StrategyCardProps {
  id: string;
  signalTitle: string;
  soWhat: string;
  primaryImpact: string;
  secondaryImpact?: string;
  tertiaryRisk?: string;
  actionRecommendation: string;
  urgencyDays: number;
  confidenceScore: number;
  impactMatrix: ImpactMatrix;
  status: 'pending' | 'accepted' | 'rejected';
  onAccept: (id: string) => void;
  onReject: (id: string) => void;
  onExpand: (id: string) => void;
}

function getUrgencyVariant(days: number): 'critical' | 'warning' | 'default' | 'stable' {
  if (days <= 3) return 'critical';
  if (days <= 7) return 'warning';
  if (days <= 30) return 'default';
  return 'stable';
}

function getUrgencyLabel(days: number): string {
  if (days <= 3) return `${days}d — URGENT`;
  if (days <= 7) return `${days}d — HIGH`;
  if (days <= 30) return `${days}d — MODERATE`;
  return `${days}d — MONITOR`;
}

function ImpactDot({ level }: { level: ImpactLevel }) {
  const colors: Record<ImpactLevel, string> = {
    high: 'bg-[#e5463e]',
    medium: 'bg-[#f59e0b]',
    low: 'bg-[#34d399]',
    none: 'bg-[#333333]',
  };
  return (
    <span
      className={cn('inline-block h-2 w-2 rounded-full flex-shrink-0', colors[level])}
    />
  );
}

function ImpactRow({
  label,
  level,
}: {
  label: string;
  level: ImpactLevel;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs text-[#666666] uppercase tracking-wider">{label}</span>
      <div className="flex items-center gap-1.5">
        <ImpactDot level={level} />
        <span className="text-xs font-medium text-[#a0a0a0] uppercase">{level}</span>
      </div>
    </div>
  );
}

export function StrategyCard({
  id,
  signalTitle,
  soWhat,
  primaryImpact,
  secondaryImpact,
  tertiaryRisk,
  actionRecommendation,
  urgencyDays,
  confidenceScore,
  impactMatrix,
  status,
  onAccept,
  onReject,
  onExpand,
}: StrategyCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [accepted, setAccepted] = useState(status === 'accepted');
  const [rejected, setRejected] = useState(status === 'rejected');

  const handleAccept = () => {
    setAccepted(true);
    onAccept(id);
  };

  const handleReject = () => {
    setRejected(true);
    onReject(id);
  };

  const handleToggleExpand = () => {
    setExpanded((prev) => !prev);
    onExpand(id);
  };

  const urgencyVariant = getUrgencyVariant(urgencyDays);
  const urgencyLabel = getUrgencyLabel(urgencyDays);

  return (
    <motion.div
      layout
      animate={{
        opacity: rejected ? 0.25 : 1,
        scale: rejected ? 0.98 : 1,
      }}
      transition={{ duration: 0.3 }}
      className={cn(
        'relative rounded-lg border bg-[#111111] text-[#f5f5f5] transition-colors duration-200',
        accepted
          ? 'border-[#34d399]/30 shadow-[0_0_0_1px_rgba(52,211,153,0.1)]'
          : 'border-[#242424]',
        rejected ? 'pointer-events-none' : ''
      )}
    >
      {/* Accepted indicator bar */}
      {accepted && (
        <div className="absolute left-0 top-0 bottom-0 w-0.5 rounded-l-lg bg-[#34d399]" />
      )}

      <div className="p-5">
        {/* Header row */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant={urgencyVariant}>{urgencyLabel}</Badge>
            {accepted && (
              <Badge variant="stable">
                <svg
                  width="9"
                  height="9"
                  viewBox="0 0 9 9"
                  fill="currentColor"
                  className="mr-0.5"
                >
                  <path d="M1.5 4.5L3.5 6.5L7.5 2.5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Accepted
              </Badge>
            )}
          </div>
          <span className="text-[11px] text-[#666666] font-mono whitespace-nowrap flex-shrink-0">
            {confidenceScore}% confidence
          </span>
        </div>

        {/* Signal title */}
        <p className="text-[11px] font-semibold uppercase tracking-widest text-[#666666] mb-1.5">
          {signalTitle}
        </p>

        {/* So What */}
        <p className="text-base font-medium text-[#f5f5f5] leading-snug mb-4">
          {soWhat}
        </p>

        {/* Expanded content */}
        <AnimatePresence initial={false}>
          {expanded && (
            <motion.div
              key="expanded"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
              style={{ overflow: 'hidden' }}
            >
              <div className="border-t border-[#1a1a1a] pt-4 mb-4 flex flex-col gap-4">
                {/* Primary Impact */}
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-[#666666] mb-1">
                    Primary Impact
                  </p>
                  <p className="text-sm text-[#a0a0a0] leading-relaxed">{primaryImpact}</p>
                </div>

                {/* Secondary Impact */}
                {secondaryImpact && (
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-[#666666] mb-1">
                      Secondary Impact
                    </p>
                    <p className="text-sm text-[#a0a0a0] leading-relaxed">{secondaryImpact}</p>
                  </div>
                )}

                {/* Tertiary Risk */}
                {tertiaryRisk && (
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-[#e5463e]/70 mb-1">
                      Tertiary Risk
                    </p>
                    <p className="text-sm text-[#a0a0a0] leading-relaxed">{tertiaryRisk}</p>
                  </div>
                )}

                {/* Impact Matrix */}
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-[#666666] mb-2">
                    Impact Matrix
                  </p>
                  <div className="rounded-md border border-[#1a1a1a] bg-[#0d0d0d] p-3 flex flex-col gap-2">
                    <ImpactRow label="Revenue" level={impactMatrix.revenue} />
                    <ImpactRow label="Cost" level={impactMatrix.cost} />
                    <ImpactRow label="Competitive Position" level={impactMatrix.competitive_position} />
                    <ImpactRow label="Regulatory Exposure" level={impactMatrix.regulatory_exposure} />
                  </div>
                </div>

                {/* Action Recommendation */}
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-[#1b7ff0]/80 mb-1">
                    Recommended Action
                  </p>
                  <p className="text-sm text-[#f5f5f5] leading-relaxed font-medium">
                    {actionRecommendation}
                  </p>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Action buttons */}
        <div className="flex items-center gap-2 pt-1">
          <button
            onClick={handleAccept}
            disabled={accepted || rejected}
            className={cn(
              'flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-semibold uppercase tracking-wide transition-all duration-150',
              accepted
                ? 'bg-[#34d399]/10 text-[#34d399] border border-[#34d399]/20 cursor-default'
                : 'border border-[#242424] text-[#a0a0a0] hover:border-[#34d399]/40 hover:text-[#34d399] hover:bg-[#34d399]/5'
            )}
          >
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M1.5 5.5L4 8L9.5 2.5" />
            </svg>
            Accept
          </button>

          <button
            onClick={handleToggleExpand}
            className="flex items-center gap-1.5 rounded border border-[#242424] px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-[#a0a0a0] transition-all duration-150 hover:border-[#1b7ff0]/40 hover:text-[#1b7ff0] hover:bg-[#1b7ff0]/5"
          >
            {expanded ? (
              <>
                <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                  <path d="M2 7L5.5 3.5L9 7" />
                </svg>
                Less
              </>
            ) : (
              <>
                <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                  <path d="M2 4L5.5 7.5L9 4" />
                </svg>
                More
              </>
            )}
          </button>

          <button
            onClick={handleReject}
            disabled={accepted || rejected}
            className="ml-auto flex items-center gap-1.5 rounded border border-[#242424] px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-[#666666] transition-all duration-150 hover:border-[#e5463e]/40 hover:text-[#e5463e] hover:bg-[#e5463e]/5 disabled:opacity-40 disabled:pointer-events-none"
          >
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M2 2L9 9M9 2L2 9" />
            </svg>
            Dismiss
          </button>
        </div>
      </div>
    </motion.div>
  );
}

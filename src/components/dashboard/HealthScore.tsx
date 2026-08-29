'use client';

import React, { useEffect, useState } from 'react';
import { motion, useMotionValue, useTransform, animate } from 'framer-motion';
import { cn } from '@/lib/utils';

interface HealthScoreProps {
  score: number;
  delta: number;
  rationale: string;
  isLoading?: boolean;
}

function getRingColor(score: number): string {
  if (score >= 80) return '#34d399';
  if (score >= 60) return '#f59e0b';
  if (score >= 40) return '#f59e0b';
  return '#e5463e';
}

function getScoreLabel(score: number): string {
  if (score >= 80) return 'STRONG';
  if (score >= 60) return 'MODERATE';
  if (score >= 40) return 'CAUTION';
  return 'CRITICAL';
}

const SIZE = 160;
const STROKE = 10;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function HealthScore({ score, delta, rationale, isLoading = false }: HealthScoreProps) {
  const [displayScore, setDisplayScore] = useState(0);
  const [animatedOffset, setAnimatedOffset] = useState(CIRCUMFERENCE);

  useEffect(() => {
    if (isLoading) return;
    const targetOffset = CIRCUMFERENCE - (score / 100) * CIRCUMFERENCE;

    // Animate number
    let start = 0;
    const duration = 1200;
    const startTime = performance.now();

    const tick = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayScore(Math.round(eased * score));
      setAnimatedOffset(CIRCUMFERENCE - eased * (score / 100) * CIRCUMFERENCE);
      if (progress < 1) requestAnimationFrame(tick);
    };

    requestAnimationFrame(tick);
  }, [score, isLoading]);

  const ringColor = getRingColor(score);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center gap-4">
        <div className="relative">
          <div
            className="rounded-full animate-pulse bg-[#1a1a1a]"
            style={{ width: SIZE, height: SIZE }}
          />
        </div>
        <div className="flex flex-col items-center gap-2">
          <div className="h-4 w-24 rounded bg-[#1a1a1a] animate-pulse" />
          <div className="h-3 w-40 rounded bg-[#1a1a1a] animate-pulse" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4">
      {/* Ring */}
      <div className="relative" style={{ width: SIZE, height: SIZE }}>
        <svg
          width={SIZE}
          height={SIZE}
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          className="rotate-[-90deg]"
        >
          {/* Track */}
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            fill="none"
            stroke="#1a1a1a"
            strokeWidth={STROKE}
          />
          {/* Progress */}
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            fill="none"
            stroke={ringColor}
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={animatedOffset}
            style={{ transition: 'stroke 0.4s ease' }}
          />
        </svg>

        {/* Center content */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span
            className="text-4xl font-bold tabular-nums leading-none"
            style={{ color: ringColor }}
          >
            {displayScore}
          </span>
          <span className="mt-1 text-[10px] font-semibold uppercase tracking-widest text-[#666666]">
            {getScoreLabel(score)}
          </span>
        </div>
      </div>

      {/* Delta */}
      <div className="flex items-center gap-1.5">
        <span
          className={cn(
            'flex items-center gap-0.5 text-sm font-semibold',
            delta >= 0 ? 'text-[#34d399]' : 'text-[#e5463e]'
          )}
        >
          {delta >= 0 ? (
            <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
              <path d="M6 2L10 8H2L6 2Z" />
            </svg>
          ) : (
            <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
              <path d="M6 10L2 4H10L6 10Z" />
            </svg>
          )}
          {delta >= 0 ? '+' : ''}{delta} pts
        </span>
        <span className="text-[#666666] text-xs">vs last week</span>
      </div>

      {/* Label */}
      <span className="text-[10px] font-semibold uppercase tracking-widest text-[#666666]">
        Company Health Score
      </span>

      {/* Rationale */}
      {rationale && (
        <p className="max-w-[240px] text-center text-xs leading-relaxed text-[#666666]">
          {rationale}
        </p>
      )}
    </div>
  );
}

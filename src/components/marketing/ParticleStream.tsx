"use client";

import { useEffect, useRef } from "react";
import { prefersReducedMotion } from "@/lib/gsap/register";

/*
 * ParticleStream — the "dissolve into data" half of the VANTAGE logo.
 *
 * This canvas renders ONLY the glowing horizon line and the descending stream
 * of red data-pixels beneath the V. The solid V itself is a separate 3D CSS
 * layer (see VMark3D in Hero) that sits above this canvas, so the V can tilt
 * in 3D while its base appears to shatter into this stream.
 *
 * The stream particles spawn along a line near the V's base and fall/scatter
 * downward, fading with depth — matching the pixelated tail in the logo.
 *
 * dissolveRef (0..1, driven by the hero's scroll) increases spawn rate and
 * spread so the stream intensifies as the V dissolves away on scroll.
 *
 * Respects prefers-reduced-motion (renders nothing / static).
 */

type StreamP = {
  x: number;
  y: number;
  x0: number;
  vy: number;
  drift: number;
  size: number;
  life: number;
  speed: number;
};

export function ParticleStream({
  dissolveRef,
  width = 300,
}: {
  dissolveRef: React.MutableRefObject<number>;
  width?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // Non-null assertion: the guard below is the real check. TS discards the
    // narrowing inside the hoisted `draw` function declaration below.
    const ctx = canvas.getContext("2d")!;
    if (!ctx) return;

    const reduced = prefersReducedMotion();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = width;
    const H = width * 1.5;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = `${W}px`;
    canvas.style.height = `${H}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const cx = W / 2;
    // Horizon sits just below the visual base of the V (V occupies top ~55%).
    const horizonY = H * 0.52;
    const vHalfAtBase = W * 0.12; // spread of the shatter origin

    const stream: StreamP[] = [];
    const MAX = reduced ? 0 : 460;

    function spawn(spread: number) {
      const x = cx + (Math.random() - 0.5) * 2 * (vHalfAtBase + spread);
      stream.push({
        x,
        x0: x,
        y: horizonY + Math.random() * 6,
        vy: 0.6 + Math.random() * 1.3,
        drift: (Math.random() - 0.5) * 0.6,
        size: Math.random() < 0.5 ? 2 : 3,
        life: 0,
        speed: 0.004 + Math.random() * 0.004,
      });
    }

    let raf = 0;
    const startT = performance.now();

    function draw(now: number) {
      ctx.clearRect(0, 0, W, H);
      const elapsed = now - startT;
      const intro = reduced ? 1 : Math.min(Math.max((elapsed - 400) / 1400, 0), 1);
      const introEase = 1 - Math.pow(1 - intro, 3);
      const dissolve = reduced ? 0 : Math.min(Math.max(dissolveRef.current, 0), 1);

      // Glowing horizon line
      if (introEase > 0.05) {
        const lg = ctx.createLinearGradient(0, horizonY, W, horizonY);
        lg.addColorStop(0, "rgba(255,45,45,0)");
        lg.addColorStop(0.5, `rgba(255,120,90,${0.95 * introEase})`);
        lg.addColorStop(1, "rgba(255,45,45,0)");
        ctx.fillStyle = lg;
        ctx.fillRect(0, horizonY - 1, W, 2.5);
        const bloom = ctx.createRadialGradient(cx, horizonY, 0, cx, horizonY, W * 0.55);
        bloom.addColorStop(0, `rgba(255,80,60,${0.3 * introEase})`);
        bloom.addColorStop(1, "rgba(255,80,60,0)");
        ctx.fillStyle = bloom;
        ctx.fillRect(0, horizonY - 45, W, 90);
      }

      if (!reduced) {
        const spread = dissolve * W * 0.25;
        const rate = 5 + Math.floor(dissolve * 12);
        for (let i = 0; i < rate; i++) {
          if (stream.length < MAX) spawn(spread);
        }
        for (let i = stream.length - 1; i >= 0; i--) {
          const s = stream[i];
          s.life += s.speed + s.vy * 0.004;
          s.y += s.vy * (1 + s.life * 2.2);
          s.x += s.drift + Math.sin((s.y + s.x0) * 0.03) * 0.5;
          if (s.y > H || s.life > 1) {
            stream.splice(i, 1);
            continue;
          }
          const a = (1 - s.life) * (0.85 * introEase);
          const g = 40 + Math.floor(60 * (1 - s.life));
          ctx.fillStyle = `rgba(255,${g},${Math.floor(g * 0.7)},${a})`;
          ctx.fillRect(s.x, s.y, s.size, s.size);
        }
      }

      raf = requestAnimationFrame(draw);
    }

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [dissolveRef, width]);

  return <canvas ref={canvasRef} aria-hidden className="block" />;
}

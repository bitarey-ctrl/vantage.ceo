"use client";

import { useEffect, useRef } from "react";
import { prefersReducedMotion } from "@/lib/gsap/register";

/*
 * ParticleV — matches the VANTAGE logo: a SOLID, crisp red V whose LOWER
 * portion shatters into a descending stream of red data-pixels beneath a
 * glowing horizon line. "Signal (solid, clear) emerging from / dissolving
 * into noise (the data stream)."
 *
 * Rendering model (Canvas 2D, no three.js):
 *   • The V is drawn as a solid filled path with a vertical gradient, exactly
 *     like the logo — sharp and legible, NOT a field of dots.
 *   • A horizon line glows across the V's mid/base.
 *   • Below the horizon, a mask fades the solid fill out and hundreds of small
 *     red squares stream downward (the "dissolve into data" from the logo).
 *   • dissolveRef (0..1, driven by the hero's scroll) raises the shatter line
 *     UP through the V so on scroll the whole V progressively disintegrates
 *     into the stream — order → noise.
 *
 * Respects prefers-reduced-motion (static solid V, no stream).
 */

type StreamP = {
  x0: number; // origin x at the shatter line
  x: number;
  y: number;
  vy: number;
  drift: number;
  size: number;
  life: number; // 0..1 progress down the stream
  speed: number;
};

export function ParticleV({
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
    const H = width * 1.5; // room for the descending stream
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = `${W}px`;
    canvas.style.height = `${H}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // ── V geometry (matches the logo proportions) ──
    const cx = W / 2;
    const vTop = H * 0.06;
    const vBottom = H * 0.5; // tip of the V
    const outerHalf = W * 0.42; // half-width at the top (outer edge)
    const armThickness = W * 0.2; // thickness of each arm at the top

    // Build the solid V outline path (two arms meeting at a point).
    function buildVPath(): Path2D {
      const p = new Path2D();
      // outer-left top → tip → outer-right top → inner-right top → inner tip → inner-left top
      const outerLx = cx - outerHalf;
      const outerRx = cx + outerHalf;
      const innerLx = cx - outerHalf + armThickness;
      const innerRx = cx + outerHalf - armThickness;
      p.moveTo(outerLx, vTop);
      p.lineTo(cx, vBottom); // down to tip (outer)
      p.lineTo(outerRx, vTop);
      p.lineTo(innerRx, vTop);
      p.lineTo(cx, vBottom - armThickness * 0.9); // inner tip (higher notch)
      p.lineTo(innerLx, vTop);
      p.closePath();
      return p;
    }
    const vPath = buildVPath();

    // ── Stream particles (spawned along the shatter line, fall downward) ──
    const stream: StreamP[] = [];
    const MAX_STREAM = reduced ? 0 : 420;

    function spawn(shatterY: number) {
      // spawn across the V's width at the shatter line, denser toward center
      const t = (shatterY - vTop) / (vBottom - vTop); // 0..1 down the V
      const halfAtY = outerHalf * (1 - t) + (armThickness * 0.5); // rough width
      const x = cx + (Math.random() - 0.5) * 2 * halfAtY;
      stream.push({
        x0: x,
        x,
        y: shatterY + Math.random() * 6,
        vy: 0.6 + Math.random() * 1.2,
        drift: (Math.random() - 0.5) * 0.5,
        size: Math.random() < 0.5 ? 2 : 3,
        life: 0,
        speed: 0.004 + Math.random() * 0.004,
      });
    }

    let raf = 0;
    const startT = performance.now();
    const INTRO_MS = 1400;

    function draw(now: number) {
      ctx.clearRect(0, 0, W, H);
      const elapsed = now - startT;
      const intro = reduced ? 1 : Math.min(Math.max((elapsed - 200) / INTRO_MS, 0), 1);
      const introEase = 1 - Math.pow(1 - intro, 3);
      const dissolve = reduced ? 0 : Math.min(Math.max(dissolveRef.current, 0), 1);

      // The shatter line: base of V at rest; rises UP toward vTop as dissolve→1.
      // At rest it sits a bit above the tip so the very bottom always streams.
      const restShatter = vBottom - (vBottom - vTop) * 0.22;
      const shatterY = restShatter - (restShatter - vTop) * dissolve;

      // Horizon glow sits at the shatter line.
      const horizonY = shatterY;

      // ── Draw the SOLID V, clipped above the shatter line ──
      ctx.save();
      // clip to region above shatter line (solid part)
      ctx.beginPath();
      ctx.rect(0, 0, W, horizonY);
      ctx.clip();
      // vertical gradient like the logo (bright top → deep red)
      const grad = ctx.createLinearGradient(0, vTop, 0, vBottom);
      grad.addColorStop(0, "#ff7a5c");
      grad.addColorStop(0.5, "#ff2f26");
      grad.addColorStop(1, "#c1140f");
      ctx.fillStyle = grad;
      ctx.globalAlpha = 0.35 + 0.65 * introEase; // fade the solid V in on load
      ctx.shadowColor = "rgba(255,45,45,0.5)";
      ctx.shadowBlur = 24;
      ctx.fill(vPath);
      ctx.restore();

      // Soft fade strip just above the shatter line so the solid edge doesn't
      // look razor-cut — it feathers into the stream.
      const fade = ctx.createLinearGradient(0, horizonY - 26, 0, horizonY);
      fade.addColorStop(0, "rgba(0,0,0,0)");
      fade.addColorStop(1, "rgba(0,0,0,0.0)");
      // (kept transparent; feather achieved via particle overlap)

      // ── Glowing horizon line ──
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

      // ── Stream: spawn + update + draw ──
      if (!reduced) {
        const spawnRate = 6 + Math.floor(dissolve * 10);
        for (let i = 0; i < spawnRate; i++) {
          if (stream.length < MAX_STREAM) spawn(shatterY);
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

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="block"
      style={{ filter: "drop-shadow(0 8px 30px rgba(255,45,45,0.3))" }}
    />
  );
}

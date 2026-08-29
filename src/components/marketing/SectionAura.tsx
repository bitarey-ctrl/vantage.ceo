"use client";

import { useRef } from "react";
import { useGSAP } from "@gsap/react";
import { gsap, ScrollTrigger, prefersReducedMotion } from "@/lib/gsap/register";

/*
 * SectionAura — a soft, anchored glow that lives BEHIND a section's content
 * and never crosses over text. Unlike a roaming orb, an aura is pinned to a
 * position within its parent section (a corner or edge), bleeding inward, so
 * it can guide the eye and add warmth without ever washing out copy.
 *
 * Usage: drop <SectionAura /> as the FIRST child of a `position: relative`
 * section, with the real content after it at a higher stacking level. The
 * aura is absolutely positioned and pointer-events:none.
 *
 *   <section className="relative overflow-hidden">
 *     <SectionAura placement="right" intensity={0.9} />
 *     <div className="relative z-10"> ...content... </div>
 *   </section>
 *
 * Props:
 *   - placement: which edge/corner the glow anchors to (kept off the text).
 *   - intensity: 0..1 peak opacity multiplier.
 *   - hue: "crimson" (default) — kept in the brand family.
 *   - reveal: if true, the aura softly blooms in when the section scrolls
 *     into view (via ScrollTrigger) and breathes; otherwise it's static.
 *
 * Life: a gentle breathing pulse via CSS (.aura-breathe in globals.css) that
 * runs on the compositor, so it never freezes when the JS loop is idle.
 */

type Placement =
  | "right"
  | "left"
  | "top-right"
  | "top-left"
  | "bottom-right"
  | "bottom-left"
  | "center";

const PLACEMENTS: Record<Placement, React.CSSProperties> = {
  right: { top: "50%", right: "-10%", transform: "translateY(-50%)" },
  left: { top: "50%", left: "-10%", transform: "translateY(-50%)" },
  "top-right": { top: "-30%", right: "-14%" },
  "top-left": { top: "-30%", left: "-14%" },
  "bottom-right": { bottom: "-10%", right: "-8%" },
  "bottom-left": { bottom: "-10%", left: "-8%" },
  center: { top: "50%", left: "50%", transform: "translate(-50%, -50%)" },
};

export function SectionAura({
  placement = "right",
  intensity = 0.8,
  size = 620,
  reveal = true,
}: {
  placement?: Placement;
  intensity?: number;
  size?: number;
  reveal?: boolean;
}) {
  const auraRef = useRef<HTMLDivElement>(null);

  useGSAP(() => {
    const el = auraRef.current;
    if (!el || !reveal) return;

    if (prefersReducedMotion()) {
      gsap.set(el, { opacity: intensity * 0.6 });
      return;
    }

    gsap.set(el, { opacity: 0 });
    gsap.to(el, {
      opacity: intensity,
      ease: "none",
      scrollTrigger: {
        trigger: el.parentElement ?? el,
        start: "top 85%",
        end: "center center",
        scrub: 1.2,
      },
    });
  }, [reveal, intensity]);

  return (
    <div
      ref={auraRef}
      aria-hidden="true"
      className="pointer-events-none absolute z-0 aura-breathe"
      style={{
        width: size,
        height: size,
        maxWidth: "70vw",
        maxHeight: "70vw",
        borderRadius: "50%",
        // Soft, edge-anchored bloom. Low center opacity so even if content
        // overlaps the outer falloff, text stays readable. The heavy blur +
        // transparent-by-70% falloff keep it a glow, never a disc.
        background:
          "radial-gradient(circle, rgba(255,60,45,0.16) 0%, rgba(255,45,45,0.07) 38%, rgba(255,45,45,0.02) 58%, transparent 72%)",
        filter: "blur(60px)",
        opacity: intensity * (reveal ? 0 : 0.7),
        ...PLACEMENTS[placement],
      }}
    />
  );
}

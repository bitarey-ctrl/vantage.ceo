"use client";

import { useEffect, useRef, useState } from "react";
import { gsap, prefersReducedMotion } from "@/lib/gsap/register";

export function LoadingScreen() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const counterRef = useRef<HTMLSpanElement>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (prefersReducedMotion()) {
      // Skip loading animation entirely
      setDone(true);
      return;
    }

    const counter = { val: 0 };
    const tl = gsap.timeline({
      onComplete: () => setDone(true),
    });

    // Count from 0% to 100%
    tl.to(counter, {
      val: 100,
      duration: 1.8,
      ease: "power2.inOut",
      onUpdate: () => {
        if (counterRef.current) {
          counterRef.current.textContent = `${Math.round(counter.val)}%`;
        }
      },
    });

    // Fade out the loading screen
    tl.to(wrapRef.current, {
      opacity: 0,
      duration: 0.4,
      ease: "power2.inOut",
    });

    return () => {
      tl.kill();
    };
  }, []);

  if (done) return null;

  return (
    <div
      ref={wrapRef}
      className="fixed inset-0 z-[100] flex items-center justify-center"
      style={{ backgroundColor: "#000" }}
    >
      {/* V mark */}
      <div className="flex flex-col items-center gap-6">
        <div
          className="text-6xl font-bold tracking-[-0.04em]"
          style={{ color: "var(--neon-red, #ff2d2d)" }}
        >
          V
        </div>
        <span
          ref={counterRef}
          className="text-sm font-mono tracking-[0.2em]"
          style={{ color: "rgba(255,255,255,0.5)" }}
        >
          0%
        </span>
      </div>
    </div>
  );
}

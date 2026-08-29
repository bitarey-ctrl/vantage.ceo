"use client";

import { ReactLenis, type LenisRef } from "lenis/react";
import { useEffect, useRef } from "react";
import { gsap, ScrollTrigger, prefersReducedMotion } from "@/lib/gsap/register";

export function SmoothScroll({ children }: { children: React.ReactNode }) {
  const lenisRef = useRef<LenisRef>(null);

  useEffect(() => {
    // GSAP's ticker drives the Lenis RAF loop (autoRaf: false below)
    function update(time: number) {
      lenisRef.current?.lenis?.raf(time * 1000);
    }
    gsap.ticker.add(update);
    gsap.ticker.lagSmoothing(0);

    // Keep ScrollTrigger in sync with Lenis-driven scroll
    const lenis = lenisRef.current?.lenis;
    lenis?.on("scroll", ScrollTrigger.update);

    return () => {
      gsap.ticker.remove(update);
      lenis?.off("scroll", ScrollTrigger.update);
    };
  }, []);

  return (
    <ReactLenis
      root
      ref={lenisRef}
      options={{
        autoRaf: false, // GSAP ticker drives the RAF loop
        lerp: prefersReducedMotion() ? 1 : 0.08,
        duration: prefersReducedMotion() ? 0 : 1.2,
        smoothWheel: true,
        syncTouch: false, // better mobile performance
        touchMultiplier: 1.5,
      }}
    >
      {children}
    </ReactLenis>
  );
}

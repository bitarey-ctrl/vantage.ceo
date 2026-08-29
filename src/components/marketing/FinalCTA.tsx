"use client";

import { useRef } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useGSAP } from "@gsap/react";
import { gsap, prefersReducedMotion } from "@/lib/gsap/register";
import { SplitWords } from "./SplitWords";

const FAN = [
  { rotate: -4, x: -180, label: "Daily Briefing" },
  { rotate: 0, x: 0, label: "Signal Feed" },
  { rotate: 4, x: 180, label: "Advisor" },
];

export function FinalCTA() {
  const rootRef = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      if (prefersReducedMotion()) {
        gsap.utils.toArray<HTMLElement>(".js-rm").forEach((el) => {
          gsap.fromTo(
            el,
            { opacity: 0 },
            {
              opacity: 1,
              duration: 0.4,
              stagger: 0.05,
              scrollTrigger: { trigger: rootRef.current, start: "top 85%", once: true },
            }
          );
        });
        return;
      }

      const tl = gsap.timeline({
        scrollTrigger: { trigger: rootRef.current, start: "top 70%", once: true },
      });
      tl.from(".js-cta-word", {
        y: 20,
        opacity: 0,
        duration: 0.5,
        stagger: 0.04,
        ease: "power3.out",
      });
      tl.from(".js-cta-body", { y: 15, opacity: 0, duration: 0.5, ease: "power3.out" }, "-=0.2");
      tl.from(".js-cta-btns", { y: 15, opacity: 0, duration: 0.5, ease: "power3.out" }, "-=0.25");
      // Fan the mock screenshots out from a center stack. The static outer
      // wrapper owns the final position/rotation; the inner element starts
      // counter-offset so all three appear stacked at center, then settle.
      gsap.utils.toArray<HTMLElement>(".js-cta-fan").forEach((el, i) => {
        const fx = parseFloat(el.dataset.fx ?? "0");
        const fr = parseFloat(el.dataset.fr ?? "0");
        tl.from(
          el,
          {
            x: -fx,
            rotate: -fr,
            y: 30,
            opacity: 0,
            duration: 0.9,
            ease: "power3.out",
          },
          1.0 + i * 0.08
        );
      });
    },
    { scope: rootRef }
  );

  return (
    <section
      ref={rootRef}
      className="relative overflow-hidden px-5 py-[120px] md:py-[160px] text-center"
    >
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{
          background: "radial-gradient(circle at 50% 50%, rgba(255,45,45,0.06), transparent 70%)",
        }}
      />

      <div className="relative z-10">
        <h2 className="js-rm font-display text-[36px] md:text-[56px] leading-[1.1] text-white max-w-[700px] mx-auto">
          <span className="block">
            <SplitWords className="js-cta-word">Your next decision</SplitWords>
          </span>
          <span className="block">
            <SplitWords className="js-cta-word">should be your best one.</SplitWords>
          </span>
        </h2>

        <p className="js-cta-body js-rm text-lg text-white/50 mt-5">
          Set up in two minutes. First briefing tomorrow morning.
        </p>

        <div className="js-cta-btns js-rm mt-10 flex items-center justify-center gap-4 flex-wrap">
          <Link
            href="/signup"
            className="group flex items-center gap-2 rounded-full px-9 py-4 text-[15px] font-medium text-white hover:brightness-110 transition-all"
            style={{ backgroundColor: "var(--neon-red)" }}
          >
            Start free trial
            <ArrowRight size={16} className="transition-transform duration-200 group-hover:translate-x-1" />
          </Link>
          <a
            href="#product"
            className="rounded-full px-9 py-4 text-[15px] text-white border border-white/15 hover:border-white/30 transition-colors"
          >
            See how it works
          </a>
        </div>

        {/* Fanned mock screenshots */}
        <div className="relative mt-20 h-[200px] hidden sm:block" aria-hidden>
          {FAN.map((f) => (
            <div
              key={f.label}
              className="absolute left-1/2 top-0"
              style={{
                transform: `translateX(calc(-50% + ${f.x}px)) rotate(${f.rotate}deg)`,
                zIndex: f.rotate === 0 ? 2 : 1,
              }}
            >
              <div
                className="js-cta-fan js-rm glass w-[260px] rounded-2xl p-5"
                data-fx={f.x}
                data-fr={f.rotate}
              >
                <p className="text-[10px] uppercase tracking-[0.2em] text-white/40 text-left">
                  {f.label}
                </p>
                <div className="mt-3 space-y-2">
                  <div className="h-2 rounded-full bg-white/10" />
                  <div className="h-2 w-4/5 rounded-full bg-white/10" />
                  <div
                    className="h-2 w-2/3 rounded-full"
                    style={{ backgroundColor: "var(--neon-red-soft)" }}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

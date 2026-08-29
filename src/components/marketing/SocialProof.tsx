"use client";

import { useRef } from "react";
import { useGSAP } from "@gsap/react";
import { gsap, prefersReducedMotion } from "@/lib/gsap/register";

const LOGOS = ["Acme Corp", "Meridian", "Apex Ventures", "NorthStar", "Helix", "Foundry"];

const TESTIMONIALS = [
  {
    initials: "SC",
    name: "Sarah Chen",
    title: "CEO, Meridian SaaS",
    quote:
      "VANTAGE is the first thing I read every morning. It tells me what changed and what to do about it — in four minutes.",
  },
  {
    initials: "MR",
    name: "Marcus Rivera",
    title: "Founder, Apex Ventures",
    quote:
      "The decision log alone is worth it. I can see exactly what we decided in March and why. Nothing else I've used does that.",
  },
  {
    initials: "AP",
    name: "Aisha Patel",
    title: "COO, NorthStar Health",
    quote:
      "I cancelled three newsletter subscriptions and got my mornings back. The signal quality is startling.",
  },
];

export function SocialProof() {
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
              scrollTrigger: { trigger: el, start: "top 90%", once: true },
            }
          );
        });
        return; // marquee stays static
      }

      gsap.to(".js-logo-track", { xPercent: -50, duration: 20, ease: "none", repeat: -1 });

      gsap.from(".js-testimonial", {
        y: 30,
        opacity: 0,
        duration: 0.8,
        stagger: 0.12,
        ease: "power3.out",
        scrollTrigger: { trigger: ".js-testimonial-grid", start: "top 80%", once: true },
      });
    },
    { scope: rootRef }
  );

  return (
    <section ref={rootRef} className="py-20 md:py-[120px]">
      <div className="max-w-[1100px] mx-auto px-5 md:px-10 text-center">
        <div className="js-rm">
          <p className="text-xs uppercase tracking-[0.2em] mb-4" style={{ color: "var(--neon-red)" }}>
            Trusted By
          </p>
          <h2 className="font-display text-[32px] md:text-[48px] leading-[1.1] text-white">
            Operators who moved first.
          </h2>
        </div>
      </div>

      {/* Logo marquee */}
      <div
        className="js-rm mt-14 overflow-hidden py-10"
        style={{
          borderTop: "1px solid rgba(255,255,255,0.06)",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        <div className="js-logo-track flex whitespace-nowrap w-max">
          {[0, 1].map((dup) => (
            <div key={dup} className="flex items-center gap-20 pr-20" aria-hidden={dup === 1}>
              {LOGOS.map((logo) => (
                <span
                  key={logo}
                  className="text-lg font-medium tracking-[0.05em] text-white opacity-40 whitespace-nowrap"
                >
                  {logo}
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Testimonials */}
      <div className="js-testimonial-grid max-w-[1100px] mx-auto px-5 md:px-10 mt-[60px] grid grid-cols-1 md:grid-cols-3 gap-6">
        {TESTIMONIALS.map((t) => (
          <div
            key={t.name}
            className="js-testimonial js-rm glass rounded-[20px] p-8"
            style={{ borderLeft: "3px solid var(--neon-red)" }}
          >
            <div className="relative z-10">
              <p className="font-display italic text-base leading-[1.6] text-white/80 mb-6">
                &ldquo;{t.quote}&rdquo;
              </p>
              <div className="flex items-center gap-3">
                <span
                  className="w-12 h-12 rounded-full flex items-center justify-center text-lg font-semibold text-white flex-shrink-0"
                  style={{ backgroundColor: "var(--neon-red-soft)", border: "1px solid var(--neon-red-border)" }}
                >
                  {t.initials}
                </span>
                <div className="text-left">
                  <p className="text-[15px] font-semibold text-white">{t.name}</p>
                  <p className="text-[13px] text-white/50 mt-0.5">{t.title}</p>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

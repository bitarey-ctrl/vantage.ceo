"use client";

import { useRef } from "react";
import { useGSAP } from "@gsap/react";
import { gsap, prefersReducedMotion } from "@/lib/gsap/register";

/*
 * "How it works" — sticky numbered showcase.
 *
 * Desktop + full motion: a 400vh container with a position:sticky 100vh
 * viewport. The four step blocks (each 100vh) slide upward via a scrubbed
 * yPercent tween while the right-hand visual crossfades to match, progress
 * dots track the active step, and short red connectors draw between steps.
 *
 * Mobile (<768px) or prefers-reduced-motion: no sticky, no scrub — blocks
 * stack vertically with a thin red divider and fade in individually.
 */

const STEPS = [
  {
    n: "01",
    title: "Signal",
    body: "We scan 200+ sources daily — news, regulation, competitors, macro shifts. Not everything. Only what matters to your business.",
    icon: (
      <svg viewBox="0 0 24 24" className="w-10 h-10" fill="none" stroke="var(--neon-red)" strokeWidth={1.5}>
        <circle cx="12" cy="12" r="9" />
        <circle cx="12" cy="12" r="5" opacity="0.6" />
        <circle cx="12" cy="12" r="1" fill="var(--neon-red)" stroke="none" />
        <path d="M12 12 L18.5 5.5" />
      </svg>
    ),
    mock: (
      <div className="p-6 space-y-3">
        <p className="text-[10px] uppercase tracking-[0.2em] text-white/40">Signals · ranked by urgency</p>
        {[
          ["Act this week", "EU AI Act enforcement guidance lands"],
          ["Decide this month", "Category leader raises $40M to go down-market"],
          ["Watch", "Fed signals two rate cuts by year end"],
        ].map(([tag, title]) => (
          <div key={title} className="rounded-xl border border-white/[0.08] bg-black/40 p-4">
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: "var(--neon-red)" }} />
              <span className="text-[10px] uppercase tracking-[0.15em] text-white/50">{tag}</span>
            </div>
            <p className="mt-1.5 text-sm text-white/90 leading-snug">{title}</p>
          </div>
        ))}
      </div>
    ),
  },
  {
    n: "02",
    title: "Consequence",
    body: "Every signal gets mapped to a specific consequence for your company. Not 'AI is growing' — but 'your pricing model has 90 days before it's obsolete.'",
    icon: (
      <svg viewBox="0 0 24 24" className="w-10 h-10" fill="none" stroke="var(--neon-red)" strokeWidth={1.5}>
        <path d="M4 12 H10 M10 12 C14 12 14 6 18 6 M10 12 C14 12 14 18 18 18" />
        <circle cx="20" cy="6" r="1.5" />
        <circle cx="20" cy="18" r="1.5" />
      </svg>
    ),
    mock: (
      <div className="p-6 space-y-4">
        <p className="text-[10px] uppercase tracking-[0.2em] text-white/40">Consequence map</p>
        <div className="rounded-xl border p-4" style={{ borderColor: "var(--neon-red-border)", backgroundColor: "var(--neon-red-soft)" }}>
          <p className="text-[10px] uppercase tracking-[0.15em]" style={{ color: "var(--neon-red)" }}>So what?</p>
          <p className="mt-1.5 text-sm text-white/90 leading-snug">
            Your payment margin takes a direct 0.4% hit in 30 days unless you switch processors now.
          </p>
        </div>
        <div className="flex gap-3">
          {["If you act", "If you wait"].map((t) => (
            <div key={t} className="flex-1 rounded-xl border border-white/[0.08] bg-black/40 p-3">
              <p className="text-[10px] uppercase tracking-[0.15em] text-white/50">{t}</p>
              <div className="mt-2 h-1.5 rounded-full bg-white/10" />
              <div className="mt-1.5 h-1.5 w-2/3 rounded-full bg-white/10" />
            </div>
          ))}
        </div>
      </div>
    ),
  },
  {
    n: "03",
    title: "Strategy",
    body: "For each consequence, a concrete strategic response. Time-bound. Resource-aware. Grounded in your actual context.",
    icon: (
      <svg viewBox="0 0 24 24" className="w-10 h-10" fill="none" stroke="var(--neon-red)" strokeWidth={1.5}>
        <circle cx="12" cy="12" r="7" />
        <path d="M12 2 V6 M12 18 V22 M2 12 H6 M18 12 H22" />
        <circle cx="12" cy="12" r="1" fill="var(--neon-red)" stroke="none" />
      </svg>
    ),
    mock: (
      <div className="p-6 space-y-3">
        <p className="text-[10px] uppercase tracking-[0.2em] text-white/40">Strategic response</p>
        {["30 days — renegotiate processor contract", "90 days — dual-provider failover live", "6 months — margin recovered +0.4%"].map((t) => (
          <div key={t} className="flex items-center gap-3 rounded-xl border border-white/[0.08] bg-black/40 p-3.5">
            <span className="w-1 h-6 rounded-full" style={{ backgroundColor: "var(--neon-red)" }} />
            <p className="text-sm text-white/85">{t}</p>
          </div>
        ))}
      </div>
    ),
  },
  {
    n: "04",
    title: "Decision",
    body: "Track what you decided, when, and why. Build institutional memory that makes every future decision sharper.",
    icon: (
      <svg viewBox="0 0 24 24" className="w-10 h-10" fill="none" stroke="var(--neon-red)" strokeWidth={1.5}>
        <circle cx="12" cy="12" r="9" />
        <path d="M8 12.5 L11 15.5 L16.5 9" />
      </svg>
    ),
    mock: (
      <div className="p-6 space-y-3">
        <p className="text-[10px] uppercase tracking-[0.2em] text-white/40">Decision log</p>
        {[
          ["Mar 12", "Switched payment processor", "Worked"],
          ["Apr 03", "Paused EU expansion 90 days", "Too early"],
          ["May 20", "Cut two low-margin contracts", "Worked"],
        ].map(([date, title, status]) => (
          <div key={title as string} className="flex items-center justify-between rounded-xl border border-white/[0.08] bg-black/40 p-3.5">
            <div>
              <p className="text-[10px] font-mono text-white/40">{date}</p>
              <p className="text-sm text-white/85">{title}</p>
            </div>
            <span className="text-[10px] uppercase tracking-[0.12em] px-2 py-1 rounded-full border border-white/[0.1] text-white/60">
              {status}
            </span>
          </div>
        ))}
      </div>
    ),
  },
];

export function ScrollTunnel() {
  const rootRef = useRef<HTMLElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const textColRef = useRef<HTMLDivElement>(null);
  const dotsRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const reduced = prefersReducedMotion();
      const mm = gsap.matchMedia();

      mm.add("(min-width: 768px) and (prefers-reduced-motion: no-preference)", () => {
        const visuals = gsap.utils.toArray<HTMLElement>(".js-tun-visual");
        const conns = gsap.utils.toArray<SVGPathElement>(".js-tun-conn");
        const dots = dotsRef.current ? Array.from(dotsRef.current.children) : [];

        gsap.set(visuals, { opacity: 0 });
        gsap.set(visuals[0], { opacity: 1 });
        conns.forEach((c) => gsap.set(c, { strokeDasharray: 1, strokeDashoffset: 1 }));

        const setDot = (idx: number) => {
          dots.forEach((d, i) => {
            (d as HTMLElement).style.backgroundColor =
              i === idx ? "var(--neon-red)" : "rgba(255,255,255,0.15)";
          });
        };
        setDot(0);

        const tl = gsap.timeline({
          scrollTrigger: {
            trigger: wrapRef.current,
            start: "top top",
            end: "bottom bottom",
            scrub: 0.5,
            onUpdate: (self) => setDot(Math.min(3, Math.floor(self.progress * 4))),
          },
        });

        tl.to(textColRef.current, { yPercent: -75, ease: "none", duration: 3 }, 0);

        for (let i = 1; i < STEPS.length; i++) {
          tl.to(visuals[i - 1], { opacity: 0, duration: 0.25, ease: "none" }, i - 0.125);
          tl.to(visuals[i], { opacity: 1, duration: 0.25, ease: "none" }, i - 0.125);
        }
        conns.forEach((c, i) => {
          tl.to(c, { strokeDashoffset: 0, duration: 0.3, ease: "none" }, i + 0.45);
        });
      });

      mm.add("(max-width: 767px), (prefers-reduced-motion: reduce)", () => {
        gsap.utils.toArray<HTMLElement>(".js-tun-step").forEach((card) => {
          gsap.fromTo(
            card,
            reduced ? { opacity: 0 } : { opacity: 0, y: 30 },
            {
              opacity: 1,
              y: 0,
              duration: reduced ? 0.4 : 0.8,
              ease: "power3.out",
              scrollTrigger: { trigger: card, start: "top 85%", once: true },
            }
          );
        });
      });
    },
    { scope: rootRef }
  );

  return (
    <section ref={rootRef} className="py-20 md:py-[120px]">
      <div className="max-w-[1200px] mx-auto px-5 md:px-10">
        <p className="text-xs uppercase tracking-[0.2em] mb-4" style={{ color: "var(--neon-red)" }}>
          How It Works
        </p>
        <h2 className="font-display text-[32px] md:text-[48px] leading-[1.1] text-white mb-[60px]">
          Four steps from noise to action.
        </h2>
      </div>

      <div ref={wrapRef} className="relative md:motion-safe:h-[400vh]">
        <div className="md:motion-safe:sticky md:motion-safe:top-0 md:motion-safe:h-screen md:motion-safe:overflow-hidden">
          {/* Progress dots */}
          <div
            ref={dotsRef}
            className="hidden md:motion-safe:flex absolute top-10 left-1/2 -translate-x-1/2 gap-3 z-10"
          >
            {STEPS.map((s) => (
              <span
                key={s.n}
                className="w-2 h-2 rounded-full transition-colors duration-300"
                style={{ backgroundColor: "rgba(255,255,255,0.15)" }}
              />
            ))}
          </div>

          <div className="max-w-[1200px] mx-auto px-5 md:px-10 md:motion-safe:h-full flex flex-col md:motion-safe:flex-row md:motion-safe:gap-20">
            {/* Text column */}
            <div className="md:motion-safe:w-[45%] md:motion-safe:h-full md:motion-safe:overflow-hidden">
              <div ref={textColRef} className="flex flex-col will-change-transform">
                {STEPS.map((step, i) => (
                  <div key={step.n} className="contents">
                    {i > 0 && (
                      <div
                        aria-hidden
                        className="md:motion-safe:hidden w-[2px] h-12 mx-auto my-2 opacity-20"
                        style={{ backgroundColor: "var(--neon-red)" }}
                      />
                    )}
                    <div className="js-tun-step relative py-10 md:motion-safe:py-0 md:motion-safe:h-screen flex flex-col justify-center">
                      {/* Ghost number */}
                      <span
                        aria-hidden
                        className="absolute right-0 md:right-[-20px] top-1/2 -translate-y-1/2 text-[80px] md:text-[140px] font-bold leading-none opacity-[0.04] select-none"
                      >
                        {step.n}
                      </span>
                      <div className="mb-4">{step.icon}</div>
                      <h3 className="text-[28px] font-semibold text-white">{step.title}</h3>
                      <p className="mt-3 text-base text-white/50 leading-[1.7] max-w-[440px]">
                        {step.body}
                      </p>
                      {/* Connector — draws as the next step approaches (desktop) */}
                      {i < STEPS.length - 1 && (
                        <svg
                          aria-hidden
                          viewBox="0 0 2 64"
                          className="hidden md:motion-safe:block w-[2px] h-16 mt-8"
                        >
                          <path
                            className="js-tun-conn"
                            d="M1 0 V64"
                            pathLength={1}
                            stroke="var(--neon-red)"
                            strokeWidth={1}
                            opacity={0.3}
                            fill="none"
                          />
                        </svg>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Visual column (desktop full-motion only) */}
            <div className="hidden md:motion-safe:flex md:motion-safe:w-[55%] items-center justify-center">
              <div
                className="relative w-full max-w-[480px] aspect-[4/3] glass rounded-[20px] overflow-hidden"
                style={{ borderColor: "var(--neon-red-border)", boxShadow: "var(--neon-red-glow)" }}
              >
                {STEPS.map((step) => (
                  <div key={step.n} className="js-tun-visual absolute inset-0">
                    <div className="relative z-10 h-full">{step.mock}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

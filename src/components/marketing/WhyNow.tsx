"use client";

import { useRef } from "react";
import { BarChart3, Brain, Target } from "lucide-react";
import { useGSAP } from "@gsap/react";
import { gsap, prefersReducedMotion } from "@/lib/gsap/register";

/* Smooth upward trend for the chart card (decorative). */
const CHART_D =
  "M10 170 C 60 160, 90 150, 130 135 C 170 120, 200 110, 240 88 C 280 66, 320 52, 390 30";

export function WhyNow() {
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
        return;
      }

      gsap.from(".js-bento-card", {
        y: 30,
        opacity: 0,
        scale: 0.97,
        duration: 0.8,
        stagger: 0.12,
        ease: "power3.out",
        scrollTrigger: { trigger: ".js-bento", start: "top 80%", once: true },
      });

      /* Chart draws itself */
      const line = rootRef.current?.querySelector<SVGPathElement>(".js-why-line");
      if (line) {
        gsap.fromTo(
          line,
          { strokeDasharray: 1, strokeDashoffset: 1 },
          {
            strokeDashoffset: 0,
            duration: 3,
            ease: "power2.inOut",
            scrollTrigger: { trigger: ".js-bento", start: "top 75%", once: true },
          }
        );
      }

      /* 200+ counter */
      const counterEl = rootRef.current?.querySelector<HTMLElement>(".js-src-count");
      if (counterEl) {
        const proxy = { val: 0 };
        counterEl.textContent = "0+";
        gsap.to(proxy, {
          val: 200,
          duration: 2,
          ease: "power2.out",
          scrollTrigger: { trigger: ".js-bento", start: "top 80%", once: true },
          onUpdate: () => {
            counterEl.textContent = `${Math.round(proxy.val)}+`;
          },
        });
      }
    },
    { scope: rootRef }
  );

  return (
    <section id="why-now" ref={rootRef} className="py-20 md:py-[120px]">
      <div className="max-w-[1200px] mx-auto px-5 md:px-10">
        <div className="js-rm">
          <p className="text-xs uppercase tracking-[0.2em] mb-4" style={{ color: "var(--neon-red)" }}>
            Why Now
          </p>
          <h2 className="font-display text-[32px] md:text-[48px] leading-[1.1] text-white mb-4">
            The chief-of-staff gap is real.
          </h2>
          <p className="text-base text-white/50 max-w-[600px] mb-[60px] leading-relaxed">
            AI made information free — it didn&rsquo;t make judgment free. More companies
            than ever run on skeleton executive teams, and the layer between the world
            and the CEO is gone. VANTAGE is that layer.
          </p>
        </div>

        <div className="js-bento grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Chart card — spans two rows */}
          <div className="js-bento-card js-rm glass rounded-[20px] p-8 md:row-span-2 flex flex-col transition-colors duration-300 hover:border-[var(--neon-red-border)]">
            <div className="relative z-10 flex flex-col h-full">
              <Brain size={24} style={{ color: "var(--neon-red)" }} className="mb-4" />
              <h3 className="text-xl font-semibold text-white mb-2">AI that understands context</h3>
              <p className="text-sm text-white/50 leading-relaxed mb-6">
                Signals aren&rsquo;t generic headlines — each one is scored against your
                business model, your market, and the decisions you already made.
              </p>
              <div className="mt-auto">
                <svg viewBox="0 0 400 200" className="w-full" aria-hidden>
                  {[40, 90, 140].map((y) => (
                    <line key={y} x1="10" y1={y} x2="390" y2={y} stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
                  ))}
                  <path
                    className="js-why-line"
                    d={CHART_D}
                    pathLength={1}
                    stroke="var(--neon-red)"
                    strokeWidth={2}
                    fill="none"
                    strokeLinecap="round"
                  />
                  <circle cx="390" cy="30" r="4" fill="var(--neon-red)" />
                </svg>
                <p className="text-[11px] text-white/30 mt-3">
                  Relevance of surfaced signals as VANTAGE learns your business
                </p>
              </div>
            </div>
          </div>

          {/* Counter card */}
          <div className="js-bento-card js-rm glass rounded-[20px] p-8 transition-colors duration-300 hover:border-[var(--neon-red-border)]">
            <div className="relative z-10">
              <BarChart3 size={24} style={{ color: "var(--neon-red)" }} className="mb-4" />
              <p className="js-src-count text-[48px] font-bold text-white leading-none tabular-nums">200+</p>
              <h3 className="text-xl font-semibold text-white mt-3 mb-2">sources, one feed</h3>
              <p className="text-sm text-white/50 leading-relaxed">
                News, regulators, competitor moves, macro shifts — deduplicated, ranked,
                and mapped to what they mean for you.
              </p>
            </div>
          </div>

          {/* Text cards */}
          <div className="js-bento-card js-rm glass rounded-[20px] p-8 transition-colors duration-300 hover:border-[var(--neon-red-border)]">
            <div className="relative z-10">
              <Target size={24} style={{ color: "var(--neon-red)" }} className="mb-4" />
              <h3 className="text-xl font-semibold text-white mb-2">Not another dashboard</h3>
              <p className="text-sm text-white/50 leading-relaxed">
                No charts to interpret at midnight. VANTAGE hands you the consequence and
                the recommended move — you make the call.
              </p>
            </div>
          </div>

          <div className="js-bento-card js-rm glass rounded-[20px] p-8 md:col-start-2 transition-colors duration-300 hover:border-[var(--neon-red-border)]">
            <div className="relative z-10">
              <Brain size={24} style={{ color: "var(--neon-red)" }} className="mb-4" />
              <h3 className="text-xl font-semibold text-white mb-2">Built for founders, not analysts</h3>
              <p className="text-sm text-white/50 leading-relaxed">
                A human chief of staff costs $120K–$180K a year. VANTAGE starts at $79 a
                month and reads everything, every day.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

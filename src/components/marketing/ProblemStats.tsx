"use client";

import { useRef } from "react";
import { useGSAP } from "@gsap/react";
import { gsap, prefersReducedMotion } from "@/lib/gsap/register";

interface Stat {
  target: number;
  decimals: number;
  prefix: string;
  suffix: string;
  label: string;
}

const STATS: Stat[] = [
  { target: 73, decimals: 0, prefix: "", suffix: "%", label: "of CEO decisions lack data backing" },
  { target: 4.2, decimals: 1, prefix: "", suffix: "hrs", label: "per week lost to information triage" },
  { target: 2.1, decimals: 1, prefix: "$", suffix: "M", label: "average cost of a missed market signal" },
  { target: 89, decimals: 0, prefix: "", suffix: "%", label: "say they need better strategic intelligence" },
];

function format(stat: Stat, v: number): string {
  return `${stat.prefix}${v.toFixed(stat.decimals)}${stat.suffix}`;
}

export function ProblemStats() {
  const rootRef = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      if (prefersReducedMotion()) {
        gsap.fromTo(
          ".js-rm",
          { opacity: 0 },
          {
            opacity: 1,
            duration: 0.4,
            stagger: 0.05,
            scrollTrigger: { trigger: rootRef.current, start: "top 88%", once: true },
          }
        );
        return;
      }

      gsap.from(".js-stat-card", {
        y: 30,
        opacity: 0,
        duration: 0.8,
        stagger: 0.15,
        ease: "power3.out",
        scrollTrigger: { trigger: ".js-stat-grid", start: "top 80%", once: true },
      });

      gsap.utils.toArray<HTMLElement>(".js-stat-num").forEach((el, i) => {
        const stat = STATS[i];
        el.textContent = format(stat, 0);
        const proxy = { val: 0 };
        gsap.to(proxy, {
          val: stat.target,
          duration: 2,
          delay: i * 0.15,
          ease: "power2.out",
          scrollTrigger: { trigger: ".js-stat-grid", start: "top 80%", once: true },
          onUpdate: () => {
            el.textContent = format(stat, proxy.val);
          },
        });
      });
    },
    { scope: rootRef }
  );

  return (
    <section ref={rootRef} className="py-20 md:py-[120px]">
      <div className="max-w-[1200px] mx-auto px-5 md:px-10">
        <div className="js-rm">
          <p
            className="text-xs uppercase tracking-[0.2em] mb-4"
            style={{ color: "var(--neon-red)" }}
          >
            The Problem
          </p>
          <h2 className="font-display text-[32px] md:text-[48px] leading-[1.1] text-white mb-4">
            Operating CEOs are drowning in information they can&rsquo;t act on.
          </h2>
          <p className="text-base text-white/50 max-w-[600px] mb-[60px] leading-relaxed">
            Every morning the world moves — regulators, competitors, the
            platforms your business runs on. You have no chief of staff to
            filter it, and no time to become one.
          </p>
        </div>

        <div className="js-stat-grid grid grid-cols-2 lg:grid-cols-4 gap-6">
          {STATS.map((stat) => (
            <div key={stat.label} className="js-stat-card js-rm metric-card p-8 text-center">
              <p className="js-stat-num text-[40px] md:text-[56px] font-bold tracking-[-0.02em] text-white tabular-nums">
                {format(stat, stat.target)}
              </p>
              <p className="text-sm text-white/50 mt-2 leading-normal">{stat.label}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

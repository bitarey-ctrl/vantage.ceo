"use client";

import { useRef } from "react";
import Link from "next/link";
import { Check } from "lucide-react";
import { useGSAP } from "@gsap/react";
import { gsap, prefersReducedMotion } from "@/lib/gsap/register";
import { SectionAura } from "./SectionAura";

const TIERS = [
  {
    name: "SOLO",
    price: "$79",
    period: "/mo",
    blurb: "For founders flying solo",
    features: [
      "Daily intelligence briefing",
      "AI Advisor (50 queries/mo)",
      "Signal monitoring (3 categories)",
      "Decision tracker",
    ],
    cta: "Start free trial",
    href: "/signup",
    highlighted: false,
  },
  {
    name: "PRO",
    price: "$199",
    period: "/mo",
    blurb: "For CEOs who need the full picture",
    features: [
      "Everything in Solo",
      "Unlimited AI Advisor",
      "All signal categories",
      "Consequence mapping",
      "Strategy generation",
      "Weekly digest emails",
    ],
    cta: "Start free trial",
    href: "/signup",
    highlighted: true,
  },
  {
    name: "ENTERPRISE",
    price: "Custom",
    period: "",
    blurb: "For teams with complex needs",
    features: [
      "Everything in Pro",
      "Custom source integration",
      "Multi-user access",
      "Dedicated onboarding",
      "API access",
    ],
    cta: "Contact us",
    href: "mailto:hello@vantage.app",
    highlighted: false,
  },
];

export function Pricing() {
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
      // Side cards first, center card 0.05s later for emphasis
      gsap.from(".js-price-side", {
        y: 40,
        opacity: 0,
        duration: 0.8,
        stagger: 0.15,
        ease: "power3.out",
        scrollTrigger: { trigger: ".js-price-grid", start: "top 85%", once: true },
      });
      gsap.from(".js-price-center", {
        y: 40,
        opacity: 0,
        duration: 0.8,
        delay: 0.2,
        ease: "power3.out",
        scrollTrigger: { trigger: ".js-price-grid", start: "top 85%", once: true },
      });
    },
    { scope: rootRef }
  );

  return (
    <section
      id="pricing"
      ref={rootRef}
      className="relative overflow-hidden py-20 md:py-[120px]"
    >
      <SectionAura placement="top-right" intensity={0.8} size={560} />
      <div className="relative z-10 max-w-[1100px] mx-auto px-5 md:px-10">
        <div className="js-rm text-center">
          <p className="text-xs uppercase tracking-[0.2em] mb-4" style={{ color: "var(--neon-red)" }}>
            Pricing
          </p>
          <h2 className="font-display text-[32px] md:text-[48px] leading-[1.1] text-white mb-3">
            Priced for operators.
          </h2>
          <p className="text-lg text-white/50 mb-[60px]">
            Not enterprises. Not consultants. Operators.
          </p>
        </div>

        <div className="js-price-grid grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
          {TIERS.map((t) => (
            <div
              key={t.name}
              className={`js-rm relative rounded-[24px] p-10 ${
                t.highlighted ? "js-price-center md:scale-[1.02] z-[1]" : "js-price-side"
              }`}
              style={{
                backgroundColor: "rgba(255,255,255,0.03)",
                border: t.highlighted
                  ? "1px solid var(--neon-red-border)"
                  : "1px solid rgba(255,255,255,0.08)",
                boxShadow: t.highlighted ? "var(--neon-red-glow)" : undefined,
              }}
            >
              {t.highlighted && (
                <span
                  className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full px-4 py-1 text-xs text-white whitespace-nowrap"
                  style={{ backgroundColor: "var(--neon-red)" }}
                >
                  Most popular
                </span>
              )}
              <p className="text-base uppercase tracking-[0.1em] text-white/70 mb-2">{t.name}</p>
              <p className="text-[48px] font-bold text-white mb-2 leading-none">
                {t.price}
                {t.period && <span className="text-base font-normal text-white/50">{t.period}</span>}
              </p>
              <p className="text-sm text-white/50 mb-8">{t.blurb}</p>
              <ul className="flex flex-col gap-3.5">
                {t.features.map((f) => (
                  <li key={f} className="flex items-start gap-2.5 text-[15px] text-white/80">
                    <Check size={16} className="mt-0.5 flex-shrink-0" style={{ color: "var(--neon-red)" }} />
                    {f}
                  </li>
                ))}
              </ul>
              {t.href.startsWith("/") ? (
                <Link
                  href={t.href}
                  className={`block w-full mt-8 py-4 rounded-full text-center text-[15px] font-medium transition-all duration-200 ${
                    t.highlighted
                      ? "text-white hover:brightness-110"
                      : "text-white border border-white/15 hover:border-white/30 hover:bg-white/[0.03]"
                  }`}
                  style={t.highlighted ? { backgroundColor: "var(--neon-red)" } : undefined}
                >
                  {t.cta}
                </Link>
              ) : (
                <a
                  href={t.href}
                  className="block w-full mt-8 py-4 rounded-full text-center text-[15px] font-medium text-white border border-white/15 hover:border-white/30 hover:bg-white/[0.03] transition-all duration-200"
                >
                  {t.cta}
                </a>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

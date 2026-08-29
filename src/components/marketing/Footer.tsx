"use client";

import { useRef } from "react";
import Link from "next/link";
import { useGSAP } from "@gsap/react";
import { gsap, prefersReducedMotion } from "@/lib/gsap/register";

const TICKER = Array(6).fill("Command the signal. Eliminate the noise.").join(" · ") + " · ";

const MENU = [
  { label: "Product", href: "#product" },
  { label: "Pricing", href: "#pricing" },
  { label: "About", href: "#why-now" },
  { label: "Login", href: "/login" },
  { label: "Sign Up", href: "/signup" },
];

const CONNECT = [
  { label: "Twitter / X", href: "#" },
  { label: "LinkedIn", href: "#" },
];

export function Footer() {
  const rootRef = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      if (prefersReducedMotion()) {
        gsap.fromTo(
          rootRef.current,
          { opacity: 0 },
          {
            opacity: 1,
            duration: 0.4,
            scrollTrigger: { trigger: rootRef.current, start: "top 95%", once: true },
          }
        );
        return; // ticker stays static
      }

      gsap.from(rootRef.current, {
        opacity: 0,
        y: 20,
        duration: 0.8,
        ease: "power3.out",
        scrollTrigger: { trigger: rootRef.current, start: "top 90%", once: true },
      });

      // Ticker drifts only while the footer is on screen
      gsap.to(".js-ticker", {
        xPercent: -50,
        duration: 30,
        ease: "none",
        repeat: -1,
        scrollTrigger: {
          trigger: rootRef.current,
          start: "top bottom",
          end: "bottom top",
          toggleActions: "play pause resume pause",
        },
      });
    },
    { scope: rootRef }
  );

  return (
    <footer
      ref={rootRef}
      className="pt-[60px] px-5 md:px-10 pb-5"
      style={{
        backgroundColor: "#0a0a0a",
        borderTop: "1px solid rgba(255,255,255,0.08)",
      }}
    >
      <div className="max-w-[1200px] mx-auto grid grid-cols-1 md:grid-cols-3 gap-10 md:gap-12">
        {/* Brand */}
        <div>
          <p className="text-lg font-bold tracking-[-0.04em] text-white">
            <span style={{ color: "var(--neon-red)", textShadow: "var(--neon-red-text-glow)" }}>
              V
            </span>
            ANTAGE
          </p>
          <p className="text-sm text-white/40 mt-2">
            Strategic intelligence for operating CEOs.
          </p>
          <p className="text-xs text-white/30 mt-4">
            © {new Date().getFullYear()} VANTAGE. All rights reserved. · Made in Istanbul
          </p>
        </div>

        {/* Menu */}
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-white/40 mb-4">Menu</p>
          <ul className="space-y-2.5">
            {MENU.map((l) => (
              <li key={l.label}>
                {l.href.startsWith("/") ? (
                  <Link href={l.href} className="text-sm text-white/50 hover:text-white transition-colors">
                    {l.label}
                  </Link>
                ) : (
                  <a href={l.href} className="text-sm text-white/50 hover:text-white transition-colors">
                    {l.label}
                  </a>
                )}
              </li>
            ))}
          </ul>
        </div>

        {/* Connect */}
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-white/40 mb-4">Connect</p>
          <ul className="space-y-2.5">
            {CONNECT.map((l) => (
              <li key={l.label}>
                <a href={l.href} className="text-sm text-white/50 hover:text-white transition-colors">
                  {l.label}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Marquee ticker */}
      <div aria-hidden className="overflow-hidden mt-12 py-5 select-none">
        <div className="js-ticker flex whitespace-nowrap w-max">
          <span className="font-display text-[48px] text-white opacity-[0.04] leading-none pr-4">
            {TICKER}
          </span>
          <span className="font-display text-[48px] text-white opacity-[0.04] leading-none pr-4">
            {TICKER}
          </span>
        </div>
      </div>
    </footer>
  );
}

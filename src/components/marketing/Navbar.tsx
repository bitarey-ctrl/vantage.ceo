"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { useGSAP } from "@gsap/react";
import { gsap, prefersReducedMotion } from "@/lib/gsap/register";

const LINKS = [
  { label: "Product", href: "#product" },
  { label: "Pricing", href: "#pricing" },
  { label: "About", href: "#why-now" },
];

export function Navbar() {
  const rootRef = useRef<HTMLElement>(null);
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 50);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useGSAP(
    () => {
      if (prefersReducedMotion()) {
        gsap.fromTo(
          ".js-rm",
          { opacity: 0 },
          { opacity: 1, duration: 0.4, stagger: 0.05 }
        );
        return;
      }
      // Delay past the loading screen (1.8s count + 0.4s fade)
      gsap.from(".js-nav-item", {
        y: 10,
        opacity: 0,
        duration: 0.6,
        stagger: 0.08,
        ease: "power3.out",
        delay: 1.9,
      });
    },
    { scope: rootRef }
  );

  return (
    <nav
      ref={rootRef}
      className="fixed top-0 w-full z-50 h-[72px] px-5 md:px-10 transition-all duration-300"
      style={
        scrolled
          ? {
              backdropFilter: "blur(20px) saturate(140%)",
              WebkitBackdropFilter: "blur(20px) saturate(140%)",
              backgroundColor: "rgba(0,0,0,0.6)",
              borderBottom: "1px solid rgba(255,255,255,0.06)",
            }
          : { backgroundColor: "transparent", borderBottom: "1px solid transparent" }
      }
    >
      <div className="h-full flex items-center justify-between">
        {/* Wordmark */}
        <Link
          href="/"
          className="js-nav-item js-rm text-lg font-bold tracking-[-0.04em] text-white"
          aria-label="VANTAGE home"
        >
          <span
            style={{ color: "var(--neon-red)", textShadow: "var(--neon-red-text-glow)" }}
          >
            V
          </span>
          ANTAGE
        </Link>

        {/* Desktop links */}
        <div className="hidden md:flex items-center gap-8">
          {LINKS.map((l) => (
            <a
              key={l.label}
              href={l.href}
              className="js-nav-item js-rm text-sm text-white/60 hover:text-white transition-colors duration-200"
            >
              {l.label}
            </a>
          ))}
          <Link
            href="/signup"
            className="js-nav-item js-rm group text-sm px-6 py-2.5 rounded-full border border-[var(--neon-red-border)] text-[var(--neon-red)] hover:bg-[var(--neon-red)] hover:text-white transition-colors duration-200"
          >
            Get Started{" "}
            <span className="inline-block transition-transform duration-200 group-hover:translate-x-1">
              →
            </span>
          </Link>
        </div>

        {/* Mobile hamburger */}
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open menu"
          className="js-nav-item js-rm md:hidden text-white p-2"
        >
          <Menu size={24} />
        </button>
      </div>

      {/* Mobile overlay */}
      {open && (
        <div
          className="fixed inset-0 z-[60] flex flex-col items-center justify-center gap-8"
          style={{
            backgroundColor: "rgba(0,0,0,0.95)",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
          }}
        >
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close menu"
            className="absolute top-6 right-6 text-white p-2"
          >
            <X size={24} />
          </button>
          {LINKS.map((l) => (
            <a
              key={l.label}
              href={l.href}
              onClick={() => setOpen(false)}
              className="text-2xl text-white/80 hover:text-white transition-colors"
            >
              {l.label}
            </a>
          ))}
          <Link
            href="/signup"
            onClick={() => setOpen(false)}
            className="mt-4 text-base px-8 py-3 rounded-full text-white"
            style={{ backgroundColor: "var(--neon-red)" }}
          >
            Get Started →
          </Link>
        </div>
      )}
    </nav>
  );
}

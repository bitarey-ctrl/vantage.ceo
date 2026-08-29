"use client";

import { useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { useGSAP } from "@gsap/react";
import { gsap, prefersReducedMotion } from "@/lib/gsap/register";

/*
 * Hero — native rebuild of the "VANTAGE Landing" Claude Design.
 *
 * Faithful port of the designed hero: a red radial glow, the 3D V-mark
 * (public/hero-v.png) with an ambient sway + horizon-glow pulse, a
 * Geist-Mono eyebrow pill, a serif headline with a drawn accent underline,
 * supporting copy, and two glass CTAs (the primary is magnetic).
 *
 * Motion is GSAP-only (per project convention). The entrance timeline is
 * offset by 1.9s to clear the LoadingScreen (1.8s count + 0.4s fade). All
 * ambient loops, the magnetic button, and the pointer tilt are disabled under
 * prefers-reduced-motion. The nav lives in <Navbar/>, so it's intentionally
 * not part of this section.
 */
export function Hero() {
  const rootRef = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const reduced = prefersReducedMotion();

      if (reduced) {
        gsap.fromTo(
          ".js-rm",
          { opacity: 0 },
          { opacity: 1, duration: 0.4, stagger: 0.05 }
        );
        return;
      }

      /* Entrance — offset past the loading screen */
      const tl = gsap.timeline({ defaults: { ease: "power3.out" }, delay: 1.9 });
      tl.from(".js-hero-pill", { y: 20, opacity: 0, filter: "blur(4px)", duration: 0.8 }, 0);
      tl.from(".js-hero-mark", { scale: 0.82, opacity: 0, y: 24, duration: 1.2 }, 0.25);
      tl.from(".js-hero-h1a", { y: 40, opacity: 0, duration: 1 }, 0.6);
      tl.fromTo(
        ".js-hero-underline",
        { scaleX: 0 },
        { scaleX: 1, transformOrigin: "left center", duration: 0.7 },
        1.0
      );
      tl.from(".js-hero-h1b", { y: 40, opacity: 0, duration: 1 }, 0.8);
      tl.from(".js-hero-body", { y: 20, opacity: 0, filter: "blur(6px)", duration: 0.8 }, 1.1);
      tl.from(".js-hero-btns", { y: 15, opacity: 0, scale: 0.96, duration: 0.6 }, 1.4);
      tl.fromTo(".js-hero-cue", { opacity: 0 }, { opacity: 1, duration: 0.6 }, 1.7);

      /* Ambient 3D sway on the V mark */
      gsap.to(".js-v-sway", {
        rotationY: 7,
        rotationX: -3,
        duration: 3.6,
        repeat: -1,
        yoyo: true,
        ease: "sine.inOut",
        transformOrigin: "center center",
      });

      /* Horizon-glow breathing pulse under the V */
      gsap.to(".js-v-horizon", {
        opacity: 0.35,
        scaleX: 1.12,
        duration: 1.7,
        repeat: -1,
        yoyo: true,
        ease: "sine.inOut",
      });

      /* Scroll-cue line drift */
      gsap.fromTo(
        ".js-hero-cue-line",
        { scaleY: 0.55, transformOrigin: "top center", opacity: 0.4 },
        {
          scaleY: 1,
          opacity: 0.9,
          duration: 1,
          repeat: -1,
          yoyo: true,
          ease: "sine.inOut",
        }
      );

      /* Gentle parallax — the mark leaves faster than the copy on scroll */
      gsap.to(".js-hero-mark", {
        y: () => window.innerHeight * 0.35,
        ease: "none",
        scrollTrigger: {
          trigger: rootRef.current,
          start: "top top",
          end: "bottom top",
          scrub: true,
        },
      });
      gsap.to(".js-hero-copy", {
        y: () => window.innerHeight * 0.16,
        ease: "none",
        scrollTrigger: {
          trigger: rootRef.current,
          start: "top top",
          end: "bottom top",
          scrub: true,
        },
      });

      /* Pointer tilt on the V (subtle, follows the cursor across the hero) */
      const root = rootRef.current;
      const parallax = root?.querySelector<HTMLElement>(".js-v-parallax");
      if (root && parallax) {
        const tiltX = gsap.quickTo(parallax, "rotationY", { duration: 0.6, ease: "power3.out" });
        const tiltY = gsap.quickTo(parallax, "rotationX", { duration: 0.6, ease: "power3.out" });
        const onMove = (e: PointerEvent) => {
          const r = root.getBoundingClientRect();
          const px = (e.clientX - r.left) / r.width - 0.5;
          const py = (e.clientY - r.top) / r.height - 0.5;
          tiltX(px * 14);
          tiltY(-py * 10);
        };
        const onLeave = () => {
          tiltX(0);
          tiltY(0);
        };
        root.addEventListener("pointermove", onMove);
        root.addEventListener("pointerleave", onLeave);
      }

      /* Magnetic primary CTA */
      const mag = root?.querySelector<HTMLElement>(".js-magnetic");
      if (root && mag) {
        const mx = gsap.quickTo(mag, "x", { duration: 0.5, ease: "power3.out" });
        const my = gsap.quickTo(mag, "y", { duration: 0.5, ease: "power3.out" });
        const onMag = (e: PointerEvent) => {
          const r = mag.getBoundingClientRect();
          mx(((e.clientX - r.left) / r.width - 0.5) * 16);
          my(((e.clientY - r.top) / r.height - 0.5) * 12);
        };
        const onMagLeave = () => {
          mx(0);
          my(0);
        };
        mag.addEventListener("pointermove", onMag);
        mag.addEventListener("pointerleave", onMagLeave);
      }
    },
    { scope: rootRef }
  );

  return (
    <section
      ref={rootRef}
      id="top"
      className="relative min-h-screen flex flex-col items-center justify-center overflow-hidden px-6 text-center"
    >
      {/* Red radial wash behind the hero */}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(60% 46% at 50% 40%, rgba(255,45,45,0.10), transparent 62%)",
        }}
      />

      <div className="js-hero-copy relative z-[2] flex flex-col items-center">
        {/* Eyebrow pill */}
        <div
          className="js-hero-pill js-rm inline-flex items-center gap-2 rounded-full px-3.5 py-1.5"
          style={{
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.08)",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
          }}
        >
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ backgroundColor: "var(--neon-red)", boxShadow: "0 0 8px var(--neon-red)" }}
          />
          <span className="font-mono text-[12px] uppercase tracking-[0.16em] text-white/60">
            AI-powered strategic intelligence
          </span>
        </div>

        {/* 3D V mark */}
        <div
          className="js-hero-mark js-v-parallax relative my-8 h-[300px] w-[300px] will-change-transform md:h-[340px] md:w-[340px]"
          style={{ perspective: "1200px" }}
          aria-hidden
        >
          {/* Back bloom */}
          <div
            className="absolute left-1/2 top-[46%] h-[300px] w-[300px] -translate-x-1/2 -translate-y-1/2"
            style={{
              background:
                "radial-gradient(50% 50% at 50% 50%, rgba(255,45,45,0.22), transparent 70%)",
              filter: "blur(6px)",
            }}
          />
          {/* V image + sway */}
          <div className="js-v-sway absolute inset-0 flex items-center justify-center" style={{ transformStyle: "preserve-3d" }}>
            <Image
              src="/hero-v.png"
              alt="VANTAGE V mark"
              width={320}
              height={313}
              priority
              className="relative z-[2] h-auto w-[300px] md:w-[320px]"
              style={{
                filter:
                  "drop-shadow(0 26px 44px rgba(0,0,0,0.75)) drop-shadow(0 0 60px rgba(255,45,45,0.28))",
              }}
            />
          </div>
          {/* Horizon glow line */}
          <div
            className="js-v-horizon absolute left-1/2 top-[47%] h-[26px] w-[300px] -translate-x-1/2 -translate-y-1/2"
            style={{
              background:
                "radial-gradient(60% 100% at 50% 50%, rgba(255,45,45,0.55), transparent 72%)",
              filter: "blur(4px)",
            }}
          />
        </div>

        {/* Headline */}
        <h1 className="font-display text-white [font-size:clamp(40px,6.5vw,76px)] font-medium leading-[0.98] tracking-[-0.02em]">
          <span className="js-hero-h1a relative inline-block">
            Command the signal.
            <span
              className="js-hero-underline absolute left-0 right-0 bottom-1.5 h-[2px]"
              style={{
                backgroundColor: "var(--neon-red)",
                boxShadow: "0 0 10px rgba(255,45,45,0.6)",
              }}
            />
          </span>
          <br />
          <span className="js-hero-h1b inline-block text-white/50">
            Eliminate the noise.
          </span>
        </h1>

        {/* Subcopy */}
        <p className="js-hero-body mt-5 max-w-[600px] text-white/60 leading-relaxed [font-size:clamp(15px,1.8vw,17px)]">
          Strategic intelligence for operating CEOs who need clarity, not more
          dashboards. Your daily briefing, consequence map, and strategic
          advisor — in one place.
        </p>

        {/* CTAs */}
        <div className="js-hero-btns mt-8 flex flex-wrap items-center justify-center gap-4">
          {/* Primary — magnetic crimson glass (gradient values from the design spec) */}
          <Link
            href="/signup"
            className="js-magnetic inline-block rounded-[14px] px-7 py-[15px] text-[15px] font-medium text-white transition-[filter] duration-300 hover:brightness-110 will-change-transform"
            style={{
              background:
                "linear-gradient(180deg, rgba(196,48,43,0.95), rgba(120,22,20,0.95))",
              border: "1px solid rgba(255,120,90,0.45)",
              boxShadow:
                "0 0 34px rgba(255,45,45,0.32), inset 0 1px 0 rgba(255,190,170,0.32)",
              backdropFilter: "blur(20px)",
              WebkitBackdropFilter: "blur(20px)",
            }}
          >
            Get Started&nbsp;→
          </Link>

          {/* Secondary — frosted glass */}
          <a
            href="#product"
            className="inline-block rounded-[14px] px-7 py-[15px] text-[15px] font-medium text-white/90 transition-[background,border-color] duration-300 hover:border-white/25 hover:bg-white/[0.08]"
            style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.14)",
              backdropFilter: "blur(20px)",
              WebkitBackdropFilter: "blur(20px)",
            }}
          >
            See how it works
          </a>
        </div>
      </div>

      {/* Scroll cue */}
      <div className="js-hero-cue absolute bottom-[30px] left-1/2 flex -translate-x-1/2 flex-col items-center gap-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-white/35">
          Scroll
        </span>
        <span
          className="js-hero-cue-line h-[34px] w-px"
          style={{
            background: "linear-gradient(180deg, rgba(255,45,45,0.7), transparent)",
          }}
        />
      </div>
    </section>
  );
}

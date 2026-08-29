"use client";

import { useRef } from "react";
import { ArrowRight } from "lucide-react";
import { useGSAP } from "@gsap/react";
import { gsap, prefersReducedMotion } from "@/lib/gsap/register";

const BLOCKS = [
  {
    label: "DAILY BRIEFING",
    title: "Your morning starts with clarity.",
    body: "Every morning, a briefing tailored to your business. Not a newsletter — a strategic scan with consequences mapped and actions suggested. Takes 4 minutes to read. Saves 2 hours of context-switching.",
    flip: false,
    mock: (
      <div className="p-6 h-full flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <span className="text-lg font-bold" style={{ color: "var(--neon-red)" }}>V</span>
          <p className="text-xs text-white/50">what matters today, Tuesday</p>
        </div>
        <p className="text-sm text-white/90">Good morning, Alex.</p>
        <div className="grid grid-cols-3 gap-2">
          {[["Signals", "7"], ["Act now", "1"], ["Watch", "4"]].map(([l, v]) => (
            <div key={l} className="rounded-lg border border-white/[0.08] bg-black/40 p-3 text-center">
              <p className="text-xl font-bold text-white">{v}</p>
              <p className="text-[10px] uppercase tracking-[0.15em] text-white/40 mt-0.5">{l}</p>
            </div>
          ))}
        </div>
        <div className="flex-1 rounded-lg border p-3.5" style={{ borderColor: "var(--neon-red-border)", backgroundColor: "var(--neon-red-soft)" }}>
          <p className="text-[10px] uppercase tracking-[0.15em]" style={{ color: "var(--neon-red)" }}>● Act this week</p>
          <p className="mt-1.5 text-sm text-white/90 leading-snug">
            Your payment processor raises cross-border fees 0.4% in 30 days.
          </p>
        </div>
      </div>
    ),
  },
  {
    label: "AI ADVISOR",
    title: "Ask anything about your business landscape.",
    body: "An AI that knows your business context, your open decisions, your strategic priorities. It remembers what you told it last month. Not a chatbot — a strategist.",
    flip: true,
    mock: (
      <div className="p-6 h-full flex flex-col justify-center gap-3">
        <div className="ml-10 rounded-2xl rounded-tr-sm border border-white/[0.1] bg-white/[0.05] p-4">
          <p className="text-sm text-white/85">Should I raise a bridge round to extend runway?</p>
        </div>
        <div className="mr-6 rounded-2xl rounded-tl-sm border p-4" style={{ borderColor: "var(--neon-red-border)", backgroundColor: "var(--neon-red-soft)" }}>
          <p className="text-sm text-white/85 leading-relaxed">
            Before you raise: Tuesday&rsquo;s churn signal is the real problem. Cut your two
            lowest-margin contracts and you&rsquo;re default-alive by Q4 — raising now prices
            you at your weakest.
          </p>
        </div>
        <p className="text-[10px] uppercase tracking-[0.15em] text-white/30 text-center">
          Remembers your context — no setup needed
        </p>
      </div>
    ),
  },
  {
    label: "DECISION TRACKER",
    title: "Every decision documented. Every outcome measured.",
    body: "Log the call, the reasoning, and the deadline. VANTAGE follows up, scans for blind spots, and shows you what actually worked — so your judgment compounds.",
    flip: false,
    mock: (
      <div className="p-6 h-full flex flex-col justify-center gap-3">
        <p className="text-[10px] uppercase tracking-[0.2em] text-white/40">Decision timeline</p>
        {[
          ["Mar 12", "Switched payment processor", true],
          ["Apr 03", "Paused EU expansion 90 days", false],
          ["May 20", "Cut two low-margin contracts", true],
        ].map(([date, title, done]) => (
          <div key={title as string} className="flex items-center gap-3 rounded-xl border border-white/[0.08] bg-black/40 p-3.5">
            <span
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ backgroundColor: done ? "var(--neon-red)" : "rgba(255,255,255,0.25)" }}
            />
            <p className="text-[10px] font-mono text-white/40 w-12 flex-shrink-0">{date}</p>
            <p className="text-sm text-white/85">{title}</p>
          </div>
        ))}
      </div>
    ),
  },
];

export function ProductShowcase() {
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

      gsap.utils.toArray<HTMLElement>(".js-show-block").forEach((block) => {
        const flip = block.dataset.flip === "true";
        const text = block.querySelector(".js-show-text");
        const image = block.querySelector(".js-show-image");
        const tl = gsap.timeline({
          scrollTrigger: { trigger: block, start: "top 80%", once: true },
          defaults: { duration: 1, ease: "power3.out" },
        });
        tl.from(text, { x: flip ? 40 : -40, opacity: 0 }, 0);
        tl.from(image, { x: flip ? -40 : 40, opacity: 0 }, 0.2);
      });
    },
    { scope: rootRef }
  );

  /* 3D tilt — mousemove only (never fires on touch); skipped for reduced motion */
  const handleMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (prefersReducedMotion()) return;
    const el = e.currentTarget;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    el.style.transform = `perspective(1000px) rotateY(${px * 10}deg) rotateX(${-py * 10}deg)`;
  };
  const handleLeave = (e: React.MouseEvent<HTMLDivElement>) => {
    e.currentTarget.style.transform = "perspective(1000px) rotateX(0deg) rotateY(0deg)";
  };

  return (
    <section id="product" ref={rootRef} className="py-20 md:py-[120px]">
      <div className="max-w-[1200px] mx-auto px-5 md:px-10">
        <div className="js-rm">
          <p className="text-xs uppercase tracking-[0.2em] mb-4" style={{ color: "var(--neon-red)" }}>
            The Platform
          </p>
          <h2 className="font-display text-[32px] md:text-[48px] leading-[1.1] text-white">
            Not a prototype. Shipped and running.
          </h2>
        </div>

        {BLOCKS.map((block) => (
          <div
            key={block.label}
            data-flip={String(block.flip)}
            className="js-show-block js-rm grid grid-cols-1 md:grid-cols-2 gap-10 md:gap-[60px] items-center py-14 md:py-20"
          >
            {/* Mock */}
            <div className={block.flip ? "md:order-last" : ""}>
              <div
                onMouseMove={handleMove}
                onMouseLeave={handleLeave}
                className="js-show-image group glass rounded-[20px] overflow-hidden aspect-[16/10] border border-white/[0.08] transition-[box-shadow,border-color,transform] duration-500 hover:border-[var(--neon-red-border)] hover:shadow-[var(--neon-red-glow)]"
              >
                <div className="relative z-10 h-full">{block.mock}</div>
              </div>
            </div>

            {/* Text */}
            <div className="js-show-text">
              <p className="text-xs uppercase tracking-[0.2em] mb-3" style={{ color: "var(--neon-red)" }}>
                {block.label}
              </p>
              <h3 className="text-[26px] md:text-[32px] font-display text-white leading-[1.15] mb-4">
                {block.title}
              </h3>
              <p className="text-base text-white/50 leading-[1.7] mb-6">{block.body}</p>
              <a
                href="/signup"
                className="group inline-flex items-center gap-2 text-sm"
                style={{ color: "var(--neon-red)" }}
              >
                Learn more
                <ArrowRight size={14} className="transition-transform duration-200 group-hover:translate-x-1" />
              </a>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

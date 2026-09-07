import type { Metadata } from "next";
import { Cormorant_Garamond } from "next/font/google";

const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
  variable: "--font-display",
  display: "swap",
});

export const metadata: Metadata = {
  title: "VANTAGE — Command the signal. Eliminate the noise.",
  description:
    "Strategic intelligence for operating CEOs. Your daily briefing, consequence map, and strategic advisor — in one place.",
};

/*
 * Marketing layout — deliberately minimal.
 *
 * The landing page (Landing) is fully self-contained: it brings
 * its own background, scroll behaviour, and chrome via
 * vantage-landing.css, scoped under `.vlp`. So this layout does NOT wrap
 * children in SmoothScroll
 * (Lenis) or LoadingScreen — those belong to the OLD full marketing site and
 * would fight the landing's own scroll + intro. If/when the old marketing
 * stack is restored as the front door, bring those wrappers back with it.
 *
 * The Cormorant display font var is kept for the old marketing components,
 * which are still in the repo and may be re-mounted on a /product route.
 */
export default function MarketingLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <div className={`dark ${cormorant.variable}`}>{children}</div>;
}

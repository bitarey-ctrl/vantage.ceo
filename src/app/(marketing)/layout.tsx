import type { Metadata, Viewport } from "next";
import { Inter_Tight } from "next/font/google";
import { MarketingShell } from "@/components/marketing/MarketingShell";
import "./website.css";

const display = Inter_Tight({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-display",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://www.vantage.ceo"),
  title: { default: "VANTAGE: Decision intelligence for founders and CEOs", template: "%s | VANTAGE" },
  description:
    "See what changed, stress-test the decision, keep the record. Decision intelligence for founder-led companies. Try it free for 14 days.",
  openGraph: {
    title: "VANTAGE: Decision intelligence for founders and CEOs",
    description: "See what changed, stress-test the decision, keep the record. Decision intelligence for founder-led companies.",
    images: [{ url: "/logo.png", width: 1200, height: 630 }],
  },
};

export const viewport: Viewport = { themeColor: "#fbfbfb" };

// Public-site typography and colors are scoped separately from the workspace.
export default function MarketingLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <div className={display.variable}><MarketingShell>{children}</MarketingShell></div>;
}

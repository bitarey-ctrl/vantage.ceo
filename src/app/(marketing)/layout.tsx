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
  title: { default: "VANTAGE — Strategic intelligence for operating CEOs", template: "%s | VANTAGE" },
  description:
    "Connect market and competitor signals to your business. Weigh your options and keep the reasoning behind your next decision. Explore a free 14-day founder-led pilot.",
};

export const viewport: Viewport = { themeColor: "#fbfbfb" };

// Public-site typography and colors are scoped separately from the workspace.
export default function MarketingLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <div className={display.variable}><MarketingShell>{children}</MarketingShell></div>;
}

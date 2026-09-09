import type { Metadata, Viewport } from "next";
import { Inter, Geist_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Do NOT set maximumScale/userScalable=false — blocking pinch-zoom is an
  // accessibility failure. viewportFit=cover lets the safe-area insets used
  // by the mobile nav actually resolve on notched devices.
  viewportFit: "cover",
  themeColor: "#0A0A0A",
};

export const metadata: Metadata = {
  title: "VANTAGE — Strategic Intelligence Platform",
  description:
    "Strategic second brain for founders and CEOs. Consequence-mapped executive intelligence.",
  // Icons are driven entirely from here. The Next scaffold's
  // src/app/favicon.ico used to sit alongside this and won — the file
  // convention takes precedence over metadata — which is why the tab
  // showed the default triangle no matter what this said. That file is
  // deleted; these all resolve from public/, generated from
  // public/vantage-logo.png.
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "16x16 32x32 48x48" },
      { url: "/icon-192.png", type: "image/png", sizes: "192x192" },
      { url: "/icon-512.png", type: "image/png", sizes: "512x512" },
    ],
    shortcut: "/favicon.ico",
    apple: [{ url: "/apple-icon.png", type: "image/png", sizes: "180x180" }],
  },
  openGraph: {
    title: "VANTAGE — Command the Signal",
    description:
      "Strategic intelligence platform for CEOs. Command the signal. Eliminate the noise.",
    images: [{ url: "/logo.png", width: 1200, height: 630 }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning={true}
    >
      {/* No pre-paint theme script: VANTAGE is dark-only, and the palette
          lives on :root, so there is no class to set and nothing to flash. */}
      <body className="min-h-full" suppressHydrationWarning={true}>
        {children}
      </body>
    </html>
  );
}

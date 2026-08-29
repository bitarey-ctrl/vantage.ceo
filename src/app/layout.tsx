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
    icons: {
      icon: "/logo-transparent.png",
      apple: "/logo-transparent.png",
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
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('nocturne-theme');if(!t){t='dark';}if(t==='dark'){document.documentElement.classList.add('dark');}}catch(e){document.documentElement.classList.add('dark');}})();`
          }}
        />
        <link rel="icon" href="/logo-transparent.png" type="image/png" />
      </head>
      <body className="min-h-full" suppressHydrationWarning={true}>
        {children}
      </body>
    </html>
  );
}

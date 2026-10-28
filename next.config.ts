import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Strict mode for better React development experience
  reactStrictMode: true,

  // Dev-only: allow the dev server to be reached via 127.0.0.1 as well as
  // localhost (Next blocks cross-origin dev asset requests otherwise).
  allowedDevOrigins: ["127.0.0.1"],

  // Allow images from external sources
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**" },
    ],
  },

  // Headers for security
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },

  // The main app is /app (one maintained implementation; /test is an alias). Existing entry points and deep links
  // land on the same records there. Temporary (307) so a rollback restores the previous pages immediately.
  // Other existing pages (report, briefing, digital twin, blind spots, assessment, onboarding, admin) are unchanged.
  async redirects() {
    const app = (go: string) => `/app?go=${go}`;
    return [
      { source: "/command", destination: "/app", permanent: false },
      { source: "/signals", has: [{ type: "query", key: "focus", value: "(?<focus>[0-9a-fA-F-]{36})" }], destination: app("signals/:focus"), permanent: false },
      { source: "/signals", destination: app("signals"), permanent: false },
      { source: "/decisions", destination: app("decisions"), permanent: false },
      { source: "/decisions/:id([0-9a-fA-F-]{36})", destination: app("decisions/:id"), permanent: false },
      { source: "/strategies", destination: app("strategies"), permanent: false },
      { source: "/strategies/:id([0-9a-fA-F-]{36})", destination: app("strategies/:id"), permanent: false },
      { source: "/advisor", destination: app("advisor"), permanent: false },
      { source: "/profile", destination: app("company"), permanent: false },
      { source: "/settings", destination: app("settings"), permanent: false },
    ];
  },
};

export default nextConfig;

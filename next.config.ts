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

  // Redirect root to dashboard (middleware handles auth)
  async redirects() {
    return [];
  },
};

export default nextConfig;

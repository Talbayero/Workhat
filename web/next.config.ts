import type { NextConfig } from "next";
import path from "node:path";

// Security headers applied to every response.
// CSP is intentionally omitted here — Supabase auth uses inline scripts and
// dynamic eval that make a strict CSP hard to express without nonces.
// Add a nonce-based CSP if/when you adopt a custom auth UI.
const securityHeaders = [
  // Prevent this app from being embedded in iframes on other origins.
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  // Stop browsers from MIME-sniffing the content-type away from what we send.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Only send the origin (no path/query) as the referrer to external sites.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Disable XSS auditor — modern browsers use CSP instead, and the auditor
  // can itself be exploited (https://cheatsheetseries.owasp.org/cheatsheets).
  { key: "X-XSS-Protection", value: "0" },
  // Disable features the app doesn't need.
  {
    key: "Permissions-Policy",
    value: [
      "camera=()",
      "microphone=()",
      "geolocation=()",
      "interest-cohort=()",
    ].join(", "),
  },
];

const nextConfig: NextConfig = {
  turbopack: {
    root: path.resolve(__dirname),
  },
  async headers() {
    return [
      {
        // Apply to every route.
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;

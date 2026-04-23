import type { NextConfig } from "next";

/**
 * glosse frontend.
 *
 * Proxying of /api/* to the FastAPI backend (localhost:8123 in dev) is
 * handled by the catch-all Route Handler at src/app/api/[...path]/route.ts.
 * Doing it there instead of via `rewrites()` gives us:
 *   - a single place that controls headers, methods, and body forwarding
 *   - visibility into every API call in the Next.js request log
 *   - no Turbopack-vs-next.config edge cases
 */

const FRONTEND_ROOT = __dirname;
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https: http://127.0.0.1:8123 http://localhost:8123",
  "font-src 'self' data:",
  "connect-src 'self' http://127.0.0.1:8123 http://localhost:8123",
].join("; ");

const SECURITY_HEADERS = [
  { key: "Content-Security-Policy", value: CONTENT_SECURITY_POLICY },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=()",
  },
];

function backendRemotePatterns() {
  const patterns: NonNullable<NonNullable<NextConfig["images"]>["remotePatterns"]> = [
    { protocol: "http", hostname: "127.0.0.1", port: "8123" },
    { protocol: "http", hostname: "localhost", port: "8123" },
  ];
  // Allow Railway or any other production backend hostname set via env var.
  // e.g. NEXT_PUBLIC_IMAGE_HOSTNAME=glosse-backend.up.railway.app
  const extraHost = process.env.NEXT_PUBLIC_IMAGE_HOSTNAME;
  if (extraHost) {
    patterns.push({ protocol: "https", hostname: extraHost });
  }
  return patterns;
}

const nextConfig: NextConfig = {
  images: {
    remotePatterns: backendRemotePatterns(),
  },
  outputFileTracingRoot: FRONTEND_ROOT,
  turbopack: {
    root: FRONTEND_ROOT,
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: SECURITY_HEADERS,
      },
    ];
  },
};

export default nextConfig;

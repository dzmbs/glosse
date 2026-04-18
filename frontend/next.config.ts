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

const BACKEND = process.env.INTERNAL_API_BASE ?? "http://127.0.0.1:8123";

function backendRemotePatterns() {
  const patterns: import("next").RemotePattern[] = [
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
  // Expose the backend URL to the Route Handler without a second env var.
  env: { GLOSSE_BACKEND: BACKEND },
};

export default nextConfig;

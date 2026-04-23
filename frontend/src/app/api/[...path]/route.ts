/**
 * Catch-all proxy to the FastAPI backend.
 *
 * Every browser-side call to `/api/*` lands here and is forwarded to the
 * Python service. Keeping the proxy in a Route Handler (rather than
 * `next.config.ts` rewrites) makes the data flow explicit: every request
 * shows up in the Next.js dev log with a single owner.
 *
 * Server Components skip this proxy entirely — they call the backend
 * directly through `lib/api.ts` using INTERNAL_API_BASE.
 */

import type { NextRequest } from "next/server";

const BACKEND =
  process.env.GLOSSE_BACKEND ??
  process.env.INTERNAL_API_BASE ??
  "http://127.0.0.1:8123";

const FORWARDED_REQUEST_HEADERS = new Set([
  "accept",
  "accept-language",
  "authorization",
  "content-type",
  "cookie",
  "range",
  "user-agent",
]);

const HOP_BY_HOP_RESPONSE_HEADERS = [
  "connection",
  "content-encoding",
  "content-length",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
];

function forwardedHeaders(req: NextRequest): Headers {
  const headers = new Headers();
  for (const [name, value] of req.headers) {
    const key = name.toLowerCase();
    if (FORWARDED_REQUEST_HEADERS.has(key)) {
      headers.set(name, value);
    }
  }
  return headers;
}

async function proxy(
  req: NextRequest,
  params: Promise<{ path: string[] }>,
): Promise<Response> {
  const { path } = await params;
  const encodedPath = path.map(encodeURIComponent).join("/");
  const target = `${BACKEND}/api/${encodedPath}${req.nextUrl.search}`;

  const init: RequestInit = {
    method: req.method,
    headers: forwardedHeaders(req),
    // Body is only meaningful for non-GET/HEAD.
    body:
      req.method === "GET" || req.method === "HEAD"
        ? undefined
        : await req.arrayBuffer(),
    // @ts-expect-error — Node fetch needs this for streaming bodies.
    duplex: "half",
    cache: "no-store",
  };

  const upstream = await fetch(target, init);

  // Pass through status + headers + body. Strip hop-by-hop + compression
  // headers that Next would otherwise double-apply.
  const outHeaders = new Headers(upstream.headers);
  for (const header of HOP_BY_HOP_RESPONSE_HEADERS) {
    outHeaders.delete(header);
  }

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: outHeaders,
  });
}

type Ctx = { params: Promise<{ path: string[] }> };

export const GET = (req: NextRequest, { params }: Ctx) => proxy(req, params);
export const POST = (req: NextRequest, { params }: Ctx) => proxy(req, params);
export const PUT = (req: NextRequest, { params }: Ctx) => proxy(req, params);
export const PATCH = (req: NextRequest, { params }: Ctx) => proxy(req, params);
export const DELETE = (req: NextRequest, { params }: Ctx) => proxy(req, params);

/**
 * Typed client for the glosse FastAPI backend.
 *
 * Works in both execution contexts:
 *   - Server Components / Route Handlers: use the absolute INTERNAL_API_BASE.
 *   - Client Components: use the relative /api path, which hits the Next
 *     rewrite defined in next.config.ts.
 *
 * Keep this file the single source of truth for API shapes. If the FastAPI
 * routes change, update the types here in the same commit.
 */

export type BookSummary = {
  id: string;
  title: string;
  authors: string[];
  chapters: number;
  progress: number;
  /** True once `glosse index <id>` has produced chunks.pkl. */
  has_chunks?: boolean;
  /** True when the source EPUB is still sitting in `data/inbox/`
   *  (picked up on server boot via scan_and_ingest_inbox). */
  in_inbox?: boolean;
};

export type LibraryResponse = {
  books: BookSummary[];
};

export type TOCNode = {
  title: string;
  href: string;
  file_href: string;
  anchor: string;
  children: TOCNode[];
};

export type SpineItem = {
  index: number;
  title: string;
  href: string;
};

export type BookDetail = {
  id: string;
  title: string;
  authors: string[];
  language: string;
  description: string | null;
  chapters_total: number;
  spine: SpineItem[];
  toc: TOCNode[];
  progress: number;
};

export type Chapter = {
  book_id: string;
  index: number;
  title: string;
  href: string;
  html: string;
  text: string;
  prev_index: number | null;
  next_index: number | null;
  progress: number;
  chapters_total: number;
};

export type PedagogyMode =
  | "learning"
  | "discussion"
  | "technical"
  | "story"
  | "fast";

export type GuideAction = "explain" | "quiz" | "summarize" | "ask";

export type GuideRequest = {
  book_id: string;
  chapter_index: number;
  mode?: PedagogyMode;
  action?: GuideAction;
  selection?: string | null;
  user_message?: string | null;
};

export type GuideResponse = {
  text: string;
  citations: Array<{
    chunk_id?: string;
    chapter_index: number;
    section_path?: string;
    text: string;
  }>;
  suggested: string[];
  /** Backend-owned diagnostics (provider, model, tool-call trace). Optional
   *  — present when the agent loop ran; absent when the stub short-circuits. */
  debug?: Record<string, unknown>;
};

// -- Internals ------------------------------------------------------------

function resolveBase(): string {
  // Server side: use the absolute URL (Node can't resolve relative).
  // Client side: use the relative path — handled by next.config.ts rewrites.
  if (typeof window === "undefined") {
    return process.env.INTERNAL_API_BASE ?? "http://127.0.0.1:8123";
  }
  return "";
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const base = resolveBase();
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    // Default to no caching so the library/reader always reflect latest
    // ingest + progress state. Tune per-call if needed.
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`[glosse api] ${init?.method ?? "GET"} ${path} → ${res.status}: ${body}`);
  }
  return res.json() as Promise<T>;
}

// -- Public --------------------------------------------------------------

export const api = {
  library: () => req<LibraryResponse>("/api/library"),
  book: (bookId: string) => req<BookDetail>(`/api/books/${bookId}`),
  chapter: (bookId: string, index: number) =>
    req<Chapter>(`/api/books/${bookId}/chapters/${index}`),
  guide: (payload: GuideRequest) =>
    req<GuideResponse>("/api/guide", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  setProgress: (bookId: string, chapterIndex: number) =>
    req<{ book_id: string; progress: number }>("/api/progress", {
      method: "POST",
      body: JSON.stringify({ book_id: bookId, chapter_index: chapterIndex }),
    }),
};

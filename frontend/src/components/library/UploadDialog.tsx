"use client";

/**
 * UploadDialog — click-to-upload EPUB + pick surface mode.
 *
 * Flow:
 *   1. User clicks "Add book" in the library.
 *   2. Dialog opens with a file picker and a 4-option surface picker
 *      (novel / study / article / focus). Default: novel.
 *   3. On submit we POST multipart to /api/library/upload. The backend
 *      runs the EPUB through the ingest pipeline and stores
 *      default_surface in meta.json.
 *   4. On success we router.refresh() the library and close the dialog —
 *      the uploaded book appears in the grid, opening it will start in
 *      the surface mode the user picked.
 */

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { Icon } from "@/components/Icons";
import { api, type SurfaceId } from "@/lib/api";
import { MODES, SURFACE_IDS } from "@/lib/modes";

type Status = "idle" | "uploading" | "error";

export function UploadDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [surface, setSurface] = useState<SurfaceId>("novel");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  // Reset local state whenever the dialog is closed.
  useEffect(() => {
    if (!open) {
      setFile(null);
      setSurface("novel");
      setStatus("idle");
      setError(null);
    }
  }, [open]);

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && status !== "uploading") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, status, onClose]);

  if (!open) return null;

  async function submit() {
    if (!file) {
      fileInputRef.current?.click();
      return;
    }
    setStatus("uploading");
    setError(null);
    try {
      await api.uploadBook(file, surface);
      // Pull the fresh library list from the server.
      router.refresh();
      onClose();
    } catch (e) {
      setStatus("error");
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <>
      <div
        className="fixed inset-0 z-50"
        onClick={() => status !== "uploading" && onClose()}
        style={{ background: "rgba(26,22,18,0.45)", animation: "fadeIn 0.18s ease" }}
      />
      <div
        className="fixed inset-0 z-50 flex items-center justify-center px-6"
        style={{ pointerEvents: "none" }}
      >
        <div
          className="w-full max-w-[480px] overflow-hidden rounded-2xl"
          onClick={(e) => e.stopPropagation()}
          style={{
            background: "var(--paper)",
            border: "1px solid var(--rule)",
            boxShadow: "0 30px 80px rgba(26,22,18,0.35), 0 8px 20px rgba(26,22,18,0.12)",
            pointerEvents: "auto",
            animation: "tweakIn 0.2s ease",
          }}
        >
          <header
            className="flex items-center gap-3 border-b"
            style={{
              padding: "18px 20px",
              borderColor: "var(--rule-soft)",
            }}
          >
            <div
              className="flex-1"
              style={{
                fontFamily: "var(--heading-stack)",
                fontSize: 20,
                fontWeight: 500,
                color: "var(--ink)",
              }}
            >
              Add a book
            </div>
            <button
              type="button"
              className="icon-btn"
              onClick={onClose}
              disabled={status === "uploading"}
              aria-label="Close"
            >
              <Icon.close size={16} />
            </button>
          </header>

          <div className="flex flex-col gap-6" style={{ padding: "22px 22px 6px" }}>
            {/* File picker */}
            <div className="flex flex-col gap-2">
              <SectionLabel>EPUB file</SectionLabel>
              <input
                ref={fileInputRef}
                type="file"
                accept=".epub,application/epub+zip"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="sr-only"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={status === "uploading"}
                className="flex w-full items-center justify-between rounded-[10px] text-left"
                style={{
                  padding: "12px 14px",
                  border: "1px dashed var(--rule)",
                  background: file ? "rgba(184,74,43,0.05)" : "transparent",
                  cursor: status === "uploading" ? "default" : "pointer",
                  color: "var(--ink)",
                  fontFamily: "var(--inter-stack)",
                  fontSize: 13,
                }}
              >
                <span
                  className="truncate"
                  style={{
                    color: file ? "var(--ink)" : "var(--ink-muted)",
                    maxWidth: "70%",
                  }}
                >
                  {file ? file.name : "Click to pick an .epub file"}
                </span>
                <span
                  style={{
                    fontFamily: "var(--mono-stack)",
                    fontSize: 11,
                    color: "var(--ink-muted)",
                  }}
                >
                  {file ? `${(file.size / 1024 / 1024).toFixed(1)} MB` : "choose…"}
                </span>
              </button>
            </div>

            {/* Surface mode picker */}
            <div className="flex flex-col gap-2">
              <SectionLabel>Book type</SectionLabel>
              <div className="grid grid-cols-2 gap-[6px]">
                {SURFACE_IDS.map((id) => {
                  const active = surface === id;
                  const spec = MODES[id];
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setSurface(id)}
                      disabled={status === "uploading"}
                      className="flex flex-col items-start gap-1 rounded-[10px] text-left"
                      style={{
                        padding: "10px 12px",
                        border: active ? "1px solid var(--ink)" : "1px solid var(--rule)",
                        background: active ? "var(--ink)" : "transparent",
                        color: active ? "var(--paper)" : "var(--ink)",
                        cursor: status === "uploading" ? "default" : "pointer",
                      }}
                    >
                      <span
                        className="capitalize"
                        style={{
                          fontFamily: "var(--inter-stack)",
                          fontSize: 13,
                          fontWeight: 600,
                        }}
                      >
                        {spec.label}
                      </span>
                      <span
                        style={{
                          fontFamily: "var(--inter-stack)",
                          fontSize: 11,
                          color: active ? "var(--paper)" : "var(--ink-muted)",
                          opacity: 0.85,
                        }}
                      >
                        {spec.sub}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {error && (
              <div
                style={{
                  fontFamily: "var(--mono-stack)",
                  fontSize: 12,
                  color: "var(--accent)",
                  whiteSpace: "pre-wrap",
                  padding: "8px 10px",
                  borderRadius: 8,
                  background: "rgba(184,74,43,0.08)",
                  border: "1px solid rgba(184,74,43,0.25)",
                }}
              >
                {error}
              </div>
            )}
          </div>

          <footer
            className="flex items-center justify-end gap-2"
            style={{ padding: "18px 22px 22px" }}
          >
            <button
              type="button"
              className="outline-btn"
              onClick={onClose}
              disabled={status === "uploading"}
            >
              Cancel
            </button>
            <button
              type="button"
              className="filled-btn"
              onClick={submit}
              disabled={status === "uploading" || !file}
            >
              {status === "uploading" ? "Ingesting…" : "Add to library"}
            </button>
          </footer>
        </div>
      </div>
    </>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="uppercase font-semibold"
      style={{
        fontFamily: "var(--inter-stack)",
        fontSize: 10.5,
        letterSpacing: 1.2,
        color: "var(--ink-muted)",
      }}
    >
      {children}
    </div>
  );
}

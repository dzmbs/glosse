import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

// @tursodatabase/database-wasm spins up a Worker that uses
// SharedArrayBuffer, which browsers only expose on cross-origin-isolated
// pages. That requires COOP + COEP response headers on every asset. Vite
// 6's `server.headers` option is unreliable for this — a tiny middleware
// plugin is the documented workaround.
//   https://web.dev/coop-coep/
function crossOriginIsolation(): Plugin {
  const setHeaders = (res: { setHeader: (k: string, v: string) => void }) => {
    res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
    res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
  };
  return {
    name: "glosse-cross-origin-isolation",
    configureServer(server) {
      server.middlewares.use((_req, res, next) => {
        setHeaders(res);
        next();
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use((_req, res, next) => {
        setHeaders(res);
        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), crossOriginIsolation()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  optimizeDeps: {
    exclude: ["@tursodatabase/database-wasm"],
  },
  build: {
    target: "esnext",
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return;

          if (id.includes("react-router")) return "router";
          if (id.includes("@tursodatabase/database-wasm")) return "turso";
          if (id.includes("pdfjs-dist")) return "pdf";
          if (id.includes("@ai-sdk/anthropic")) return "ai-sdk-anthropic";
          if (id.includes("@ai-sdk/openai")) return "ai-sdk-openai";
          if (id.includes("@ai-sdk/google")) return "ai-sdk-google";
          if (id.includes("ai-sdk-ollama")) return "ai-sdk-ollama";
        },
      },
    },
  },
});

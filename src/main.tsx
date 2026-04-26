import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import {
  createBrowserRouter,
  RouterProvider,
} from "react-router-dom";

import "./index.css";

const HydrateFallback = () => null;

const router = createBrowserRouter([
  {
    path: "/",
    HydrateFallback,
    lazy: async () => {
      const mod = await import("@/pages/LibraryPage");
      return { Component: mod.LibraryPage };
    },
  },
  {
    path: "/read/:bookId",
    HydrateFallback,
    lazy: async () => {
      const mod = await import("@/pages/ReaderPage");
      return { Component: mod.ReaderPage };
    },
  },
  {
    path: "/evals",
    HydrateFallback,
    lazy: async () => {
      const mod = await import("@/pages/EvalsPage");
      return { Component: mod.EvalsPage };
    },
  },
  {
    path: "/diag/pdf",
    HydrateFallback,
    lazy: async () => {
      const mod = await import("@/pages/DiagPdfPage");
      return { Component: mod.DiagPdfPage };
    },
  },
]);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);

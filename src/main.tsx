import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import {
  createBrowserRouter,
  RouterProvider,
} from "react-router-dom";

import "./index.css";

const router = createBrowserRouter([
  {
    path: "/",
    lazy: async () => {
      const mod = await import("@/pages/LibraryPage");
      return { Component: mod.LibraryPage };
    },
  },
  {
    path: "/read/:bookId",
    lazy: async () => {
      const mod = await import("@/pages/ReaderPage");
      return { Component: mod.ReaderPage };
    },
  },
  {
    path: "/evals",
    lazy: async () => {
      const mod = await import("@/pages/EvalsPage");
      return { Component: mod.EvalsPage };
    },
  },
]);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);

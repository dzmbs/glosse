import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import {
  createBrowserRouter,
  RouterProvider,
} from "react-router-dom";

import "./index.css";
import { LibraryPage } from "@/pages/LibraryPage";
import { ReaderPage } from "@/pages/ReaderPage";

const router = createBrowserRouter([
  { path: "/", element: <LibraryPage /> },
  { path: "/read/:bookId", element: <ReaderPage /> },
]);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);

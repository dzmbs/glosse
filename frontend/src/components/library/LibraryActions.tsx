"use client";

/**
 * LibraryActions — the "Add book" button in the library header. Split out
 * of the server-rendered library page so it can own the upload dialog's
 * open/close state without dragging the whole page into a client boundary.
 */

import { useState } from "react";

import { Icon } from "@/components/Icons";
import { UploadDialog } from "@/components/library/UploadDialog";

export function LibraryActions() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className="outline-btn"
        onClick={() => setOpen(true)}
      >
        <Icon.plus size={14} />
        <span style={{ marginLeft: 6 }}>Add book</span>
      </button>
      <UploadDialog open={open} onClose={() => setOpen(false)} />
    </>
  );
}

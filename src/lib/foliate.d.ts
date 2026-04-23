// Minimal typing for the foliate-js modules we consume. foliate-js has no
// official types; we declare just enough to keep our viewport code sane.

declare module "../../vendor/foliate-js/view.js" {
  export const makeBook: (file: Blob | File | string) => Promise<FoliateBook>;
}

declare global {
  interface HTMLElementTagNameMap {
    "foliate-view": FoliateView;
  }
}

export type FoliateTocItem = {
  label: string;
  href: string;
  subitems?: FoliateTocItem[];
};

export type FoliateBook = {
  sections: Array<{ id?: string; cfi?: string; linear?: string }>;
  toc?: FoliateTocItem[];
  metadata?: {
    title?: string | Record<string, string>;
    author?:
      | string
      | { name?: string }
      | Array<string | { name?: string }>;
    language?: string | string[];
  };
  rendition?: { layout?: string };
  getCover?: () => Promise<Blob | null>;
  resolveHref?: (href: string) => { index: number } | undefined;
};

export type FoliateRelocateDetail = {
  cfi: string;
  fraction?: number;
  tocItem?: { id?: string | number; label?: string; href?: string } | null;
  pageItem?: { label?: string } | null;
  range?: Range;
  index?: number;
  // From SectionProgress — coarse "pages" at 1500 chars each.
  location?: { current: number; next: number; total: number };
  section?: { current: number; total: number };
};

export type FoliateView = HTMLElement & {
  book?: FoliateBook;
  renderer?: HTMLElement & {
    next: () => Promise<void>;
    prev: () => Promise<void>;
    setAttribute: (name: string, value: string) => void;
  };
  open: (book: Blob | File | string | FoliateBook) => Promise<void>;
  goTo: (target: string | number) => Promise<void>;
  goToFraction: (n: number) => Promise<void>;
  next: () => Promise<void>;
  prev: () => Promise<void>;
  close?: () => void;
};

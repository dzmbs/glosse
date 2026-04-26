# PDF TOC fixtures

Test PDFs for `bench/test-toc-extract.ts`. Not committed (size). Download:

- `sicp.pdf` — https://web.mit.edu/alexmv/6.037/sicp.pdf  (deep TOC, dot leaders)
- `smith-wealth-of-nations.pdf` — https://www.ibiblio.org/ml/libri/s/SmithA_WealthNations_p.pdf  (long wrapped chapter titles)
- `euclid-elements.pdf` — https://archive.org/download/firstsixbooksofe00byrn/firstsixbooksofe00byrn.pdf  (no outline, no printed TOC; should yield no extraction)

Drop your own fixtures in here; `pnpm tsx bench/test-toc-extract.ts` picks up every `*.pdf`.

import test from "node:test";
import assert from "node:assert/strict";

import {
  SUPPORTED_EMBEDDING_DIMS,
  embeddingTableFor,
  isSupportedEmbeddingDim,
} from "../src/ai/db/schema.ts";

test("SUPPORTED_EMBEDDING_DIMS covers the four dims Phase 2 commits to", () => {
  assert.deepEqual([...SUPPORTED_EMBEDDING_DIMS].sort((a, b) => a - b), [
    768, 1024, 1536, 3072,
  ]);
});

test("embeddingTableFor builds the per-dim table name for every supported dim", () => {
  assert.equal(embeddingTableFor(768), "chunk_embeddings_768");
  assert.equal(embeddingTableFor(1024), "chunk_embeddings_1024");
  assert.equal(embeddingTableFor(1536), "chunk_embeddings_1536");
  assert.equal(embeddingTableFor(3072), "chunk_embeddings_3072");
});

test("isSupportedEmbeddingDim accepts exactly the declared set", () => {
  for (const dim of SUPPORTED_EMBEDDING_DIMS) {
    assert.equal(isSupportedEmbeddingDim(dim), true, `${dim} must be supported`);
  }
  assert.equal(isSupportedEmbeddingDim(512), false);
  assert.equal(isSupportedEmbeddingDim(2048), false);
  assert.equal(isSupportedEmbeddingDim(1537), false);
  assert.equal(isSupportedEmbeddingDim(0), false);
  assert.equal(isSupportedEmbeddingDim(-1), false);
});

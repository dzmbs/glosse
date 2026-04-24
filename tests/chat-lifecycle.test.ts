import test from "node:test";
import assert from "node:assert/strict";

import {
  canSendChatMessage,
  createOptimisticTurn,
  rollbackOptimisticTurn,
  shouldHydrateConversation,
} from "../src/ai/chat/lifecycle.ts";

test("inactive ask panels do not bootstrap conversation history", () => {
  assert.equal(shouldHydrateConversation(false), false);
  assert.equal(shouldHydrateConversation(true), true);
});

test("chat sends are blocked when disabled, loading, or empty", () => {
  assert.equal(
    canSendChatMessage({ enabled: false, loading: false, text: "hi" }),
    false,
  );
  assert.equal(
    canSendChatMessage({ enabled: true, loading: true, text: "hi" }),
    false,
  );
  assert.equal(
    canSendChatMessage({ enabled: true, loading: false, text: "   " }),
    false,
  );
  assert.equal(
    canSendChatMessage({ enabled: true, loading: false, text: "hi" }),
    true,
  );
});

test("rollbackOptimisticTurn removes both optimistic messages", () => {
  const seeded = createOptimisticTurn(
    [
      { id: "old-user", role: "user", content: "Earlier turn" },
      { id: "old-ai", role: "assistant", content: "Earlier answer" },
    ],
    { userId: "temp-user", assistantId: "temp-ai" },
    "New question",
  );

  const rolledBack = rollbackOptimisticTurn(seeded, {
    userId: "temp-user",
    assistantId: "temp-ai",
  });

  assert.deepEqual(rolledBack, [
    { id: "old-user", role: "user", content: "Earlier turn" },
    { id: "old-ai", role: "assistant", content: "Earlier answer" },
  ]);
});

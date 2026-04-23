export type ChatLifecycleMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  pending?: boolean;
};

export function shouldHydrateConversation(enabled: boolean): boolean {
  return enabled;
}

export function canSendChatMessage(input: {
  enabled: boolean;
  loading: boolean;
  text: string;
}): boolean {
  return input.enabled && !input.loading && input.text.trim().length > 0;
}

export function createOptimisticTurn(
  messages: ChatLifecycleMessage[],
  ids: { userId: string; assistantId: string },
  content: string,
): ChatLifecycleMessage[] {
  return [
    ...messages,
    {
      id: ids.userId,
      role: "user",
      content,
    },
    {
      id: ids.assistantId,
      role: "assistant",
      content: "",
      pending: true,
    },
  ];
}

export function rollbackOptimisticTurn(
  messages: ChatLifecycleMessage[],
  ids: { userId: string; assistantId: string },
): ChatLifecycleMessage[] {
  return messages.filter(
    (message) =>
      message.id !== ids.userId && message.id !== ids.assistantId,
  );
}

export const CHAT_MESSAGE_PAGE_SIZE = 100;

export interface ChatMessage {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string | null;
  message_type: 'text' | 'file' | 'lesson_proposal';
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface ChatMessageBroadcastRef {
  conversationId: string;
  messageId: string;
}

export function chatMessageRefFromBroadcast(payload: unknown): ChatMessageBroadcastRef | null {
  if (!payload || typeof payload !== 'object') return null;
  const row = payload as Record<string, unknown>;
  if (
    typeof row.conversation_id !== 'string' ||
    typeof row.message_id !== 'string'
  ) {
    return null;
  }
  return {
    conversationId: row.conversation_id,
    messageId: row.message_id,
  };
}

export function mergeChatMessages(prev: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
  if (incoming.length === 0) return prev;
  const byId = new Map<string, ChatMessage>();
  for (const message of prev) byId.set(message.id, message);
  for (const message of incoming) byId.set(message.id, message);
  return [...byId.values()].sort((a, b) => {
    const timeDifference = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    return timeDifference || a.id.localeCompare(b.id);
  });
}

import { describe, expect, it } from 'vitest';
import {
  CHAT_MESSAGE_PAGE_SIZE,
  chatMessageRefFromBroadcast,
  mergeChatMessages,
  type ChatMessage,
} from '../../src/lib/chatMessages';

function message(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    conversation_id: '00000000-0000-4000-8000-000000000010',
    sender_id: '00000000-0000-4000-8000-000000000020',
    content: 'hello',
    message_type: 'text',
    metadata: null,
    created_at: '2026-08-25T10:00:00.000Z',
    ...overrides,
  };
}

describe('chat capacity helpers', () => {
  it('keeps the initial message payload bounded', () => {
    expect(CHAT_MESSAGE_PAGE_SIZE).toBe(100);
  });

  it('accepts identifier-only broadcasts and rejects embedded message content', () => {
    const valid = {
      conversation_id: '00000000-0000-4000-8000-000000000010',
      message_id: '00000000-0000-4000-8000-000000000001',
    };
    expect(chatMessageRefFromBroadcast(valid)).toEqual({
      conversationId: valid.conversation_id,
      messageId: valid.message_id,
    });
    expect(chatMessageRefFromBroadcast({ message: message() })).toBeNull();
    expect(chatMessageRefFromBroadcast({ ...valid, message_id: null })).toBeNull();
  });

  it('merges older, duplicate, and updated rows in stable cursor order', () => {
    const first = message({ id: 'a', created_at: '2026-08-25T09:00:00.000Z' });
    const second = message({ id: 'b', created_at: '2026-08-25T10:00:00.000Z' });
    const updatedSecond = { ...second, content: 'updated' };
    const thirdAtSameTime = message({ id: 'c', created_at: second.created_at });

    const merged = mergeChatMessages([second], [thirdAtSameTime, first, updatedSecond]);

    expect(merged.map((row) => row.id)).toEqual(['a', 'b', 'c']);
    expect(merged[1]?.content).toBe('updated');
  });
});

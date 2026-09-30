import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Conversation } from '@/hooks/useChat';

const mocks = vi.hoisted(() => ({ messages: [] }));

vi.mock('@/hooks/useChat', () => ({
  useChatMessages: () => ({
    messages: mocks.messages,
    loading: false,
    loadingOlder: false,
    hasMore: false,
    loadOlder: vi.fn(),
    appendMessage: vi.fn(),
  }),
  sendMessage: vi.fn(),
  markConversationRead: vi.fn(),
  uploadChatFile: vi.fn(),
  updateChatEmailNotifyPrefs: vi.fn(),
}));
vi.mock('@/contexts/UserContext', () => ({ useUser: () => ({ user: null }) }));
vi.mock('@/hooks/useOrgTutorPolicy', () => ({ useOrgTutorPolicy: () => ({}) }));
vi.mock('@/lib/supabase', () => ({ supabase: { from: vi.fn() } }));
vi.mock('@/components/chat/MessageBubble', () => ({ default: () => null }));
vi.mock('@/components/chat/ChatFileUpload', () => ({ default: () => null }));
vi.mock('@/lib/i18n', () => ({
  useTranslation: () => ({
    t: (key: string) => ({
      'chat.roleParent': 'Tėvai / globėjai',
      'chat.roleTutor': 'Korepetitorius',
      'chat.roleStudent': 'Mokinys',
      'chat.roleAdmin': 'Administracija',
    }[key] || key),
  }),
}));

import ChatWindow from '@/components/chat/ChatWindow';

afterEach(cleanup);

function renderHeader(kind: Conversation['other_party_kind']) {
  render(<ChatWindow conversation={{
    conversation_id: 'conversation',
    other_user_id: 'counterparty',
    other_user_name: 'Agnė',
    other_user_email: 'parent@example.test',
    other_party_kind: kind,
    last_message_at: '2026-09-30T12:00:00Z',
    last_message_content: null,
    last_message_type: null,
    last_message_sender_id: null,
    last_message_created_at: null,
    unread_count: 0,
  }} />);
  return within(screen.getByText('Agnė').parentElement!);
}

describe('chat conversation header role', () => {
  it('identifies a parent as a parent instead of a tutor', () => {
    const header = renderHeader('parent');
    const badge = header.getByText('Tėvai / globėjai');
    expect(header.queryByText('Korepetitorius')).toBeNull();
    expect(badge.classList.contains('bg-rose-100')).toBe(true);
    expect(badge.classList.contains('text-rose-700')).toBe(true);
  });

  it.each([
    ['tutor', 'Korepetitorius', 'bg-violet-100'],
    ['student', 'Mokinys', 'bg-emerald-100'],
    ['org_admin', 'Administracija', 'bg-amber-100'],
  ] as const)('preserves the %s role label and badge', (kind, label, badgeClass) => {
    const badge = renderHeader(kind).getByText(label);
    expect(badge.classList.contains(badgeClass)).toBe(true);
  });
});

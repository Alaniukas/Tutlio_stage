import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  fetch: vi.fn(),
  students: [] as Array<Record<string, unknown>>,
  unregistered: [] as Array<Record<string, unknown>>,
}));
vi.mock('@/hooks/useChat', () => ({
  getOrCreateConversation: mocks.create,
  useMessageableStudents: () => ({ students: mocks.students, unregisteredStudents: mocks.unregistered, loading: false, fetch: mocks.fetch }),
}));
vi.mock('@/lib/i18n', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

import ConversationList from '@/components/chat/ConversationList';

beforeEach(() => {
  mocks.create.mockReset();
  mocks.fetch.mockReset();
  mocks.students = [{ student_id: 'registered', linked_user_id: 'confirmed-account', full_name: 'Registered student', email: null, role: 'student' }];
  mocks.unregistered = [{ student_id: 'unregistered', full_name: 'Armandas', email: 'unregistered@example.test' }];
});
afterEach(cleanup);

function showPicker(onConversationCreated = vi.fn()) {
  render(<ConversationList conversations={[]} activeId={null} onSelect={vi.fn()} loading={false} onConversationCreated={onConversationCreated} />);
  fireEvent.click(screen.getByTitle('chat.newConversation'));
  return onConversationCreated;
}

describe('new conversation account status', () => {
  it('shows the registration requirement for the reported student and blocks conversation creation until linked', () => {
    showPicker();
    const student = screen.getByRole('button', { name: 'Armandas chat.registrationPending' }) as HTMLButtonElement;
    expect(student.disabled).toBe(true);
    expect(screen.getByText('chat.registrationPendingHint')).toBeTruthy();
    fireEvent.click(student);
    expect(mocks.create).not.toHaveBeenCalled();
    expect((screen.getByRole('button', { name: /Registered student chat.roleStudent/ }) as HTMLButtonElement).disabled).toBe(false);
  });

  it.each(['null', 'rejected'])('shows an actionable error after a %s creation failure and allows retry', async (failure) => {
    if (failure === 'null') mocks.create.mockResolvedValueOnce(null);
    else mocks.create.mockRejectedValueOnce(new Error('network failure'));
    mocks.create.mockResolvedValueOnce('conversation-id');
    const created = showPicker();
    fireEvent.click(screen.getByRole('button', { name: /Registered student chat.roleStudent/ }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('chat.startConversationFailed'));
    expect(created).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /Registered student chat.roleStudent/ }));
    await waitFor(() => expect(created).toHaveBeenCalledWith('conversation-id', mocks.students[0]));
    expect(mocks.create).toHaveBeenCalledWith('confirmed-account');
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

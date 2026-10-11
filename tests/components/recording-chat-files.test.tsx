import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import RecordingChatFiles from '../../src/components/school/RecordingChatFiles';

vi.mock('@/lib/i18n', () => ({ useTranslation: () => ({ t: (key: string) => ({
  'school.recordings.chatTitle': 'Chat history',
  'school.recordings.chatLoading': 'Loading chat',
  'school.recordings.chatError': 'Refresh the recordings list and try again',
  'school.recordings.chatEmpty': 'The chat file is empty',
  'school.recordings.chatMissing': 'No matching Google Meet chat was found. It may still be processing or was not saved.',
  'school.recordings.chatRestricted': 'Google Drive is blocking access to this chat. Contact your school administrator.',
  'school.recordings.chatExpired': 'The chat viewing period has ended.',
  'school.recordings.chatAmbiguous': 'The chat could not be linked safely to one recording.',
  'school.recordings.chatMissingAdmin': 'Check that Meet saves the chat in the same linked folder as the video.',
  'school.recordings.chatRestrictedAdmin': 'Allow viewers to download the chat file in Google Drive sharing settings.',
} as Record<string, string>)[key] || key }) }));

const file = { id: 'chat-1', name: 'Lesson.sbv', streamUrl: '/api/school-lesson-recording-stream?t=chat' };
const fetchMock = vi.fn();

function openChat(container: HTMLElement) {
  const details = container.querySelector('details')!;
  details.open = true;
  fireEvent(details, new Event('toggle'));
}

describe('RecordingChatFiles', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('always shows a clear message below a recording that has no chat file', () => {
    render(<RecordingChatFiles files={[]} />);
    expect(screen.getByText('Chat history')).toBeTruthy();
    expect(screen.getByRole('status').textContent).toContain('No matching Google Meet chat was found');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('explains a Drive restriction and gives sharing instructions only to administrators', () => {
    const { rerender } = render(<RecordingChatFiles status="restricted" />);
    expect(screen.getByRole('status').textContent).toContain('Google Drive is blocking access');
    expect(screen.queryByText(/Allow viewers/)).toBeNull();
    rerender(<RecordingChatFiles status="restricted" canManage />);
    expect(screen.getByText(/Allow viewers/)).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('gives administrators a concrete check when Google Meet has not supplied a matching chat', () => {
    render(<RecordingChatFiles canManage />);
    expect(screen.getByText(/Check that Meet saves/)).toBeTruthy();
  });

  it.each([
    ['expired', 'The chat viewing period has ended.'],
    ['ambiguous', 'The chat could not be linked safely to one recording.'],
  ] as const)('explains the %s state without trying to fetch chat contents', (status, message) => {
    render(<RecordingChatFiles status={status} />);
    expect(screen.getByText(message)).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('loads on demand and renders formulas, links and HTML-looking messages as plain text', async () => {
    const text = 'Teacher: x² = 4\nhttps://example.org\n<img src=x onerror=alert(1)>';
    fetchMock.mockResolvedValue(new Response(text));
    const { container } = render(<RecordingChatFiles files={[file]} />);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText('Chat history')).toBeTruthy();
    openChat(container);
    await waitFor(() => expect(container.querySelector('pre')?.textContent).toBe(text));
    expect(container.querySelector('img')).toBeNull();
    expect(fetchMock).toHaveBeenCalledWith(file.streamUrl, expect.objectContaining({ credentials: 'same-origin', cache: 'no-store' }));
  });

  it('does not display a denied response body as a chat', async () => {
    fetchMock.mockResolvedValue(new Response('PRIVATE-DENIED-RESPONSE', { status: 403 }));
    const { container } = render(<RecordingChatFiles files={[file]} />);
    openChat(container);
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(container.textContent).not.toContain('PRIVATE-DENIED-RESPONSE');
    expect(screen.getByRole('alert').textContent).toBe('Refresh the recordings list and try again');
  });

  it('explains a Drive restriction applied after the recording list was loaded', async () => {
    fetchMock.mockResolvedValue(Response.json({ code: 'CHAT_ACCESS_RESTRICTED', error: 'PRIVATE-PROVIDER-DETAILS' }, { status: 403 }));
    const { container } = render(<RecordingChatFiles files={[file]} canManage />);
    openChat(container);
    expect((await screen.findByRole('alert')).textContent).toContain('Google Drive is blocking access');
    expect(screen.getByText(/Allow viewers/)).toBeTruthy();
    expect(container.textContent).not.toContain('PRIVATE-PROVIDER-DETAILS');
    expect(container.querySelector('pre')).toBeNull();
  });

  it('shows an empty chat message after successfully reading an empty file', async () => {
    fetchMock.mockResolvedValue(new Response(''));
    const { container } = render(<RecordingChatFiles files={[file]} />);
    openChat(container);
    expect(await screen.findByText('The chat file is empty')).toBeTruthy();
  });

  it('stops loading and explains a stalled chat request after the deadline', async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation(() => new Promise(() => {}));
    const { container } = render(<RecordingChatFiles files={[file]} />);
    openChat(container);
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(screen.getByRole('alert').textContent).toBe('Refresh the recordings list and try again');
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
  });

  it('cancels a pending chat read when the recording is removed', async () => {
    fetchMock.mockImplementation(() => new Promise(() => {}));
    const { container, rerender } = render(<RecordingChatFiles files={[file]} />);
    openChat(container);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    const signal = fetchMock.mock.calls[0][1].signal as AbortSignal;
    rerender(<RecordingChatFiles files={[]} />);
    expect(signal.aborted).toBe(true);
    expect(container.querySelector('details')).toBeNull();
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import RecordingChatFiles from '../../src/components/school/RecordingChatFiles';

vi.mock('@/lib/i18n', () => ({ useTranslation: () => ({ t: (key: string) => ({
  'school.recordings.chatTitle': 'Chat history',
  'school.recordings.chatLoading': 'Loading chat',
  'school.recordings.chatError': 'Refresh the recordings list and try again',
  'school.recordings.chatEmpty': 'The chat file is empty',
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

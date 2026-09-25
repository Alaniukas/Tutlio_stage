import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import LessonSettingsPage from '@/pages/LessonSettings';

const testState = vi.hoisted(() => ({
  profileReads: [] as Array<{ data: Record<string, unknown> | null; error: Error | null }>,
  profileUpdates: [] as Array<Record<string, unknown>>,
  updateError: null as Error | null,
}));

vi.mock('@/components/Layout', () => ({ default: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock('@/contexts/UserContext', () => ({ useUser: () => ({ user: { id: 'tutor-1' } }) }));
vi.mock('@/hooks/useOrgTutorPolicy', () => ({ useOrgTutorPolicy: () => ({ loading: false, isOrgTutor: false }) }));
vi.mock('@/hooks/useMarketMoney', () => ({ useMarketMoney: () => ({ fmt: (value: number) => String(value) }) }));
vi.mock('@/lib/i18n', () => ({ useTranslation: () => ({ t: (key: string) => key, tHtml: (key: string) => key }) }));
vi.mock('@/lib/backfillTutorMeetingLinks', () => ({ backfillTutorMeetingLinks: vi.fn(async () => {}) }));
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      if (table === 'profiles') {
        return {
          select: () => ({ eq: () => ({ single: async () => testState.profileReads.shift() }) }),
          update: (patch: Record<string, unknown>) => {
            testState.profileUpdates.push(patch);
            return {
              eq: () => ({
                select: () => ({
                  single: async () => testState.updateError
                    ? { data: null, error: testState.updateError }
                    : { data: { personal_meeting_link: patch.personal_meeting_link }, error: null },
                }),
              }),
            };
          },
        };
      }
      if (table === 'subjects') {
        return { select: () => ({ eq: () => ({ order: async () => ({ data: [], error: null }) }) }) };
      }
      throw new Error(`Unexpected table: ${table}`);
    },
  },
}));

describe('tutor personal meeting link loading', () => {
  beforeEach(() => {
    testState.profileReads = [];
    testState.profileUpdates = [];
    testState.updateError = null;
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal('alert', vi.fn());
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('keeps editing and saving disabled after a failed read, then restores the saved link on retry', async () => {
    testState.profileReads.push({ data: null, error: new Error('Network timeout') });
    render(<LessonSettingsPage />);

    const linkInput = screen.getByPlaceholderText('https://meet.google.com/xxx-xxxx-xxx') as HTMLInputElement;
    await screen.findByRole('alert');
    expect(linkInput.disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'common.save' }) as HTMLButtonElement).disabled).toBe(true);
    expect(testState.profileUpdates).toHaveLength(0);

    testState.profileReads.push({
      data: { personal_meeting_link: 'https://meet.google.com/saved-room', organization_id: null },
      error: null,
    });
    fireEvent.click(screen.getByRole('button', { name: 'stuSess.retryLoad' }));

    await waitFor(() => expect(linkInput.value).toBe('https://meet.google.com/saved-room'));
    expect(linkInput.disabled).toBe(false);
    expect((screen.getByRole('button', { name: 'common.save' }) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('saves an intentional change after a successful profile read', async () => {
    testState.profileReads.push({
      data: { personal_meeting_link: 'https://meet.google.com/old-room', organization_id: null },
      error: null,
    });
    render(<LessonSettingsPage />);
    const linkInput = screen.getByPlaceholderText('https://meet.google.com/xxx-xxxx-xxx') as HTMLInputElement;
    await waitFor(() => expect(linkInput.value).toBe('https://meet.google.com/old-room'));

    fireEvent.change(linkInput, { target: { value: 'https://meet.google.com/new-room' } });
    fireEvent.click(screen.getByRole('button', { name: 'common.save' }));

    await waitFor(() => expect(testState.profileUpdates).toEqual([
      { personal_meeting_link: 'https://meet.google.com/new-room' },
    ]));
  });

  it('retains the entered link when both saving and the follow-up profile read fail', async () => {
    testState.profileReads.push(
      { data: { personal_meeting_link: 'https://meet.google.com/saved-room', organization_id: null }, error: null },
      { data: null, error: new Error('Read timeout') },
    );
    testState.updateError = new Error('Write timeout');
    render(<LessonSettingsPage />);
    const linkInput = screen.getByPlaceholderText('https://meet.google.com/xxx-xxxx-xxx') as HTMLInputElement;
    await waitFor(() => expect(linkInput.value).toBe('https://meet.google.com/saved-room'));

    fireEvent.change(linkInput, { target: { value: 'https://meet.google.com/entered-room' } });
    fireEvent.click(screen.getByRole('button', { name: 'common.save' }));

    await screen.findByRole('alert');
    expect(linkInput.value).toBe('https://meet.google.com/entered-room');
    expect(linkInput.disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'common.save' }) as HTMLButtonElement).disabled).toBe(true);
  });
});

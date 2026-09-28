import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const translations = vi.hoisted(() => ({ t: (key: string) => key, locale: 'en' }));
vi.mock('../../src/lib/apiHelpers', () => ({ authHeaders: async () => ({ Authorization: 'Bearer test' }) }));
vi.mock('../../src/lib/i18n', () => ({ useTranslation: () => translations }));
import ConsultationNotesDialog from '../../src/components/consultations/ConsultationNotesDialog';

beforeEach(() => vi.clearAllMocks());
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const note = { id: 'n1', author_user_id: 'specialist', body: '<script>private plain text</script>', updated_at: '2026-09-28T10:00:00Z' };
const reply = (body: unknown) => ({ ok: true, json: async () => body });

it('shows parent notes as plain text without exposing any editor or write action', async () => {
  const fetcher = vi.fn(async () => reply({ notes: [note], canWrite: false, authorUserId: 'parent' }));
  vi.stubGlobal('fetch', fetcher);
  render(<ConsultationNotesDialog consultationId="booking1" onClose={() => {}} />);
  await screen.findByText(note.body);
  expect(document.querySelector('script')).toBeNull();
  expect(screen.queryByRole('textbox')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Save notes' })).toBeNull();
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(fetcher.mock.calls[0][0]).toBe('/api/school-consultation-notes?consultation_id=booking1');
});

it('lets the specialist edit only their own note and submits only booking scope and body', async () => {
  const own = { ...note, body: 'My earlier note' };
  const fetcher = vi.fn(async (_url: string, init?: RequestInit) => init?.method === 'POST'
    ? reply({ ok: true }) : reply({ notes: [own, { ...note, id: 'n2', author_user_id: 'previous-specialist', body: 'Earlier specialist' }], canWrite: true, authorUserId: 'specialist' }));
  vi.stubGlobal('fetch', fetcher);
  render(<ConsultationNotesDialog consultationId="booking1" onClose={() => {}} />);
  const editor = await screen.findByRole('textbox', { name: 'Notes for parents' });
  expect((editor as HTMLTextAreaElement).value).toBe(own.body);
  fireEvent.change(editor, { target: { value: 'Current specialist note' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save notes' }));
  await waitFor(() => expect(fetcher.mock.calls.some(call => call[1]?.method === 'POST')).toBe(true));
  const write = fetcher.mock.calls.find(call => call[1]?.method === 'POST')!;
  expect(JSON.parse(write[1]!.body as string)).toEqual({ consultation_id: 'booking1', body: 'Current specialist note' });
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(3));
});

it('clears a previous booking and discards its delayed private response when the selected booking changes', async () => {
  let resolveFirst!: (value: unknown) => void;
  const pending = new Promise(resolve => { resolveFirst = resolve; });
  const fetcher = vi.fn(async (url: string) => url.endsWith('booking1') ? pending
    : reply({ notes: [{ ...note, body: 'Second booking' }], canWrite: false }));
  vi.stubGlobal('fetch', fetcher);
  const view = render(<ConsultationNotesDialog consultationId="booking1" onClose={() => {}} />);
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
  view.rerender(<ConsultationNotesDialog consultationId="booking2" onClose={() => {}} />);
  await screen.findByText('Second booking');
  await act(async () => { resolveFirst(reply({ notes: [{ ...note, body: 'Stale first booking secret' }], canWrite: true })); await pending; });
  expect(screen.queryByText('Stale first booking secret')).toBeNull();
  expect(screen.queryByRole('textbox')).toBeNull();
  expect(screen.getByText('Second booking')).toBeTruthy();
});

it('clears an earlier private note when a later access check is denied', async () => {
  const fetcher = vi.fn(async (url: string) => url.endsWith('booking1')
    ? reply({ notes: [note], canWrite: false }) : { ok: false, json: async () => ({ error: 'Forbidden' }) });
  vi.stubGlobal('fetch', fetcher);
  const view = render(<ConsultationNotesDialog consultationId="booking1" onClose={() => {}} />);
  await screen.findByText(note.body);
  view.rerender(<ConsultationNotesDialog consultationId="booking2" onClose={() => {}} />);
  await screen.findByRole('alert');
  expect(screen.queryByText(note.body)).toBeNull();
});

import type { ComponentProps, InputHTMLAttributes } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import FindTutorModal from '@/components/FindTutorModal';

type Row = Record<string, any>;

const testState = vi.hoisted(() => ({
  availability: [] as Row[],
  sessions: [] as Row[],
  serverCap: 1000,
  failedTable: null as string | null,
  failureFrom: 1000,
  subjectsRead: false,
  tutorBreakMinutes: 0,
}));

vi.mock('@/lib/i18n', () => ({
  useTranslation: () => ({ t: (key: string) => key, dateFnsLocale: undefined }),
}));
vi.mock('@/lib/marketMoney', () => ({ fmtMoney: (price: number) => `€${price}` }));
vi.mock('@/components/ui/date-input', () => ({
  DateInput: (props: InputHTMLAttributes<HTMLInputElement>) => <input {...props} type="date" data-testid="search-date" />,
}));
vi.mock('@/components/ui/time-input', () => ({
  TimeInput: ({ value, onChange }: { value: string; onChange: (value: string) => void }) => (
    <input type="time" value={value} onChange={(event) => onChange(event.target.value)} />
  ),
}));
vi.mock('@/lib/orgVisibleTutors', () => ({
  getOrgVisibleTutors: async () => [
    { id: 'expired-tutor', full_name: 'September Tutor', break_between_lessons: 0 },
    { id: 'october-tutor', full_name: 'October Tutor', break_between_lessons: testState.tutorBreakMinutes },
  ],
}));
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      let selected = '*';
      let start = 0;
      let end = Number.POSITIVE_INFINITY;
      const filters: Array<(row: Row) => boolean> = [];
      const orders: Array<{ column: string; ascending: boolean }> = [];
      const query = {
        select: (columns: string) => { selected = columns; return query; },
        eq: (column: string, value: unknown) => { filters.push((row) => row[column] === value); return query; },
        in: (column: string, values: unknown[]) => { filters.push((row) => values.includes(row[column])); return query; },
        lt: (column: string, value: string) => { filters.push((row) => row[column] < value); return query; },
        gt: (column: string, value: string) => { filters.push((row) => row[column] > value); return query; },
        neq: (column: string, value: unknown) => { filters.push((row) => row[column] !== value); return query; },
        order: (column: string, options?: { ascending?: boolean }) => {
          orders.push({ column, ascending: options?.ascending !== false });
          return query;
        },
        range: (from: number, to: number) => { start = from; end = to; return query; },
        single: async () => ({ data: { tutor_license_count: 0 }, error: null }),
        then: (resolve: (result: { data: Row[] | null; error: { message: string } | null }) => unknown) => {
          if (testState.failedTable === table && start >= testState.failureFrom) {
            return Promise.resolve({ data: null, error: { message: 'Later page failed' } }).then(resolve);
          }
          let source: Row[];
          if (table === 'availability') source = testState.availability;
          else if (table === 'sessions') source = testState.sessions;
          else if (table === 'subjects') {
            testState.subjectsRead = true;
            source = [{ id: 'math', tutor_id: 'october-tutor', name: 'Matematika', price: 25, duration_minutes: 60 }];
          } else throw new Error(`Unexpected table: ${table}`);

          const filtered = source.filter((row) => filters.every((filter) => filter(row)));
          filtered.sort((left, right) => {
            for (const { column, ascending } of orders) {
              if (left[column] === right[column]) continue;
              return (left[column] < right[column] ? -1 : 1) * (ascending ? 1 : -1);
            }
            return 0;
          });
          const page = filtered.slice(start, Math.min(end + 1, start + testState.serverCap));
          const data = selected === '*' ? page : page.map((row) => Object.fromEntries(
            selected.split(',').map((column) => [column.trim(), row[column.trim()]]),
          ));
          return Promise.resolve({ data, error: null }).then(resolve);
        },
      };
      return query;
    },
  },
}));

const localTime = (hour: number) => new Date(2026, 9, 1, hour).toISOString();

async function openOctoberSearch(options: Partial<ComponentProps<typeof FindTutorModal>> = {}) {
  const onPickSlot = vi.fn();
  const props = { isOpen: true, orgId: 'pro-klase', onClose: vi.fn(), onPickSlot, orgAdminMode: true, ...options };
  const view = render(<FindTutorModal {...props} />);
  await waitFor(() => expect(testState.subjectsRead).toBe(true));
  for (const input of screen.getAllByTestId('search-date')) {
    fireEvent.change(input, { target: { value: '2026-10-01' } });
  }
  return { onPickSlot, view, props, search: screen.getByRole('button', { name: 'findLesson.search' }) as HTMLButtonElement };
}

describe('FindTutorModal paginated availability search', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-01T09:00:00.000Z'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    testState.serverCap = 1000;
    testState.failedTable = null;
    testState.subjectsRead = false;
    testState.tutorBreakMinutes = 0;
    testState.availability = Array.from({ length: 1334 }, (_, index) => ({
      id: String(index).padStart(5, '0'),
      tutor_id: index === 1000 ? 'october-tutor' : 'expired-tutor',
      day_of_week: new Date(2026, 9, 1).getDay(),
      start_time: '14:00',
      end_time: '18:00',
      is_recurring: true,
      specific_date: null,
      start_date: index === 1000 ? '2026-10-01' : '2026-09-01',
      end_date: index === 1000 ? '2026-12-31' : '2026-09-30',
      created_at: '2026-09-01T09:00:00.000Z',
      subject_ids: [],
    }));
    testState.sessions = Array.from({ length: 1001 }, (_, index) => ({
      id: String(index).padStart(5, '0'),
      tutor_id: index === 1000 ? 'october-tutor' : 'expired-tutor',
      start_time: localTime(index === 1000 ? 14 : 9),
      end_time: localTime(index === 1000 ? 16 : 10),
      status: 'scheduled',
    }));
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it.each([1000, 200])('loads October availability beyond row 1000 and excludes a later-page booking (server cap %i)', async (serverCap) => {
    testState.serverCap = serverCap;
    const { search, onPickSlot } = await openOctoberSearch();
    fireEvent.click(search);

    const available = await screen.findByRole('button', { name: /Matematika.*16:00.*18:00/ });
    expect(screen.getByText('October Tutor')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Matematika.*14:00/ })).toBeNull();
    expect(search.disabled).toBe(false);

    fireEvent.click(available);
    expect(onPickSlot).toHaveBeenCalledWith(expect.objectContaining({
      tutorId: 'october-tutor',
      start: new Date(2026, 9, 1, 16),
      end: new Date(2026, 9, 1, 18),
    }), undefined);
  });

  it.each(['availability', 'sessions'])('clears existing slots and stops loading when a later %s page fails', async (table) => {
    const { search } = await openOctoberSearch();
    fireEvent.click(search);
    await screen.findByRole('button', { name: /Matematika.*16:00.*18:00/ });

    // Keep a valid early-page rule so accepting an incomplete response would
    // still expose a bookable slot. The next search must fail as a whole.
    testState.availability[0] = { ...testState.availability[1000], id: '00000' };
    testState.failedTable = table;
    fireEvent.click(search);
    expect(search.disabled).toBe(true);

    await waitFor(() => expect(console.error).toHaveBeenCalled());
    await waitFor(() => expect(search.disabled).toBe(false));
    expect(screen.queryByText('October Tutor')).toBeNull();
    expect(screen.queryByRole('button', { name: /Matematika/ })).toBeNull();

    // A transient failed page can be retried without reopening the modal.
    testState.failedTable = null;
    fireEvent.click(search);
    await screen.findByRole('button', { name: /Matematika.*16:00.*18:00/ });
    expect(search.disabled).toBe(false);
  });

  function useBackToBackFixture() {
    testState.tutorBreakMinutes = 10;
    testState.availability = [{
      ...testState.availability[1000], start_time: '18:00', end_time: '19:00',
      is_recurring: false, specific_date: '2026-10-01', day_of_week: null,
    }];
    testState.sessions = [{
      id: 'existing-lesson', tutor_id: 'october-tutor',
      start_time: localTime(19), end_time: localTime(20), status: 'scheduled',
    }];
  }

  it.each([true, false])('offers a back-to-back lesson only after the admin enables the override (simple search: %s)', async (orgAdminMode) => {
    useBackToBackFixture();
    const { search, onPickSlot } = await openOctoberSearch({
      allowBreakOverride: true, orgAdminMode, frequencyEnabled: !orgAdminMode,
      initialPreferredWindows: [{ dayOfWeek: 4, startTime: '18:00', endTime: '20:00' }],
    });
    const override = screen.getByRole('checkbox', { name: 'findLesson.showWithoutBreaks' }) as HTMLInputElement;
    expect(override.checked).toBe(false);
    fireEvent.click(search);
    await screen.findByText('findLesson.noResults');

    fireEvent.click(override);
    expect(screen.queryByText('findLesson.noResults')).toBeNull();
    fireEvent.click(search);
    const available = await screen.findByRole('button', { name: /Matematika.*18:00.*19:00/ });
    fireEvent.click(available);
    expect(onPickSlot).toHaveBeenCalledWith(expect.objectContaining({
      start: new Date(2026, 9, 1, 18), end: new Date(2026, 9, 1, 19),
    }), undefined);

    fireEvent.click(override);
    expect(screen.queryByRole('button', { name: /Matematika/ })).toBeNull();
    fireEvent.click(search);
    await screen.findByText('findLesson.noResults');
  });

  it('keeps the break rule and hides the override unless the caller grants admin access', async () => {
    useBackToBackFixture();
    const { search } = await openOctoberSearch();
    expect(screen.queryByRole('checkbox', { name: 'findLesson.showWithoutBreaks' })).toBeNull();
    fireEvent.click(search);
    await screen.findByText('findLesson.noResults');
  });

  it('still excludes actual overlaps when searching without breaks', async () => {
    useBackToBackFixture();
    testState.sessions[0].start_time = new Date(2026, 9, 1, 18, 50).toISOString();
    const { search } = await openOctoberSearch({ allowBreakOverride: true });
    fireEvent.click(screen.getByRole('checkbox', { name: 'findLesson.showWithoutBreaks' }));
    fireEvent.click(search);
    await screen.findByText('findLesson.noResults');
    expect(screen.queryByRole('button', { name: /Matematika/ })).toBeNull();
  });

  it('applies the override to newly booked adjacent lessons while removing newly booked overlaps', async () => {
    useBackToBackFixture();
    const { search, view, props } = await openOctoberSearch({ allowBreakOverride: true });
    fireEvent.click(screen.getByRole('checkbox', { name: 'findLesson.showWithoutBreaks' }));
    fireEvent.click(search);
    await screen.findByRole('button', { name: /Matematika.*18:00.*19:00/ });
    view.rerender(<FindTutorModal {...props} busyIntervals={[{
      tutor_id: 'october-tutor', start: new Date(2026, 9, 1, 17), end: new Date(2026, 9, 1, 18),
    }]} />);
    expect(screen.getByRole('button', { name: /Matematika.*18:00.*19:00/ })).toBeTruthy();

    view.rerender(<FindTutorModal {...props} busyIntervals={[{
      tutor_id: 'october-tutor', start: new Date(2026, 9, 1, 18), end: new Date(2026, 9, 1, 19),
    }]} />);
    await waitFor(() => expect(screen.queryByRole('button', { name: /Matematika/ })).toBeNull());
  });

  it.each(['close', 'revoke'])('resets the override and clears results after %s', async (reason) => {
    useBackToBackFixture();
    const { search, view, props } = await openOctoberSearch({ allowBreakOverride: true });
    fireEvent.click(screen.getByRole('checkbox', { name: 'findLesson.showWithoutBreaks' }));
    fireEvent.click(search);
    await screen.findByRole('button', { name: /Matematika.*18:00.*19:00/ });

    view.rerender(<FindTutorModal {...props} isOpen={reason !== 'close'} allowBreakOverride={reason !== 'revoke'} />);
    view.rerender(<FindTutorModal {...props} />);
    expect((screen.getByRole('checkbox', { name: 'findLesson.showWithoutBreaks' }) as HTMLInputElement).checked).toBe(false);
    expect(screen.queryByRole('button', { name: /Matematika/ })).toBeNull();
  });
});

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import StudentScheduleSummary from '@/components/company/StudentScheduleSummary';

const state = vi.hoisted(() => ({
  templates: vi.fn(),
  sessions: vi.fn(),
  requests: [] as Array<{ table: string; ids: string[]; signal?: AbortSignal }>,
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      const request: (typeof state.requests)[number] = { table, ids: [] };
      const query: any = {
        select: () => query,
        in: (_column: string, ids: string[]) => { request.ids = ids; return query; },
        eq: () => query,
        abortSignal: (signal: AbortSignal) => { request.signal = signal; return query; },
        then: (resolve: any, reject: any) => {
          state.requests.push(request);
          return Promise.resolve().then(() => (table === 'sessions' ? state.sessions() : state.templates())).then(resolve, reject);
        },
      };
      return query;
    },
  },
}));

const template = (name = 'Lietuvių kalba') => ({
  id: 'series-a', day_of_week: 4, start_time: '16:55:00', end_time: '17:55:00', frequency: 'weekly',
  subject: [{ name, color: '#123456' }], tutor: [{ full_name: 'Test tutor' }],
});
const success = (data: unknown[]) => ({ data, error: null });
const failure = () => ({ data: null, error: { code: '522', message: 'Connection timed out' } });

beforeEach(() => {
  vi.clearAllMocks();
  state.requests.length = 0;
  state.templates.mockResolvedValue(success([template()]));
  state.sessions.mockResolvedValue(success([
    { id: 'lesson-a', status: 'completed' },
    { id: 'lesson-b', status: 'active' },
  ]));
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('Student schedule load failures', () => {
  it('shows the recurring schedule and real counters for all unique student pairings', async () => {
    render(<StudentScheduleSummary studentRowIds={['child-b', 'child-a', 'child-a']} />);
    expect(await screen.findByText('Lietuvių kalba')).toBeTruthy();
    expect(screen.getByText('16:55–17:55')).toBeTruthy();
    expect(screen.getByText('Pamokų jau turėjo: 1')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(state.requests.every(request => request.ids.join(',') === 'child-a,child-b')).toBe(true);
  });

  it('shows a retryable template error instead of claiming no recurring lessons or zero history', async () => {
    state.templates.mockResolvedValueOnce(failure());
    render(<StudentScheduleSummary studentRowIds={['child-a']} />);
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.queryByText('Pasikartojančių pamokų nėra.')).toBeNull();
    expect(screen.queryByText(/Pamokų jau turėjo:/)).toBeNull();
    expect(state.requests.every(request => request.signal?.aborted)).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Bandyti dar kartą' }));
    expect(await screen.findByText('Lietuvių kalba')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('does not publish a partial snapshot when the counter query fails', async () => {
    state.sessions.mockResolvedValueOnce(failure());
    render(<StudentScheduleSummary studentRowIds={['child-a']} />);
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.queryByText('Lietuvių kalba')).toBeNull();
    expect(screen.queryByText(/Pamokų jau turėjo:/)).toBeNull();
  });

  it('keeps the last successful snapshot after a failed refresh of the same child', async () => {
    const view = render(<StudentScheduleSummary studentRowIds={['child-a']} refreshKey={0} />);
    expect(await screen.findByText('Lietuvių kalba')).toBeTruthy();
    state.templates.mockResolvedValueOnce(failure());
    view.rerender(<StudentScheduleSummary studentRowIds={['child-a']} refreshKey={1} />);
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByText('Lietuvių kalba')).toBeTruthy();
    expect(screen.getByText('Pamokų jau turėjo: 1')).toBeTruthy();
  });

  it('hides the previous child while loading another child', async () => {
    const view = render(<StudentScheduleSummary studentRowIds={['child-a']} />);
    expect(await screen.findByText('Lietuvių kalba')).toBeTruthy();
    let resolveNext!: (value: unknown) => void;
    state.templates.mockReturnValueOnce(new Promise(resolve => { resolveNext = resolve; }));
    view.rerender(<StudentScheduleSummary studentRowIds={['child-b']} />);
    expect(screen.queryByText('Lietuvių kalba')).toBeNull();
    expect(screen.queryByText(/Pamokų jau turėjo:/)).toBeNull();
    await act(async () => { resolveNext(success([template('Matematika')])); });
    expect(await screen.findByText('Matematika')).toBeTruthy();
  });

  it('aborts the previous child and ignores its late response after switching cards', async () => {
    let resolvePrevious!: (value: unknown) => void;
    state.templates.mockReturnValueOnce(new Promise(resolve => { resolvePrevious = resolve; }));
    const view = render(<StudentScheduleSummary studentRowIds={['child-a']} />);
    await act(async () => {});
    state.templates.mockResolvedValue(success([template('Matematika')]));
    view.rerender(<StudentScheduleSummary studentRowIds={['child-b']} />);
    expect(await screen.findByText('Matematika')).toBeTruthy();
    expect(state.requests.filter(request => request.ids.includes('child-a')).every(request => request.signal?.aborted)).toBe(true);
    await act(async () => { resolvePrevious(success([template()])); });
    expect(screen.getByText('Matematika')).toBeTruthy();
    expect(screen.queryByText('Lietuvių kalba')).toBeNull();
  });

  it('bounds hung requests to 15 seconds and aborts both reads', async () => {
    vi.useFakeTimers();
    state.templates.mockReturnValue(new Promise(() => {}));
    state.sessions.mockReturnValue(new Promise(() => {}));
    render(<StudentScheduleSummary studentRowIds={['child-a']} />);
    await act(async () => { await vi.advanceTimersByTimeAsync(15_000); });
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.queryByText('Pasikartojančių pamokų nėra.')).toBeNull();
    expect(state.requests).toHaveLength(2);
    expect(state.requests.every(request => request.signal?.aborted)).toBe(true);
  });

  it('only shows an empty schedule and zero counters after successful empty reads', async () => {
    state.templates.mockResolvedValue(success([]));
    state.sessions.mockResolvedValue(success([]));
    render(<StudentScheduleSummary studentRowIds={['child-a']} />);
    expect(await screen.findByText('Pasikartojančių pamokų nėra.')).toBeTruthy();
    expect(screen.getByText('Pamokų jau turėjo: 0')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('does not query or render without a student identity', () => {
    const view = render(<StudentScheduleSummary studentRowIds={[]} />);
    expect(view.container.textContent).toBe('');
    expect(state.requests).toHaveLength(0);
  });
});

import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import JoinLessonButton, { joinOpensAtLabel } from '@/components/JoinLessonButton';

vi.mock('@/lib/joinTracking', () => ({ recordJoinClick: vi.fn() }));

const session = (start: Date) => ({
  id: 'sess-1',
  start_time: start.toISOString(),
  end_time: new Date(start.getTime() + 45 * 60_000).toISOString(),
  status: 'active',
  meeting_link: 'meet.google.com/abc-defg-hij',
});

describe('JoinLessonButton', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-07T10:00:00+03:00')); // Monday morning
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('is a real link inside the 30-minute join window', () => {
    render(
      <JoinLessonButton session={session(new Date('2026-09-07T10:20:00+03:00'))}>
        Prisijungti
      </JoinLessonButton>,
    );
    const link = screen.getByRole('link', { name: 'Prisijungti' });
    expect(link.getAttribute('href')).toBe('https://meet.google.com/abc-defg-hij');
    expect(link.getAttribute('aria-disabled')).toBeNull();
  });

  it('stays inert for a lesson on another day and says when it opens', () => {
    render(
      <JoinLessonButton session={session(new Date('2026-09-10T19:00:00+03:00'))}>
        Prisijungti
      </JoinLessonButton>,
    );
    const link = screen.getByRole('link', { name: 'Prisijungti' });
    expect(link.getAttribute('href')).toBeNull();
    expect(link.getAttribute('aria-disabled')).toBe('true');
    // Default test locale is Lithuanian; the label carries the local opening time.
    expect(screen.getByText(/09-10 18:30/)).toBeTruthy();
  });

  it('renders nothing without a meeting link or for a cancelled lesson', () => {
    const { container } = render(
      <JoinLessonButton session={{ ...session(new Date('2026-09-07T10:20:00+03:00')), status: 'cancelled' }}>
        Prisijungti
      </JoinLessonButton>,
    );
    expect(container.innerHTML).toBe('');
  });

  it('labels same-day openings with the time only', () => {
    expect(joinOpensAtLabel('2026-09-07T19:00:00+03:00', new Date('2026-09-07T10:00:00+03:00'))).toBe('18:30');
    expect(joinOpensAtLabel('2026-09-10T19:00:00+03:00', new Date('2026-09-07T10:00:00+03:00'))).toBe('09-10 18:30');
  });
});

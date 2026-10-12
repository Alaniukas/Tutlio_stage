import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { lt as dateFnsLocale } from 'date-fns/locale';
import { ParentLessonDetailModal, type ParentTutorContactPolicy } from '@/components/parent/ParentLessonDetailModal';
import { MOKSLO_VAISIAI_ORG_ID } from '@/lib/marketMoney';
import { lt } from '@/lib/i18n/lt';

vi.mock('@/lib/i18n', () => ({ useTranslation: () => ({ locale: 'lt', t: (key: string) => lt[key] ?? key }) }));
vi.mock('@/hooks/useMarketMoney', () => ({ useMarketMoney: () => ({
  fmt: (amount: number) => `${amount} EUR`, formatLessonCharge: (amount: number) => `${amount} EUR`, isPl: false,
}) }));
vi.mock('@/components/SessionFiles', () => ({ default: () => null }));
vi.mock('@/components/JoinLessonButton', () => ({ default: () => null }));
vi.mock('@/components/WhiteboardButton', () => ({ default: () => null }));
vi.mock('@/components/StatusBadge', () => ({ default: () => null }));
afterEach(() => cleanup());

function open(organizationId: string, cancellationDisabled: boolean) {
  const navigate = vi.fn();
  const policy: ParentTutorContactPolicy = {
    tutorId: 'tutor', tutorName: 'Teacher', tutorEmail: null, tutorPhone: null,
    cancellationHours: 24, cancellationFeePercent: 0, paymentTiming: 'after_lesson', paymentDeadlineHours: 24,
    organizationId, cancellationDisabled, rescheduleDisabled: false,
  };
  render(<ParentLessonDetailModal
    open onOpenChange={() => {}} childName="Ada" childId="child" tutorPolicy={policy}
    now={new Date('2030-10-01T10:00:00Z')} navigate={navigate} dateFnsLocale={dateFnsLocale}
    t={(key) => lt[key] ?? key}
    session={{ id: 'lesson', start_time: '2030-10-02T10:00:00Z', end_time: '2030-10-02T11:00:00Z',
      status: 'active', topic: 'Mathematics', paid: true, price: 25, meeting_link: null }}
  />);
  return navigate;
}

describe('parent lesson reschedule-only actions', () => {
  it('shows the requested MV help and routes the parent to rescheduling without a cancellation action', () => {
    const navigate = open(MOKSLO_VAISIAI_ORG_ID, true);
    expect(screen.queryByRole('button', { name: lt['studentDash.cancelLesson'] })).toBeNull();
    const email = screen.getByRole('link', { name: 'info@mokslovaisiai.lt' });
    expect(email.getAttribute('href')).toBe('mailto:info@mokslovaisiai.lt');
    expect(email.parentElement?.textContent).toBe('Jei nerandate tinkamos datos, susiekite su administratoriumi per susirašinėjimo funkciją arba parašykite el. paštu: info@mokslovaisiai.lt');
    fireEvent.click(screen.getByRole('button', { name: lt['studentDash.reschedule'] }));
    expect(navigate).toHaveBeenCalledWith('/parent/lessons?studentId=child', {
      state: { sessionId: 'lesson', flow: 'reschedule', returnTo: '/parent/calendar?studentId=child' },
    });
  });

  it('keeps ordinary cancellation available and does not expose MV contact information to another org', () => {
    open('another-org', false);
    expect(screen.getByRole('button', { name: lt['studentDash.cancelLesson'] })).toBeTruthy();
    expect(screen.getByRole('button', { name: lt['studentDash.reschedule'] })).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'info@mokslovaisiai.lt' })).toBeNull();
  });
});

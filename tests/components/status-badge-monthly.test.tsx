import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/i18n', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

import StatusBadge from '../../src/components/StatusBadge';

afterEach(cleanup);

describe('monthly billing lesson status', () => {
  it('shows reserved before the lesson and completed afterward without a per-lesson debt label', () => {
    const { rerender } = render(
      <StatusBadge status="active" paid={false} paymentStatus="pending" endTime="2030-10-01T13:00:00Z" treatUnpaidAsReserved />,
    );
    expect(screen.getByText('status.reserved')).toBeTruthy();

    rerender(<StatusBadge status="completed" paid={false} paymentStatus="confirmed" treatUnpaidAsReserved />);
    expect(screen.getByText('status.completed')).toBeTruthy();
    expect(screen.queryByText('status.completedUnpaid')).toBeNull();
  });

  it('keeps the unpaid label for lessons billed individually', () => {
    render(<StatusBadge status="completed" paid={false} paymentStatus="pending" />);
    expect(screen.getByText('status.completedUnpaid')).toBeTruthy();
  });
});

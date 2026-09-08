import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StudentConnectionStatus } from '@/components/StudentConnectionStatus';

vi.mock('@/lib/i18n', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
afterEach(cleanup);

describe('student and parent account status', () => {
  it.each([
    [false, false], [false, true], [true, false], [true, true],
  ])('separates child=%s and parent=%s', (child, parent) => {
    render(<StudentConnectionStatus students={[{
      linked_user_id: child ? 'child' : null,
      parent_students: parent ? [{ parent_id: 'parent' }] : [],
    }]} />);
    expect(screen.getByText(child ? 'stu.childConnected' : 'stu.childNotConnected')).toBeTruthy();
    expect(screen.getByText(parent ? 'stu.parentConnected' : 'stu.parentNotConnected')).toBeTruthy();
  });

  it('includes a parent linked to another tutor row for the same child', () => {
    render(<StudentConnectionStatus students={[
      { linked_user_id: 'child', parent_students: [] },
      { parent_students: [{ parent_id: 'parent' }] },
    ]} />);
    expect(screen.getByText('stu.childConnected')).toBeTruthy();
    expect(screen.getByText('stu.parentConnected')).toBeTruthy();
  });

  it('does not report a missing parent when cached data has no relationship field', () => {
    render(<StudentConnectionStatus students={[{ linked_user_id: null }]} />);
    expect(screen.getByText('stu.parentConnectionUnknown')).toBeTruthy();
    expect(screen.queryByText('stu.parentNotConnected')).toBeNull();
  });
});

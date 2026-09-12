import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../../src/lib/supabase', () => ({
  supabase: {
    storage: {
      from: () => ({
        uploadToSignedUrl: vi.fn(),
      }),
    },
  },
}));

import SchoolHomework from '../../src/pages/SchoolHomework';

describe('school homework lesson navigation', () => {
  beforeEach(() => {
    const now = Date.now();
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        ok: true,
        now: new Date(now).toISOString(),
        school: { name: 'Demo Mokykla' },
        student: { id: 'student', name: 'Mokinys' },
        terminology: { staff: true, activity: false },
        limits: { maxBytes: 10_000_000, allowedExt: ['.pdf'] },
        sessions: [
          {
            id: 'past',
            start: new Date(now - 3_600_000).toISOString(),
            end: new Date(now - 1_800_000).toISOString(),
            status: 'completed',
            teacher: 'Mokytoja',
            group: 'Praeities grupė',
            subject: '',
            topic: '',
            joinUrl: null,
            hasMeetingLink: false,
            files: [],
          },
          {
            id: 'upcoming',
            start: new Date(now + 86_400_000).toISOString(),
            end: new Date(now + 86_400_000 + 2_700_000).toISOString(),
            status: 'active',
            teacher: 'Mokytoja',
            group: 'Ateities grupė',
            subject: '',
            topic: '',
            joinUrl: null,
            hasMeetingLink: false,
            files: [],
          },
        ],
      }),
    })));
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('opens recent lessons first and lets the parent switch to upcoming lessons', async () => {
    render(
      <MemoryRouter initialEntries={['/school-homework?student=student&t=token']}>
        <SchoolHomework />
      </MemoryRouter>,
    );

    const pastTab = await screen.findByRole('tab', { name: /Praėjusios pamokos \(1\)/i });
    const upcomingTab = screen.getByRole('tab', { name: /Artėjančios pamokos \(1\)/i });
    expect(pastTab.getAttribute('aria-selected')).toBe('true');
    expect(screen.getByText('Praeities grupė')).toBeTruthy();
    expect(screen.queryByText('Ateities grupė')).toBeNull();

    fireEvent.click(upcomingTab);

    expect(upcomingTab.getAttribute('aria-selected')).toBe('true');
    expect(screen.getByText('Ateities grupė')).toBeTruthy();
    expect(screen.queryByText('Praeities grupė')).toBeNull();
  });
});

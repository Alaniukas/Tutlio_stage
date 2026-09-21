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

  it('does not tell parents to wait for the clock when the join link is unavailable', async () => {
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
        sessions: [{
          id: 'lesson',
          start: new Date(now + 10 * 60_000).toISOString(),
          end: new Date(now + 55 * 60_000).toISOString(),
          status: 'active',
          teacher: 'Mokytoja',
          group: 'Matematika',
          subject: '',
          topic: '',
          joinUrl: null,
          hasMeetingLink: true,
          joinBlockedByContract: true,
          files: [],
        }],
      }),
    })));

    render(
      <MemoryRouter initialEntries={['/school-homework?student=student&t=token']}>
        <SchoolHomework />
      </MemoryRouter>,
    );

    expect(await screen.findByText(/šiai pamokai nėra galiojančios sutarties/)).toBeTruthy();
    expect(screen.queryByText(/Prisijungti bus galima nuo/)).toBeNull();
  });

  it('shows group recordings from the homework payload without a Tutlio login', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        ok: true,
        now: new Date().toISOString(),
        school: { name: 'Demo Mokykla' },
        student: { id: 'student', name: 'Mokinys' },
        terminology: { staff: true, activity: false },
        limits: { maxBytes: 10_000_000, allowedExt: ['.pdf'] },
        sessions: [],
        retentionDays: 30,
        recordingGroups: [{
          id: 'g1',
          name: 'QA Legal Matematika',
          recordings: [{
            id: 'file-1',
            name: 'Rugsėjo 10 pamoka.mp4',
            recordedAt: '2026-09-10T10:00:00Z',
            durationMillis: 60_000,
            size: 1_000,
            streamUrl: '/api/school-lesson-recording-stream?t=homework',
          }],
          loadError: null,
        }],
      }),
    })));

    render(
      <MemoryRouter initialEntries={['/school-homework?student=student&t=token']}>
        <SchoolHomework />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Pamokų įrašai')).toBeTruthy();
    expect(screen.getByText('QA Legal Matematika')).toBeTruthy();
    expect(screen.getByText('Rugsėjo 10 pamoka.mp4')).toBeTruthy();
  });

  it('keeps lesson tabs when recordings are present and shows one group player at a time', async () => {
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
        ],
        retentionDays: 30,
        recordingGroups: [
          {
            id: 'g1',
            name: 'Matematika',
            recordings: [{
              id: 'file-1',
              name: 'Matematikos įrašas.mp4',
              recordedAt: '2026-09-10T10:00:00Z',
              durationMillis: 60_000,
              size: 1_000,
              streamUrl: '/api/school-lesson-recording-stream?t=one',
            }],
            loadError: null,
          },
          {
            id: 'g2',
            name: 'Anglų',
            recordings: [{
              id: 'file-2',
              name: 'Anglų įrašas.mp4',
              recordedAt: '2026-09-11T10:00:00Z',
              durationMillis: 60_000,
              size: 1_000,
              streamUrl: '/api/school-lesson-recording-stream?t=two',
            }],
            loadError: null,
          },
        ],
      }),
    })));

    render(
      <MemoryRouter initialEntries={['/school-homework?student=student&t=token']}>
        <SchoolHomework />
      </MemoryRouter>,
    );

    expect(await screen.findByRole('tab', { name: /Praėjusios pamokos \(1\)/i })).toBeTruthy();
    expect(screen.getByText('Praeities grupė')).toBeTruthy();
    expect(screen.getByText('Pamokų įrašai')).toBeTruthy();
    expect(screen.getByLabelText('Pasirinkite grupę')).toBeTruthy();
    expect(screen.getByText('Matematikos įrašas.mp4')).toBeTruthy();
    expect(screen.queryByText('Anglų įrašas.mp4')).toBeNull();

    fireEvent.change(screen.getByLabelText('Pasirinkite grupę'), { target: { value: 'g2' } });
    expect(screen.getByText('Anglų įrašas.mp4')).toBeTruthy();
    expect(screen.queryByText('Matematikos įrašas.mp4')).toBeNull();
    expect(screen.getByRole('tab', { name: /Praėjusios pamokos \(1\)/i })).toBeTruthy();
  });
});

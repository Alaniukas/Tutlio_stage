import { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SchoolGroupRosterAttendanceControls } from '../../src/components/SchoolGroupRosterAttendanceControls';
import { confirmSchoolGroupRosterAttendance, type SchoolGroupAttendanceParticipant, type SchoolGroupAttendanceTarget } from '../../src/lib/schoolGroupAttendance';

const eligible: SchoolGroupAttendanceParticipant = {
  studentId: 'child', contractRequired: true, contractConfirmed: false, canConfirmAttendance: true, attendance: null,
};

function SavingRoster({ target }: { target: SchoolGroupAttendanceTarget }) {
  const [participant, setParticipant] = useState(eligible);
  const [saving, setSaving] = useState(false);
  return <SchoolGroupRosterAttendanceControls participant={participant} disabled={saving} onConfirm={async (studentId, status) => {
    setSaving(true);
    try {
      const attendance = await confirmSchoolGroupRosterAttendance(target, studentId, status, {
        'Content-Type': 'application/json', Authorization: 'Bearer teacher',
      });
      setParticipant((current) => ({ ...current, attendance }));
    } finally {
      setSaving(false);
    }
  }} />;
}

describe('school roster attendance controls', () => {
  afterEach(() => vi.unstubAllGlobals());

  it.each([
    { target: { anchorSessionId: 'real-sibling' } },
    { target: { groupId: 'all-unsigned-group', startTime: '2026-09-30T06:00:00.000Z' } },
  ])('saves and corrects a null-session child using the attestation target $target', async ({ target }) => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      return { ok: true, json: async () => ({ ok: true, attendance: {
        id: 'saved-attestation', status: body.status, statusConfirmedAt: '2026-09-30T12:00:00Z', contractConfirmed: false,
      } }) };
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<SavingRoster target={target} />);

    fireEvent.click(screen.getByRole('button', { name: 'Mokinys atvyko' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Mokinys atvyko' }).getAttribute('aria-pressed')).toBe('true'));
    fireEvent.click(screen.getByRole('button', { name: 'Mokinys neatvyko' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Mokinys neatvyko' }).getAttribute('aria-pressed')).toBe('true'));

    expect(fetchMock.mock.calls).toHaveLength(2);
    for (const [index, [url, init]] of fetchMock.mock.calls.entries()) {
      expect(url).toBe('/api/school-group-attendance');
      expect(init?.method).toBe('POST');
      expect(JSON.parse(String(init?.body))).toEqual({ ...target, studentId: 'child', status: index === 0 ? 'completed' : 'no_show' });
    }
  });

  it('lets the teacher attest both outcomes for an eligible child without a confirmed contract', () => {
    const onConfirm = vi.fn();
    render(<SchoolGroupRosterAttendanceControls participant={eligible} disabled={false} onConfirm={onConfirm} />);
    fireEvent.click(screen.getByRole('button', { name: 'Mokinys atvyko' }));
    fireEvent.click(screen.getByRole('button', { name: 'Mokinys neatvyko' }));
    expect(onConfirm.mock.calls).toEqual([['child', 'completed'], ['child', 'no_show']]);
  });

  it('updates pressed outcomes from the saved attestation and prevents a second click during saving', () => {
    const onConfirm = vi.fn();
    const { rerender } = render(<SchoolGroupRosterAttendanceControls participant={eligible} disabled={true} onConfirm={onConfirm} />);
    fireEvent.click(screen.getByRole('button', { name: 'Mokinys atvyko' }));
    expect(onConfirm).not.toHaveBeenCalled();
    for (const status of ['completed', 'no_show'] as const) {
      rerender(<SchoolGroupRosterAttendanceControls participant={{ ...eligible, attendance: {
        id: 'attestation', status, statusConfirmedAt: '2026-09-30T12:00:00Z', contractConfirmed: false,
      } }} disabled={false} onConfirm={onConfirm} />);
      expect(screen.getByRole('button', { name: 'Mokinys atvyko' }).getAttribute('aria-pressed')).toBe(String(status === 'completed'));
      expect(screen.getByRole('button', { name: 'Mokinys neatvyko' }).getAttribute('aria-pressed')).toBe(String(status === 'no_show'));
    }
  });

  it('keeps absent metadata, ineligible roster members, and real session rows out of the fallback flow', () => {
    const props = { disabled: false, onConfirm: vi.fn() };
    const { rerender } = render(<SchoolGroupRosterAttendanceControls {...props} />);
    expect(screen.queryByRole('button')).toBeNull();
    rerender(<SchoolGroupRosterAttendanceControls {...props} participant={{ ...eligible, canConfirmAttendance: false }} />);
    expect(screen.queryByRole('button')).toBeNull();
    rerender(<SchoolGroupRosterAttendanceControls {...props} participant={{ ...eligible, realSessionId: 'real-session' }} />);
    expect(screen.queryByRole('button')).toBeNull();
  });
});

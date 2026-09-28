import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

const translations = vi.hoisted(() => ({ t: (key: string) => key, locale: 'en' }));
vi.mock('../../src/lib/apiHelpers', () => ({ authHeaders: async () => ({ Authorization: 'Bearer test' }) }));
vi.mock('../../src/lib/i18n', () => ({ useTranslation: () => translations }));
vi.mock('../../src/components/consultations/ConsultationNeedDialog', () => ({ default: () => null }));
vi.mock('../../src/components/consultations/HelpTeamBookDialog', () => ({ default: () => null }));
vi.mock('../../src/components/consultations/ConsultationNotesDialog', () => ({ default: (props: { consultationId: string | null }) => props.consultationId ? <p>Notes scope: {props.consultationId}</p> : null }));
import ConsultationsPortal from '../../src/components/consultations/ConsultationsPortal';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const base = {
  familyPortal: true, organizationId: 'school', schoolYear: '2026-2027', inSeason: true,
  students: [{ id: 'childA', full_name: 'Child A' }, { id: 'childB', full_name: 'Child B' }],
  eligibleStudentIds: ['childA', 'childB'], requests: [], balances: {}, helpQuotas: {}, specialists: [], familyQuota: 2,
  consultations: [
    { id: 'family-booking', organization_id: 'school', student_id: 'childA', target_kind: 'family', family_student_ids: ['childA', 'childB'], kind: 'help_team', status: 'confirmed', canReadNotes: true },
    { id: 'child-booking', organization_id: 'school', student_id: 'childA', target_kind: 'child', family_student_ids: [], kind: 'help_team', status: 'confirmed', canReadNotes: true },
  ],
};
function mockPortal(data = base) {
  const fetcher = vi.fn(async () => ({ ok: true, json: async () => data }));
  vi.stubGlobal('fetch', fetcher);
  return fetcher;
}

it('shows family and child bookings in the overview and opens notes for the chosen reservation only', async () => {
  mockPortal();
  render(<ConsultationsPortal organizationId="school" />);
  await screen.findByText('The whole family');
  expect(screen.getAllByRole('button', { name: 'View notes' })).toHaveLength(2);
  fireEvent.click(screen.getAllByRole('button', { name: 'View notes' })[0]);
  await screen.findByText('Notes scope: family-booking');
});

it('shows only the selected child reservation even if an overview response includes a family booking', async () => {
  const fetcher = mockPortal();
  render(<ConsultationsPortal organizationId="school" selectedStudentId="childA" />);
  await screen.findByText('Child A');
  expect(screen.queryByText('The whole family')).toBeNull();
  expect(screen.getAllByRole('button', { name: 'View notes' })).toHaveLength(1);
  expect(fetcher.mock.calls[0][0]).toContain('student_id=childA');
  fireEvent.click(screen.getByRole('button', { name: 'View notes' }));
  await screen.findByText('Notes scope: child-booking');
});

it('keeps historical private notes available outside the season while preventing new reservations', async () => {
  mockPortal({ ...base, inSeason: false });
  render(<ConsultationsPortal organizationId="school" />);
  await screen.findByText('The whole family');
  expect(screen.getByText('schoolConsult.offSeason')).toBeTruthy();
  expect((screen.getByRole('button', { name: 'schoolConsult.submitNeed' }) as HTMLButtonElement).disabled).toBe(true);
  expect((screen.getByRole('button', { name: 'schoolConsult.helpCat.psychologist' }) as HTMLButtonElement).disabled).toBe(true);
  expect(screen.getAllByRole('button', { name: 'View notes' })).toHaveLength(2);
});

it('does not show family scope or private note controls for the legacy portal', async () => {
  mockPortal({ ...base, familyPortal: false });
  render(<ConsultationsPortal organizationId="school" />);
  await screen.findByText('schoolConsult.helpSection');
  expect(screen.queryByRole('combobox', { name: 'Family overview' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'View notes' })).toBeNull();
});

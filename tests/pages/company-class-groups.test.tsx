import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OrgEntityProvider } from '@/contexts/OrgEntityContext';
import CompanyClassGroups from '@/pages/company/CompanyClassGroups';

const fetchMock = vi.fn();

const testState = vi.hoisted(() => ({
  from: vi.fn(),
}));

vi.mock('@/hooks/useOrgFeatures', () => ({
  useOrgFeatures: () => ({
    loading: false,
    hasFeature: (id: string) => id === 'school_class_groups',
  }),
}));

vi.mock('@/lib/orgVisibleTutors', () => ({
  getOrgVisibleTutors: async () => [{ id: 't1', full_name: 'Mokytoja Ona' }],
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getUser: async () => ({ data: { user: { id: 'admin-1' } } }),
      getSession: async () => ({ data: { session: { access_token: 'tok' } } }),
    },
    from: testState.from,
  },
}));

const group = {
  id: 'g1',
  name: 'QA Legal Matematika',
  tutor_id: 't1',
  school_year_start: '2026-09-01',
  school_year_end: '2027-06-15',
  platform: 'Google Meet',
  duration_minutes: 45,
  meeting_link: 'https://meet.google.com/abc-defg-hij',
  slots: [{ weekday: 2, start_time: '16:00', end_time: '16:45' }],
  members: [{ student_id: 's1', student: { full_name: 'Jonas Petraitis' } }],
};

describe('CompanyClassGroups edit modal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ groups: [group] }),
    });
    vi.stubGlobal('fetch', fetchMock);
    testState.from.mockImplementation((table: string) => {
      const result =
        table === 'organization_admins' ? { data: { organization_id: 'org-1' } }
        : table === 'profiles' ? { data: { id: 'admin-1', full_name: 'Admin', organization_id: 'org-1' } }
        : table === 'students' ? { data: [
          { id: 's1', full_name: 'Jonas Petraitis', grade: '5 klasė', enrollment_status: 'active' },
          { id: 's2', full_name: 'Eglė Kazlauskaitė', grade: '5 klasė', enrollment_status: 'active' },
        ] }
        : { data: null };
      const query: Record<string, unknown> = {};
      const self = () => query;
      query.select = self;
      query.eq = self;
      query.is = self;
      query.order = () => Promise.resolve(result);
      query.maybeSingle = () => Promise.resolve(result);
      return query;
    });
  });

  it('renders the groups page without raw i18n keys', async () => {
    render(
      <OrgEntityProvider value="school">
        <MemoryRouter initialEntries={['/school/groups']}>
          <CompanyClassGroups />
        </MemoryRouter>
      </OrgEntityProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText('QA Legal Matematika')).toBeTruthy();
    });
    expect(screen.getByText('Redaguoti')).toBeTruthy();
    expect(screen.queryByText('common.edit')).toBeNull();
    expect(screen.queryByText('school.groups.edit')).toBeNull();
  });

  it('opens a wide edit modal from the group card with members to add or remove', async () => {
    render(
      <OrgEntityProvider value="school">
        <MemoryRouter initialEntries={['/school/groups']}>
          <CompanyClassGroups />
        </MemoryRouter>
      </OrgEntityProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText('QA Legal Matematika')).toBeTruthy();
    });

    fireEvent.click(screen.getByRole('button', { name: /QA Legal Matematika/ }));

    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: 'Redaguoti grupę' })).toBeTruthy();
      expect(screen.getByText('Eglė Kazlauskaitė')).toBeTruthy();
    });

    const dialog = screen.getByRole('dialog', { name: 'Redaguoti grupę' });
    expect(dialog.className).toMatch(/56rem/);
    expect(screen.getByDisplayValue('QA Legal Matematika')).toBeTruthy();
    expect(screen.getByDisplayValue('https://meet.google.com/abc-defg-hij')).toBeTruthy();
    // Member chips render once the dialog effect has copied the roster into state.
    await waitFor(() => {
      expect(screen.getByLabelText('Pašalinti mokinį')).toBeTruthy();
    });

    fireEvent.click(screen.getByLabelText('Pašalinti mokinį'));
    fireEvent.click(screen.getByText('Eglė Kazlauskaitė').closest('label')!.querySelector('input')!);
    fireEvent.click(screen.getByRole('button', { name: 'Išsaugoti' }));

    await waitFor(() => {
      const patch = fetchMock.mock.calls.find((call) => call[1]?.method === 'PATCH');
      expect(patch).toBeTruthy();
      const body = JSON.parse(patch![1].body as string);
      expect(body.id).toBe('g1');
      expect(body.name).toBe('QA Legal Matematika');
      expect(body.tutor_id).toBe('t1');
      expect(body.student_ids).toEqual(['s2']);
      expect(body.slots).toEqual([{ weekday: 2, start_time: '16:00', end_time: '16:45' }]);
    });
  });

  it('lets an admin delete the group from the edit dialog after confirming', async () => {
    render(
      <OrgEntityProvider value="school">
        <MemoryRouter initialEntries={['/school/groups']}>
          <CompanyClassGroups />
        </MemoryRouter>
      </OrgEntityProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText('QA Legal Matematika')).toBeTruthy();
    });
    fireEvent.click(screen.getByRole('button', { name: /QA Legal Matematika/ }));
    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: 'Redaguoti grupę' })).toBeTruthy();
    });

    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    fetchMock.mockClear();
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ ok: true, groups: [] }) });
    fireEvent.click(screen.getByRole('button', { name: 'Ištrinti' }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/school-class-groups?id=g1',
        expect.objectContaining({ method: 'DELETE' }),
      );
    });
    expect(confirmSpy).toHaveBeenCalledWith(expect.stringContaining('QA Legal Matematika'));
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Redaguoti grupę' })).toBeNull();
    });
    confirmSpy.mockRestore();
  });

  it('shows every weekly slot and saves independent start times', async () => {
    const split = {
      ...group,
      slots: [
        { weekday: 1, start_time: '11:00', end_time: '11:45' },
        { weekday: 3, start_time: '14:00', end_time: '14:45' },
      ],
    };
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ groups: [split] }),
    });

    render(
      <OrgEntityProvider value="school">
        <MemoryRouter initialEntries={['/school/groups']}>
          <CompanyClassGroups />
        </MemoryRouter>
      </OrgEntityProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText('pirmadienis 11:00–11:45, trečiadienis 14:00–14:45')).toBeTruthy();
    });

    fireEvent.click(screen.getByRole('button', { name: /QA Legal Matematika/ }));

    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: 'Redaguoti grupę' })).toBeTruthy();
    });

    const days = screen.getAllByLabelText('Diena') as HTMLSelectElement[];
    expect(days.map((el) => el.value)).toEqual(['1', '3']);
    expect((screen.getAllByLabelText('valandos')[0] as HTMLSelectElement).value).toBe('11');
    expect((screen.getAllByLabelText('valandos')[1] as HTMLSelectElement).value).toBe('14');

    fireEvent.click(screen.getByRole('button', { name: 'Pridėti dieną' }));
    fireEvent.change(screen.getAllByLabelText('Diena')[2], { target: { value: '5' } });
    fireEvent.change(screen.getAllByLabelText('valandos')[2], { target: { value: '09' } });
    fireEvent.click(screen.getByRole('button', { name: 'Išsaugoti' }));

    await waitFor(() => {
      const patch = fetchMock.mock.calls.find((call) => call[1]?.method === 'PATCH');
      expect(patch).toBeTruthy();
      const body = JSON.parse(patch![1].body as string);
      expect(body.slots).toEqual([
        { weekday: 1, start_time: '11:00', end_time: '11:45' },
        { weekday: 3, start_time: '14:00', end_time: '14:45' },
        { weekday: 5, start_time: '09:00', end_time: '09:45' },
      ]);
    });
  });
});

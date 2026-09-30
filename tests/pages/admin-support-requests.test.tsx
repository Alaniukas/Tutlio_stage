import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ copyTextToClipboard: vi.fn() }));
vi.mock('@/lib/copyToClipboard', () => ({ copyTextToClipboard: mocks.copyTextToClipboard }));
import AdminSupportRequestsPanel, { type SupportRequest } from '@/components/admin/AdminSupportRequestsPanel';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

const request: SupportRequest = {
  id: '17ee7859-5c8a-4fba-9dbd-9259ccad28f4',
  request_id: '8cb31cd5-7c88-43ea-b850-a337c92099c1',
  reporter_user_id: '11111111-1111-1111-1111-111111111111',
  reporter_name: 'Demo Admin',
  reporter_email: 'admin@example.com',
  reporter_role: 'organization_admin',
  organization_id: '22222222-2222-2222-2222-222222222222',
  organization_name: 'Demo School',
  category: 'bug',
  title: 'Support popup loses the draft',
  context: 'The popup closes when the underlying page is clicked.',
  steps: ['Open support', 'Write a draft', 'Click the page'],
  expected_outcome: 'The draft should remain available.',
  actual_outcome: 'The draft disappears.',
  impact: 'high',
  impact_details: 'Users cannot finish the report.',
  page: '/company',
  locale: 'en',
  environment: { viewport: '1440x900' },
  transcript: [{ role: 'user', content: 'My draft disappears.' }],
  attachments: [],
  coding_agent_prompt: 'You are an AI coding agent. Resolve support report SUP-17EE7859.',
  completion_notified_at: null,
  completion_notification_email_id: null,
  status: 'registered',
  priority: 'untriaged',
  internal_note: null,
  created_at: '2026-09-18T10:00:00.000Z',
  updated_at: '2026-09-18T10:00:00.000Z',
};

const featureRequest: SupportRequest = {
  ...request,
  id: '27ee7859-5c8a-4fba-9dbd-9259ccad28f4',
  request_id: '9cb31cd5-7c88-43ea-b850-a337c92099c1',
  category: 'feature',
  title: 'Export lesson history',
  actual_outcome: null,
};

const resolvedFeatureRequest: SupportRequest = {
  ...featureRequest,
  id: '37ee7859-5c8a-4fba-9dbd-9259ccad28f4',
  request_id: 'acb31cd5-7c88-43ea-b850-a337c92099c1',
  title: 'Export invoices',
  status: 'resolved',
};

describe('admin support requests', () => {
  it('shows the generated coding-agent prompt with a confirmed copy action', async () => {
    mocks.copyTextToClipboard.mockResolvedValue(true);
    render(<AdminSupportRequestsPanel adminSecret="demo" demoRequests={[request]} />);

    expect(screen.getByText('DI programavimo agento promptas')).toBeTruthy();
    expect(screen.getByText(request.coding_agent_prompt!)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Kopijuoti/ }));
    expect(mocks.copyTextToClipboard).toHaveBeenCalledWith(request.coding_agent_prompt);
    await waitFor(() => expect(screen.getByRole('button', { name: /Nukopijuota/ })).toBeTruthy());
  });

  it('requires a deadline when moving a request into progress', async () => {
    render(<AdminSupportRequestsPanel adminSecret="demo" demoRequests={[request]} />);

    fireEvent.change(screen.getByRole('combobox', { name: 'Būsena' }), { target: { value: 'in_progress' } });
    fireEvent.click(screen.getByRole('button', { name: 'Išsaugoti' }));
    expect(screen.getByText('Būsenai „Vykdoma“ būtina nurodyti terminą.')).toBeTruthy();

    fireEvent.change(screen.getByLabelText(/Terminas/), { target: { value: '2026-10-01T12:00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Išsaugoti' }));
    await waitFor(() => expect(screen.getByRole('button', { name: /Support popup loses the draft.*Vykdoma/ })).toBeTruthy());
  });

  it('separates bug and feature backlogs and selects a request from the visible category', () => {
    render(<AdminSupportRequestsPanel adminSecret="demo" demoRequests={[request, featureRequest, resolvedFeatureRequest]} />);
    const list = within(screen.getByRole('region', { name: 'Užklausų sąrašas' }));

    expect(list.getAllByRole('button')).toHaveLength(3);
    expect(screen.getByRole('heading', { name: request.title })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Funkcijos' }));

    expect(screen.getByRole('button', { name: 'Funkcijos' }).getAttribute('aria-pressed')).toBe('true');
    expect(list.getAllByRole('button')).toHaveLength(2);
    expect(list.queryByRole('button', { name: new RegExp(request.title) })).toBeNull();
    expect(screen.queryByRole('heading', { name: request.title })).toBeNull();
    expect(screen.getByRole('heading', { name: featureRequest.title })).toBeTruthy();
    expect(list.getByRole('button', { name: /Export invoices.*Įgyvendinta/ })).toBeTruthy();
    expect(within(screen.getByRole('combobox', { name: 'Būsena' })).getByRole('option', { name: 'Įgyvendinta' }).getAttribute('value')).toBe('resolved');

    fireEvent.click(screen.getByRole('button', { name: 'Klaidos' }));
    expect(list.getAllByRole('button')).toHaveLength(1);
    expect(screen.getByRole('heading', { name: request.title })).toBeTruthy();
    expect(within(screen.getByRole('combobox', { name: 'Būsena' })).getByRole('option', { name: 'Išspręsta' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Visos užklausos' }));
    expect(list.getAllByRole('button')).toHaveLength(3);
  });

  it('clears the editor when the selected category has no requests', () => {
    render(<AdminSupportRequestsPanel adminSecret="demo" demoRequests={[request]} />);

    fireEvent.click(screen.getByRole('button', { name: 'Funkcijos' }));

    expect(screen.getByText('Užklausų nerasta')).toBeTruthy();
    expect(screen.getByText('Pasirinkite užklausą')).toBeTruthy();
    expect(screen.queryByRole('heading', { name: request.title })).toBeNull();
    expect(screen.queryByRole('combobox', { name: 'Būsena' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Išsaugoti' })).toBeNull();
  });

  it('combines category, search and status filters without keeping an excluded editor', () => {
    const exportBug = { ...request, title: 'Export calendar error', status: 'resolved' as const };
    const otherFeature = { ...featureRequest, id: '47ee7859-5c8a-4fba-9dbd-9259ccad28f4', title: 'Student reminders', status: 'resolved' as const };
    render(<AdminSupportRequestsPanel adminSecret="demo" demoRequests={[exportBug, featureRequest, resolvedFeatureRequest, otherFeature]} />);
    const list = within(screen.getByRole('region', { name: 'Užklausų sąrašas' }));

    fireEvent.click(screen.getByRole('button', { name: 'Funkcijos' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Ieškoti užklausų' }), { target: { value: 'Export' } });
    expect(list.getAllByRole('button')).toHaveLength(2);
    fireEvent.change(screen.getByRole('combobox', { name: 'Filtruoti pagal būseną' }), { target: { value: 'resolved' } });

    expect(list.getAllByRole('button')).toHaveLength(1);
    expect(list.getByRole('button', { name: /Export invoices.*Įgyvendinta/ })).toBeTruthy();
    expect(screen.getByRole('heading', { name: resolvedFeatureRequest.title })).toBeTruthy();
    expect((screen.getByRole('combobox', { name: 'Būsena' }) as HTMLSelectElement).value).toBe('resolved');

    fireEvent.click(screen.getByRole('button', { name: 'Klaidos' }));
    expect(list.getAllByRole('button')).toHaveLength(1);
    expect(list.getByRole('button', { name: /Export calendar error.*Išspręsta/ })).toBeTruthy();
    expect(screen.getByRole('heading', { name: exportBug.title })).toBeTruthy();

    fireEvent.change(screen.getByRole('textbox', { name: 'Ieškoti užklausų' }), { target: { value: 'no matching request' } });
    expect(screen.getByText('Užklausų nerasta')).toBeTruthy();
    expect(screen.queryByRole('heading', { name: exportBug.title })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Išsaugoti' })).toBeNull();
  });

  it('refreshes the same ticket editor before saving an updated Trello status and deadline', async () => {
    const initialRequest = { ...featureRequest, status_updated_at: '2026-09-29T10:00:00.000Z' };
    const refreshedRequest: SupportRequest = {
      ...initialRequest,
      status: 'in_progress',
      priority: 'high',
      target_date: '2026-10-02T12:00:00.000Z',
      internal_note: 'Scheduled from Trello.',
      status_updated_at: '2026-09-30T10:00:00.000Z',
    };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ requests: [initialRequest] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ requests: [refreshedRequest] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ request: refreshedRequest }) });
    vi.stubGlobal('fetch', fetchMock);
    render(<AdminSupportRequestsPanel adminSecret="test-admin" />);

    await screen.findByRole('heading', { name: featureRequest.title });
    fireEvent.change(screen.getByRole('combobox', { name: 'Būsena' }), { target: { value: 'resolved' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Prioritetas' }), { target: { value: 'low' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Vidinė pastaba' }), { target: { value: 'Unsaved local note.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Atnaujinti' }));

    await waitFor(() => expect((screen.getByRole('combobox', { name: 'Būsena' }) as HTMLSelectElement).value).toBe('in_progress'));
    expect((screen.getByRole('combobox', { name: 'Prioritetas' }) as HTMLSelectElement).value).toBe('high');
    expect(new Date((screen.getByLabelText(/Terminas/) as HTMLInputElement).value).toISOString()).toBe(refreshedRequest.target_date);
    expect((screen.getByRole('textbox', { name: 'Vidinė pastaba' }) as HTMLTextAreaElement).value).toBe(refreshedRequest.internal_note);

    fireEvent.click(screen.getByRole('button', { name: 'Išsaugoti' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    const [url, options] = fetchMock.mock.calls[2];
    expect(url).toBe('/api/admin-support-requests');
    expect(options.method).toBe('PATCH');
    expect(JSON.parse(options.body)).toMatchObject({
      id: featureRequest.id,
      status: 'in_progress',
      priority: 'high',
      targetDate: refreshedRequest.target_date,
      internalNote: refreshedRequest.internal_note,
      expectedStatusUpdatedAt: refreshedRequest.status_updated_at,
      expectedPriority: 'high',
    });
  });

  it('saves the selected feature through progress and implementation without changing a bug', async () => {
    const initial = { ...featureRequest, status_updated_at: '2026-09-29T10:00:00.000Z' };
    const localDeadline = '2026-10-02T12:00';
    const progress: SupportRequest = {
      ...initial,
      status: 'in_progress',
      target_date: new Date(localDeadline).toISOString(),
      status_updated_at: '2026-09-30T10:00:00.000Z',
    };
    const implemented: SupportRequest = { ...progress, status: 'resolved', target_date: null, status_updated_at: '2026-09-30T11:00:00.000Z' };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ requests: [request, initial] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ request: progress }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ request: implemented }) });
    vi.stubGlobal('fetch', fetchMock);
    render(<AdminSupportRequestsPanel adminSecret="test-admin" />);
    await screen.findByRole('heading', { name: request.title });

    fireEvent.click(screen.getByRole('button', { name: 'Funkcijos' }));
    const deadlineField = screen.getByLabelText(/Terminas/) as HTMLInputElement;
    expect(deadlineField.value).toBe('');
    expect(deadlineField.disabled).toBe(true);
    fireEvent.change(screen.getByRole('combobox', { name: 'Būsena' }), { target: { value: 'in_progress' } });
    expect(deadlineField.disabled).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Išsaugoti' }));
    expect(screen.getByText('Būsenai „Vykdoma“ būtina nurodyti terminą.')).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fireEvent.change(screen.getByLabelText(/Terminas/), { target: { value: localDeadline } });
    fireEvent.click(screen.getByRole('button', { name: 'Išsaugoti' }));
    await screen.findByRole('button', { name: /Export lesson history.*Vykdoma/ });
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toMatchObject({
      id: featureRequest.id, status: 'in_progress', targetDate: progress.target_date,
      expectedStatusUpdatedAt: initial.status_updated_at,
    });

    fireEvent.change(screen.getByRole('combobox', { name: 'Būsena' }), { target: { value: 'resolved' } });
    expect(deadlineField.value).toBe('');
    expect(deadlineField.disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Išsaugoti' }));
    await screen.findByRole('button', { name: /Export lesson history.*Įgyvendinta/ });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(JSON.parse(fetchMock.mock.calls[2][1].body)).toMatchObject({
      id: featureRequest.id, status: 'resolved', targetDate: null,
      expectedStatusUpdatedAt: progress.status_updated_at,
    });
    expect(deadlineField.value).toBe('');
    expect(deadlineField.disabled).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Visos užklausos' }));
    expect(screen.getByRole('button', { name: /Support popup loses the draft.*Užregistruota/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Export lesson history.*Įgyvendinta/ })).toBeTruthy();
  });
});

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ copyTextToClipboard: vi.fn() }));
vi.mock('@/lib/copyToClipboard', () => ({ copyTextToClipboard: mocks.copyTextToClipboard }));
import AdminSupportRequestsPanel, { type SupportRequest } from '@/components/admin/AdminSupportRequestsPanel';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
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
  status: 'new',
  priority: 'untriaged',
  internal_note: null,
  created_at: '2026-09-18T10:00:00.000Z',
  updated_at: '2026-09-18T10:00:00.000Z',
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

  it('sends a completion notice only after the request is resolved and confirms it in the panel', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<AdminSupportRequestsPanel adminSecret="demo" demoRequests={[{ ...request, status: 'resolved' }]} />);

    fireEvent.click(screen.getByRole('button', { name: 'Pranešti, kad klaida ištaisyta' }));

    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('admin@example.com'));
    await waitFor(() => expect(screen.getByText('Naudotojas informuotas')).toBeTruthy());
    expect(screen.queryByRole('button', { name: 'Pranešti, kad klaida ištaisyta' })).toBeNull();
  });
});

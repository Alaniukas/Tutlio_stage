import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AdminPanel from '../../src/pages/AdminPanel';

vi.mock('../../src/components/admin/AdminBlogPanel', () => ({ default: () => null }));
vi.mock('../../src/components/admin/AdminStatisticsPanel', () => ({ default: () => null }));
vi.mock('../../src/components/admin/AdminPerlasPayoutsPanel', () => ({ default: () => null }));
vi.mock('../../src/components/admin/AdminEnterpriseContactsPanel', () => ({ default: () => null }));
vi.mock('../../src/components/admin/AdminBillingPanel', () => ({ default: () => null }));
vi.mock('../../src/components/admin/AdminAttendancePanel', () => ({ default: () => null }));

function jsonResponse(body: unknown, ok = true) {
  return {
    ok,
    json: async () => body,
  } as Response;
}

describe('/admin tutor meeting-link UI', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/admin-verify') return jsonResponse({ success: true });
      if (url === '/api/admin-organizations') {
        return jsonResponse({
          organizations: [{
            id: 'org-qa',
            name: 'QA Organization',
            email: 'org@example.test',
            tutor_license_count: 1,
            status: 'active',
            features: {},
            tutor_count: 1,
            active_license_count: 1,
            student_count: 0,
            lessons_occurred: 0,
            paid_revenue_eur: 0,
            platform_fee_2pct_eur: 0,
          }],
        });
      }
      if (url === '/api/admin-organizations?id=org-qa') {
        return jsonResponse({
          organization: {
            id: 'org-qa',
            name: 'QA Organization',
            email: 'org@example.test',
            tutor_license_count: 1,
            status: 'active',
            features: {},
          },
          tutors: [{
            id: 'tutor-qa',
            full_name: 'QA Tutor',
            email: 'tutor@example.test',
            phone: null,
            personal_meeting_link: 'https://meet.example/qa-room',
          }],
          archived_tutors: [],
          students: [],
          stats: {},
          audit: [],
        });
      }
      return jsonResponse({ error: `Unexpected request: ${url}` }, false);
    }));
  });

  it('shows the saved tutor meeting link in organization details', async () => {
    render(<AdminPanel />);

    fireEvent.change(screen.getByPlaceholderText('••••••••••••'), {
      target: { value: 'synthetic-admin-secret' },
    });
    fireEvent.submit(screen.getByPlaceholderText('••••••••••••').closest('form')!);

    const orgNames = await screen.findAllByText('QA Organization');
    const mobileOrgButton = orgNames.map((node) => node.closest('button')).find(Boolean);
    expect(mobileOrgButton).toBeTruthy();
    fireEvent.click(mobileOrgButton!);

    const link = await screen.findByRole('link', { name: /qa-room/i });
    expect(link.getAttribute('href')).toBe('https://meet.example/qa-room');
    expect(link.getAttribute('target')).toBe('_blank');
    await waitFor(() => expect(screen.getByText('QA Tutor')).toBeTruthy());
  });
});

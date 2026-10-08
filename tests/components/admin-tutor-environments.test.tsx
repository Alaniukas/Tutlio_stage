import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import AdminTutorEnvironmentsDialog from '../../src/components/admin/AdminTutorEnvironmentsDialog';
import { qaOrganizations, qaProfiles } from '../fixtures/tutor-environment-finance';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it('lets Tutlio assign existing logins so company access appears without tutor setup', async () => {
  const environment = (index: number) => ({ tutorId: qaProfiles[index].id, organizationId: qaOrganizations[index].id,
    organizationName: qaOrganizations[index].name, email: qaProfiles[index].email, isCurrent: index === 0, entityType: 'company' });
  const requests: Array<{ url: string; method: string; body: any; secret: string | null }> = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
    const method = init.method || 'GET';
    requests.push({ url, method, body: init.body ? JSON.parse(String(init.body)) : undefined, secret: new Headers(init.headers).get('x-admin-secret') });
    return { ok: true, json: async () => url.startsWith('/api/admin-organizations') ? { tutors: [qaProfiles[1]] }
      : { environments: method === 'POST' ? [environment(0), environment(1)] : [environment(0)] } };
  }));
  render(<AdminTutorEnvironmentsDialog tutor={qaProfiles[0]} organizationId={qaOrganizations[0].id}
    organizations={qaOrganizations} adminSecret="test-platform-admin" onClose={() => {}} />);
  await screen.findByText(qaOrganizations[0].name);
  const organization = screen.getByRole('combobox', { name: 'Kita organizacija' });
  fireEvent.change(organization, { target: { value: qaOrganizations[1].id } });
  const account = screen.getByRole('combobox', { name: 'Korepetitoriaus paskyra' });
  await screen.findByRole('option', { name: `Testinė Mokytoja (${qaProfiles[1].email})` });
  fireEvent.change(account, { target: { value: qaProfiles[1].id } });
  fireEvent.click(screen.getByRole('button', { name: 'Priskirti organizaciją' }));
  await screen.findByRole('button', { name: 'Pašalinti prieigą' });
  expect(requests.find(request => request.method === 'POST')).toMatchObject({ url: '/api/admin-tutor-environments',
    body: { tutorId: qaProfiles[0].id, otherTutorId: qaProfiles[1].id }, secret: 'test-platform-admin' });
  expect(document.querySelector('input[type=password]')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Pašalinti prieigą' }));
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Pašalinti prieigą' })).toBeNull());
  expect(requests.find(request => request.method === 'DELETE')?.body).toEqual({ tutorId: qaProfiles[0].id, otherTutorId: qaProfiles[1].id });
});

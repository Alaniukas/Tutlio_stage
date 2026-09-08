import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
vi.mock('@/lib/apiHelpers', () => ({ authHeaders: async () => ({}) }));
vi.mock('@/contexts/OrgAdminAccessContext', () => ({ useOrgAdminAccess: () => ({ can: () => false }) }));
import StudentAccountSetup from '../../src/components/company/StudentAccountSetup';
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it('checks on demand and distinguishes blocked, unblocked and unknown contacts', async () => {
  const fetchMock = vi.fn().mockImplementation(async (url: string) => ({ ok: true, json: async () => url.includes('email-status') ? { recipients: [
    { email: 'blocked@example.test', status: 'blocked', reason: 'bounce' },
    { email: 'clear@example.test', status: 'not_blocked' },
    { email: 'unknown@example.test', status: 'unknown' },
  ] } : { studentConnected: true, parents: [] } }));
  vi.stubGlobal('fetch', fetchMock);
  const { rerender } = render(<StudentAccountSetup studentId="s1" />);
  await screen.findByText('Mokinio paskyra: prijungta');
  expect(fetchMock).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: 'Patikrinti el. pašto blokavimą' }));
  await screen.findByText(/blocked@example.test: Pristatymas užblokuotas/);
  expect(screen.getByText(/clear@example.test: Blokavimo nerasta/)).toBeTruthy();
  expect(screen.getByText(/unknown@example.test: Būsenos patikrinti nepavyko/)).toBeTruthy();
  rerender(<StudentAccountSetup studentId="s2" />);
  await waitFor(() => expect(screen.queryByText(/blocked@example.test/)).toBeNull());
});

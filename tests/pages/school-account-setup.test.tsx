import { StrictMode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('@/lib/apiHelpers', () => ({ authHeaders: async () => ({}) }));
vi.mock('@/contexts/OrgAdminAccessContext', () => ({ useOrgAdminAccess: () => ({ can: () => true }) }));
import StudentAccountSetup from '@/components/company/StudentAccountSetup';
const response = (data: unknown) => ({ ok: true, json: async () => data });
afterEach(() => vi.unstubAllGlobals());
describe('admin account setup', () => {
  it('shows a created credential under StrictMode', async () => {
    vi.stubGlobal('fetch', vi.fn(async (_url, init) => response(init?.method === 'POST'
      ? { email: 'child@example.test', temporaryPassword: 'QA-temporary', role: 'student', userId: 'u1' }
      : { studentConnected: false, parents: [] })));
    render(<StrictMode><StudentAccountSetup studentId="s1" /></StrictMode>);
    fireEvent.click(await screen.findByText('Sukurti mokinio paskyrą'));
    expect(await screen.findByText('QA-temporary')).toBeTruthy();
  });
  it('does not show a previous pupil credential after switching pupils during creation', async () => {
    let finish!: (response: unknown) => void;
    vi.stubGlobal('fetch', vi.fn((_url, init) => init?.method === 'POST'
      ? new Promise(resolve => { finish = resolve; }) : Promise.resolve(response({ studentConnected: false, parents: [] }))));
    const onProvisioned = vi.fn();
    const view = render(<StudentAccountSetup studentId="s1" onProvisioned={onProvisioned} />);
    fireEvent.click(await screen.findByText('Sukurti mokinio paskyrą'));
    await waitFor(() => expect(finish).toBeTypeOf('function'));
    view.rerender(<StudentAccountSetup studentId="s2" onProvisioned={onProvisioned} />);
    finish(response({ email: 'previous@example.test', temporaryPassword: 'PREVIOUS-PRIVATE', role: 'student', userId: 'u1' }));
    await screen.findByText('Sukurti mokinio paskyrą');
    expect(screen.queryByText('PREVIOUS-PRIVATE')).toBeNull();
    expect(onProvisioned).not.toHaveBeenCalled();
  });
});

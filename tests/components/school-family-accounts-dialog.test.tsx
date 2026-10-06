import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
const translations = vi.hoisted(() => ({ t: (key: string) => key, locale: 'en' }));
vi.mock('../../src/lib/apiHelpers', () => ({ authHeaders: async () => ({ Authorization: 'Bearer test' }) }));
vi.mock('../../src/lib/i18n', () => ({ useTranslation: () => translations }));
import SchoolFamilyAccountsDialog from '../../src/components/company/SchoolFamilyAccountsDialog';
import { schoolFamilyAccountCopy } from '../../src/lib/schoolFamilyAccountCopy';

const copy = schoolFamilyAccountCopy('en');
const empty = { userId: null, login: null, createdAt: null, invitedAt: null, activatedAt: null, firstLoginAt: null, hasLoggedIn: false };
const row = (id: string, blockedReasons: string[] = []) => ({ studentId: id, studentName: `Child ${id}`, studentEmail: null,
  guardianName: 'Verified Parent', guardianEmail: 'verified@example.test', verified: true,
  annualContracts: [{ id: `annual-${id}`, number: `Annual ${id}` }], blockedReasons, parent: empty, student: empty });
const reply = (body: unknown) => ({ ok: true, json: async () => body });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it('requires an explicit shared-login confirmation and sends only the reviewed child', async () => {
  const fetcher = vi.fn(async (_url: string, init?: RequestInit) => init?.method === 'POST'
    ? reply({ success: true }) : reply({ rows: [row('one', ['shared_identity_review'])], nextCursor: null }));
  vi.stubGlobal('fetch', fetcher);
  render(<SchoolFamilyAccountsDialog canEdit />);
  fireEvent.click(screen.getByRole('button', { name: copy.title }));
  await screen.findByText('Child one');
  expect((screen.getByRole('checkbox', { name: 'Child one' }) as HTMLInputElement).disabled).toBe(true);
  expect(screen.getAllByText(/verified@example\.test/).length).toBeGreaterThan(0);
  fireEvent.click(screen.getByRole('button', { name: copy.split }));
  const confirm = screen.getByRole('button', { name: copy.split });
  expect((confirm as HTMLButtonElement).disabled).toBe(true);
  expect(fetcher.mock.calls.filter(call => call[1]?.method === 'POST')).toHaveLength(0);
  fireEvent.click(screen.getByRole('checkbox', { name: copy.confirmSplit }));
  fireEvent.click(confirm);
  await waitFor(() => expect(fetcher.mock.calls.some(call => call[1]?.method === 'POST')).toBe(true));
  const write = fetcher.mock.calls.find(call => call[1]?.method === 'POST')!;
  expect(JSON.parse(write[1]!.body as string)).toEqual({ action: 'split_shared', studentId: 'one', confirmed: true });
});

it('allows selecting every eligible child on the page and keeps blocked children disabled', async () => {
  const children = Array.from({ length: 6 }, (_, index) => row(String(index + 1)));
  const fetcher = vi.fn(async (_url: string, init?: RequestInit) => init?.method === 'POST'
    ? reply({ success: true, results: [] }) : reply({ rows: [...children, row('blocked', ['annual_contract_required'])], nextCursor: null }));
  vi.stubGlobal('fetch', fetcher);
  render(<SchoolFamilyAccountsDialog canEdit />);
  fireEvent.click(screen.getByRole('button', { name: copy.title }));
  await screen.findByText('Child 1');
  fireEvent.click(screen.getByRole('checkbox', { name: copy.selectAllPage }));
  expect((screen.getByRole('checkbox', { name: 'Child 6' }) as HTMLInputElement).checked).toBe(true);
  expect((screen.getByRole('checkbox', { name: 'Child blocked' }) as HTMLInputElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: copy.createInvite }));
  await waitFor(() => expect(fetcher.mock.calls.some(call => call[1]?.method === 'POST')).toBe(true));
  const write = fetcher.mock.calls.find(call => call[1]?.method === 'POST')!;
  expect(JSON.parse(write[1]!.body as string)).toEqual({ action: 'provision', studentIds: ['1', '2', '3', '4', '5', '6'] });
});

it('selects all eligible children or only signed-contract children from the toolbar', async () => {
  const children = [
    row('signed-1'),
    row('signed-2'),
    row('unsigned', ['annual_contract_required']),
  ];
  children[0].verified = true;
  children[1].verified = true;
  children[2].verified = false;
  const fetcher = vi.fn(async (_url: string, init?: RequestInit) => init?.method === 'POST'
    ? reply({ success: true, results: [] }) : reply({ rows: children, nextCursor: null }));
  vi.stubGlobal('fetch', fetcher);
  render(<SchoolFamilyAccountsDialog canEdit />);
  fireEvent.click(screen.getByRole('button', { name: copy.title }));
  await screen.findByText('Child signed-1');
  fireEvent.click(screen.getByRole('checkbox', { name: copy.selectAllPage }));
  expect((screen.getByRole('checkbox', { name: 'Child signed-1' }) as HTMLInputElement).checked).toBe(true);
  expect((screen.getByRole('checkbox', { name: 'Child signed-2' }) as HTMLInputElement).checked).toBe(true);
  expect((screen.getByRole('checkbox', { name: 'Child unsigned' }) as HTMLInputElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: copy.clearSelection }));
  expect((screen.getByRole('checkbox', { name: 'Child signed-1' }) as HTMLInputElement).checked).toBe(false);
  fireEvent.click(screen.getByRole('button', { name: copy.selectSigned }));
  expect((screen.getByRole('checkbox', { name: 'Child signed-1' }) as HTMLInputElement).checked).toBe(true);
  expect((screen.getByRole('checkbox', { name: 'Child signed-2' }) as HTMLInputElement).checked).toBe(true);
});

it('shows account state to viewers without exposing mutation actions', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => reply({ rows: [row('one', ['shared_identity_review'])], nextCursor: null })));
  render(<SchoolFamilyAccountsDialog canEdit={false} />);
  fireEvent.click(screen.getByRole('button', { name: copy.title }));
  await screen.findByText('Child one');
  expect(screen.queryByRole('button', { name: copy.createInvite })).toBeNull();
  expect(screen.queryByRole('button', { name: copy.verify })).toBeNull();
  expect(screen.queryByRole('button', { name: copy.split })).toBeNull();
  expect((screen.getByRole('checkbox', { name: 'Child one' }) as HTMLInputElement).disabled).toBe(true);
  expect(screen.getAllByText(copy.invited)).toHaveLength(2);
  expect(screen.getAllByText(copy.firstLogin)).toHaveLength(2);
  expect(screen.queryByText(copy.created)).toBeNull();
  expect(screen.queryByText(copy.activated)).toBeNull();
});

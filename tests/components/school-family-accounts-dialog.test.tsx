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
  expect(screen.getByText('Parent: Verified Parent, verified@example.test')).toBeTruthy();
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

it('limits selection to five eligible children and leaves blocked children untouched', async () => {
  const children = Array.from({ length: 6 }, (_, index) => row(String(index + 1)));
  const fetcher = vi.fn(async (_url: string, init?: RequestInit) => init?.method === 'POST'
    ? reply({ success: true, results: [] }) : reply({ rows: [...children, row('blocked', ['annual_contract_required'])], nextCursor: null }));
  vi.stubGlobal('fetch', fetcher);
  render(<SchoolFamilyAccountsDialog canEdit />);
  fireEvent.click(screen.getByRole('button', { name: copy.title }));
  await screen.findByText('Child 1');
  for (let index = 1; index <= 5; index++) fireEvent.click(screen.getByRole('checkbox', { name: `Child ${index}` }));
  expect((screen.getByRole('checkbox', { name: 'Child 6' }) as HTMLInputElement).disabled).toBe(true);
  expect((screen.getByRole('checkbox', { name: 'Child blocked' }) as HTMLInputElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: copy.createInvite }));
  await waitFor(() => expect(fetcher.mock.calls.some(call => call[1]?.method === 'POST')).toBe(true));
  const write = fetcher.mock.calls.find(call => call[1]?.method === 'POST')!;
  expect(JSON.parse(write[1]!.body as string)).toEqual({ action: 'provision', studentIds: ['1', '2', '3', '4', '5'] });
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
  expect(screen.getAllByText(copy.created)).toHaveLength(2);
  expect(screen.getAllByText(copy.invited)).toHaveLength(2);
  expect(screen.getAllByText(copy.activated)).toHaveLength(2);
  expect(screen.getAllByText(copy.firstLogin)).toHaveLength(2);
});

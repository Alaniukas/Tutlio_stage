import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
const translations = vi.hoisted(() => ({ t: (key: string) => key, locale: 'en' }));
vi.mock('../../src/lib/i18n', () => ({ useTranslation: () => translations }));
import MvAccountActivate from '../../src/pages/MvAccountActivate';
import { schoolFamilyAccountCopy, schoolFamilyAccountTranslations } from '../../src/lib/schoolFamilyAccountCopy';
const preview = { role: 'student', email: 'st-abcd-2345', studentName: 'QA Child', orgName: 'Demo School', branding: null,
  alreadyActivated: false, requiresPasswordSetup: true, loginUrl: 'https://tutlio.lt/login?email=st-abcd-2345&portal=student' };
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it('requires a matching chosen password before explicitly activating the invited account', async () => {
  const fetcher = vi.fn(async (_url: string, init?: RequestInit) => ({ ok: true, json: async () => init?.method === 'POST'
    ? { activated: true } : preview }));
  vi.stubGlobal('fetch', fetcher);
  render(<MemoryRouter initialEntries={['/account-activate?t=sf1.test']}><MvAccountActivate /></MemoryRouter>);
  const password = await screen.findByLabelText('auth.newPassword');
  expect(screen.getByText(schoolFamilyAccountCopy('en').activationStudentIntro.replace('{org}', preview.orgName))).toBeTruthy();
  expect(screen.queryByText('mvActivate.studentDesc')).toBeNull();
  expect(screen.queryByText(/temporary password|password.*email/i)).toBeNull();
  const confirm = screen.getByLabelText('onboard.confirmPassword');
  const button = screen.getByRole('button', { name: 'mvActivate.confirmBtn' });
  expect((button as HTMLButtonElement).disabled).toBe(true);
  fireEvent.change(password, { target: { value: 'ChildChosenPassword!' } });
  fireEvent.change(confirm, { target: { value: 'DifferentPassword!' } });
  expect((button as HTMLButtonElement).disabled).toBe(true);
  expect(fetcher.mock.calls.filter(call => call[1]?.method === 'POST')).toHaveLength(0);
  fireEvent.change(confirm, { target: { value: 'ChildChosenPassword!' } });
  fireEvent.click(button);
  await screen.findByText(schoolFamilyAccountCopy('en').activationSuccess);
  expect(screen.queryByText('mvActivate.success')).toBeNull();
  const write = fetcher.mock.calls.find(call => call[1]?.method === 'POST')!;
  expect(JSON.parse(write[1]!.body as string)).toEqual({ token: 'sf1.test', password: 'ChildChosenPassword!' });
  expect(screen.queryByLabelText('auth.newPassword')).toBeNull();
});

it('opens an activated account at login without a password form or another activation request', async () => {
  const fetcher = vi.fn(async () => ({ ok: true, json: async () => ({ ...preview, alreadyActivated: true, requiresPasswordSetup: false }) }));
  vi.stubGlobal('fetch', fetcher);
  render(<MemoryRouter initialEntries={['/account-activate?t=sf1.test']}><MvAccountActivate /></MemoryRouter>);
  await screen.findByRole('button', { name: 'mvActivate.goLogin' });
  expect(screen.getByText(schoolFamilyAccountCopy('en').activationReadyIntro)).toBeTruthy();
  expect(screen.getByText(schoolFamilyAccountCopy('en').activationSuccess)).toBeTruthy();
  expect(screen.queryByText('mvActivate.success')).toBeNull();
  expect(screen.queryByText('mvActivate.studentDesc')).toBeNull();
  expect(screen.queryByLabelText('auth.newPassword')).toBeNull();
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
});

it('uses the password-choice family description for a parent and preserves the legacy invitation description', async () => {
  const fetcher = vi.fn(async () => ({ ok: true, json: async () => ({ ...preview, role: 'parent' }) }));
  vi.stubGlobal('fetch', fetcher);
  render(<MemoryRouter initialEntries={['/account-activate?t=sf1.parent']}><MvAccountActivate /></MemoryRouter>);
  await screen.findByLabelText('auth.newPassword');
  expect(screen.getByText(schoolFamilyAccountCopy('en').activationParentIntro.replace('{org}', preview.orgName))).toBeTruthy();
  expect(screen.queryByText('mvActivate.parentDesc')).toBeNull();
  cleanup();
  render(<MemoryRouter initialEntries={['/account-activate?t=legacy.invite']}><MvAccountActivate /></MemoryRouter>);
  expect(await screen.findByText('mvActivate.parentDesc')).toBeTruthy();
});

it('provides both activation descriptions and the existing-password description in every supported school locale', () => {
  expect(schoolFamilyAccountCopy('unsupported-locale')).toBe(schoolFamilyAccountTranslations.en);
  expect(schoolFamilyAccountCopy('unsupported-locale').activationSuccess).toBeTruthy();
  expect(Object.keys(schoolFamilyAccountTranslations).sort()).toEqual(['lt','en','pl','lv','ee','fr','es','de','se','dk','fi','no','nl'].sort());
  for (const copy of Object.values(schoolFamilyAccountTranslations)) {
    expect(copy.activationStudentIntro).toContain('{org}');
    expect(copy.activationParentIntro).toContain('{org}');
    expect(copy.activationReadyIntro.length).toBeGreaterThan(30);
    expect(copy.activationSuccess.length).toBeGreaterThan(20);
  }
});

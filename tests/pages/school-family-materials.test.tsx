import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import SchoolFamilyMaterials from '@/pages/SchoolFamilyMaterials';

const mocks = vi.hoisted(() => ({ upload: vi.fn(), remember: vi.fn() }));
vi.mock('@/components/ParentLayout', () => ({ default: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock('@/components/StudentLayout', () => ({ default: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock('@/lib/apiHelpers', () => ({ authHeaders: async () => ({ Authorization: 'Bearer private-viewer' }) }));
vi.mock('@/lib/parentActiveChild', () => ({ getParentActiveChildId: () => '', setParentActiveChildId: mocks.remember }));
vi.mock('@/lib/supabase', () => ({ supabase: { storage: { from: () => ({ uploadToSignedUrl: mocks.upload }) } } }));

const reply = (data: unknown) => ({ ok: true, json: async () => data });
const children = [{ id: 'child-a', full_name: 'First child' }, { id: 'child-b', full_name: 'Second child' }];
const payload = (id: string, label: string) => ({ ok: true, student: { id, name: label }, recordingGroups: [],
  sessions: [{ id: `session-${id}`, start: '2026-09-28T10:00:00Z', group: label, topic: '', subject: '',
    tutorComment: `${label} homework`, files: [] }] });
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((r) => { resolve = r; }); return { promise, resolve }; }
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe('private school family material view', () => {
  it('discards a late first-child response after selecting another child', async () => {
    const late = deferred<ReturnType<typeof reply>>();
    vi.stubGlobal('fetch', vi.fn((url: string) => url.includes('children=1') ? Promise.resolve(reply({ children }))
      : url.includes('child-a') ? late.promise : Promise.resolve(reply(payload('child-b', 'Second child')))));
    render(<MemoryRouter><SchoolFamilyMaterials portal="parent" /></MemoryRouter>);
    const select = await screen.findByLabelText('Pasirinkite vaiką');
    fireEvent.change(select, { target: { value: 'child-b' } });
    await screen.findByText('Second child homework');
    await act(async () => { late.resolve(reply(payload('child-a', 'First child'))); });
    expect(screen.queryByText('First child homework')).toBeNull();
    expect(screen.getByText('Second child homework')).toBeTruthy();
    expect(mocks.remember).toHaveBeenCalledWith('child-b');
  });

  it('keeps an upload completion scoped to the child who submitted it', async () => {
    const uploaded = deferred<{ error: null }>(); mocks.upload.mockReturnValue(uploaded.promise);
    const fetcher = vi.fn((url: string, init?: RequestInit) => init?.method === 'POST' ? Promise.resolve(reply({ path: 'own/submission.pdf', token: 'test-upload' }))
      : url.includes('children=1') ? Promise.resolve(reply({ children }))
      : Promise.resolve(reply(payload(url.includes('child-a') ? 'child-a' : 'child-b', url.includes('child-a') ? 'First child' : 'Second child'))));
    vi.stubGlobal('fetch', fetcher);
    render(<MemoryRouter><SchoolFamilyMaterials portal="parent" /></MemoryRouter>);
    await screen.findByText('First child homework');
    fireEvent.change(screen.getByLabelText('Įkelti First child'), { target: { files: [new File(['answer'], 'answer.pdf', { type: 'application/pdf' })] } });
    await waitFor(() => expect(mocks.upload).toHaveBeenCalled());
    fireEvent.change(screen.getByLabelText('Pasirinkite vaiką'), { target: { value: 'child-b' } });
    await screen.findByText('Second child homework');
    await act(async () => { uploaded.resolve({ error: null }); });
    await waitFor(() => expect((screen.getByLabelText('Įkelti Second child') as HTMLInputElement).disabled).toBe(false));
    expect(screen.queryByText('First child homework')).toBeNull();
    const posted = fetcher.mock.calls.find(([, init]) => init?.method === 'POST')![1];
    expect(JSON.parse(String(posted?.body))).toMatchObject({ student: 'child-a', sessionId: 'session-child-a' });
  });

  it('hides peer submissions even if a malformed payload includes them', async () => {
    const data = payload('child-a', 'First child');
    const files = [{ name: 'teacher.pdf', folderId: 'a', url: '/api/private', submission: false, own: false },
      { name: 'own-answer.pdf', folderId: 'a', url: '/api/private', submission: true, own: true },
      { name: 'peer-answer.pdf', folderId: 'a', url: '/api/private', submission: true, own: false }];
    vi.stubGlobal('fetch', vi.fn((url: string) => Promise.resolve(reply(url.includes('children=1') ? { children: [children[0]] }
      : { ...data, sessions: [{ ...data.sessions[0], files }] }))));
    render(<MemoryRouter><SchoolFamilyMaterials portal="student" /></MemoryRouter>);
    expect(await screen.findByRole('button', { name: 'teacher.pdf' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'own-answer.pdf' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'peer-answer.pdf' })).toBeNull();
  });
});

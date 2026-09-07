import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const PRO_KLASE_ORG = '3422031d-6e21-424d-980b-35a9c6d7b8f1';

const mocks = vi.hoisted(() => {
  const createUser = vi.fn();
  const listUsers = vi.fn();
  const updateUserById = vi.fn();
  const from = vi.fn();
  const rpc = vi.fn();
  return {
    createUser,
    listUsers,
    updateUserById,
    from,
    rpc,
    createClient: vi.fn(() => ({
      from,
      rpc,
      auth: { admin: { createUser, listUsers, updateUserById } },
    })),
  };
});

vi.mock('@supabase/supabase-js', () => ({ createClient: mocks.createClient }));

import handler from '../../api/register-parent';

function mockReq(body: Record<string, unknown>) {
  return { method: 'POST', headers: {}, body, query: {} } as any;
}

function mockRes() {
  const output: { statusCode: number; body: any } = { statusCode: 0, body: null };
  const response: any = {
    status(code: number) {
      output.statusCode = code;
      return response;
    },
    json(body: any) {
      output.body = body;
      return response;
    },
    getResult: () => output,
  };
  return response;
}

function chain(result: { data: any; error: any }) {
  const q: any = {};
  const self = () => q;
  q.select = self;
  q.eq = self;
  q.ilike = self;
  q.order = self;
  q.limit = self;
  q.upsert = () => q;
  q.update = () => q;
  q.maybeSingle = async () => result;
  q.single = async () => result;
  q.then = (resolve: (v: any) => unknown, reject: (e: any) => unknown) =>
    Promise.resolve(result).then(resolve, reject);
  return q;
}

const invite = {
  id: 'invite-1',
  parent_email: 'alaniukasa@gmail.com',
  student_id: 'student-1',
  used: false,
};

describe('POST /api/register-parent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-role-test');
    mocks.from.mockImplementation((table: string) => {
      if (table === 'parent_invites') return chain({ data: invite, error: null });
      if (table === 'students') {
        return chain({
          data: { organization_id: PRO_KLASE_ORG, tutor_id: 'tutor-1', linked_user_id: null },
          error: null,
        });
      }
      if (table === 'parent_profiles') return chain({ data: { id: 'pp-1' }, error: null });
      return chain({ data: null, error: null });
    });
    mocks.createUser.mockResolvedValue({ data: { user: { id: 'new-user' } }, error: null });
    mocks.updateUserById.mockResolvedValue({ data: {}, error: null });
    mocks.rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202' } });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('does not import frontend Vite modules into the serverless bundle', () => {
    const source = readFileSync(resolve(process.cwd(), 'api/register-parent.ts'), 'utf8');
    expect(source).not.toContain('../src/lib/proKlaseLegal');
    expect(source).not.toContain('../src/lib/studentGrade');
    expect(source).toContain('./_lib/proKlaseLegal.js');
  });

  it('rejects a missing 1–12 grade before touching Auth', async () => {
    const response = mockRes();
    await handler(mockReq({
      token: 'tok',
      fullName: 'Agne',
      password: 'TutlioQaDemo2026!',
      acceptedPrivacy: true,
      acceptedTerms: true,
    }), response);
    expect(response.getResult()).toMatchObject({
      statusCode: 400,
      body: { code: 'grade_required' },
    });
    expect(mocks.createUser).not.toHaveBeenCalled();
  });

  it('requires Pro Klasė legal flags even when checkboxes are sent as strings', async () => {
    const response = mockRes();
    await handler(mockReq({
      token: 'tok',
      fullName: 'Agne',
      password: 'TutlioQaDemo2026!',
      childGrade: '10',
      acceptedPrivacy: false,
      acceptedTerms: true,
    }), response);
    expect(response.getResult()).toMatchObject({
      statusCode: 400,
      body: { code: 'legal_required' },
    });
    expect(mocks.createUser).not.toHaveBeenCalled();
  });

  it('creates a parent Auth user with role metadata and legal timestamps', async () => {
    const response = mockRes();
    await handler(mockReq({
      token: 'tok',
      fullName: 'Agne Rubeziene',
      password: 'TutlioQaDemo2026!',
      childGrade: '10 klasė',
      acceptedPrivacy: true,
      acceptedTerms: 'true',
    }), response);
    expect(response.getResult()).toEqual({ statusCode: 200, body: { success: true } });
    expect(mocks.createUser).toHaveBeenCalledWith(expect.objectContaining({
      email: 'alaniukasa@gmail.com',
      email_confirm: true,
      user_metadata: { role: 'parent', full_name: 'Agne Rubeziene' },
    }));
  });

  it('links an existing Auth user instead of returning registration_failed', async () => {
    mocks.createUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'A user with this email address has already been registered', code: 'email_exists' },
    });
    mocks.rpc.mockResolvedValue({ data: 'existing-user', error: null });
    const response = mockRes();
    await handler(mockReq({
      token: 'tok',
      fullName: 'Alanas Azikejev',
      password: 'TutlioQaDemo2026!',
      childGrade: '5',
      acceptedPrivacy: true,
      acceptedTerms: true,
    }), response);
    expect(response.getResult()).toEqual({ statusCode: 200, body: { success: true } });
    expect(mocks.updateUserById).toHaveBeenCalledWith('existing-user', { password: 'TutlioQaDemo2026!' });
  });
});

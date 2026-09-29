import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { notifyAfterOrgAdminSessionsCreated } from '@/pages/company/orgAdminSessionCreate';
import { sendEmail } from '@/lib/email';
import { PRO_KLASE_QA_ORG_ID } from '@/lib/marketMoney';

vi.mock('@/lib/email', () => ({ sendEmail: vi.fn(async () => true) }));

const sessions = [{
  id: 'lesson', student_id: 'student', paid: false, price: 30,
  start_time: '2026-10-01T14:00:00Z', end_time: '2026-10-01T15:00:00Z',
}];
const supabase = {
  from: (table: string) => {
    const chain = {
      select: () => chain,
      eq: () => chain,
      single: async () => ({ data: {
        full_name: 'Teacher', email: 'teacher@example.com', organization_id: PRO_KLASE_QA_ORG_ID,
      } }),
      in: async () => ({ data: [{
        id: 'student', full_name: 'Student', email: 'student@example.com',
        payer_email: 'parent@example.com', payment_payer: 'parent',
      }] }),
    };
    if (!['profiles', 'students'].includes(table)) throw new Error(table);
    return chain;
  },
} as unknown as SupabaseClient;

beforeEach(() => vi.clearAllMocks());

describe.each([false, true])('lesson creation emails (recurring=%s)', (recurring) => {
  it('notifies student, parent and tutor by default', async () => {
    await notifyAfterOrgAdminSessionsCreated(supabase, 'tutor', sessions, 'Maths', recurring);
    expect(vi.mocked(sendEmail).mock.calls.map(([mail]) => mail.to).sort()).toEqual([
      'parent@example.com', 'student@example.com', 'teacher@example.com',
    ]);
  });

  it('keeps only the tutor notification when client emails are unchecked', async () => {
    await notifyAfterOrgAdminSessionsCreated(supabase, 'tutor', sessions, 'Maths', recurring, false, true);
    expect(vi.mocked(sendEmail).mock.calls.map(([mail]) => mail.to)).toEqual(['teacher@example.com']);
  });
});

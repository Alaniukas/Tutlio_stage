// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PRO_KLASE_ORG_ID } from '../../src/lib/marketMoney';
import { verifyMvAccountActivationToken } from '../../api/_lib/mvAccountActivationToken';

const mocks = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock('resend', () => ({ Resend: class { emails = { send: mocks.send }; } }));
vi.mock('../../api/_lib/orgEmailReplyTo', () => ({ resolveOrgEmailReplyToWithServiceClient: async () => 'help@academy.test' }));
import { runStudentRegistrationReminders, buildStudentRegistrationReminderEmail } from '../../api/_lib/studentRegistrationReminders';

function fixture() {
  const org = { id: PRO_KLASE_ORG_ID, name: 'Academy', preferred_locale: 'lt', features: {} as Record<string, unknown> };
  const student = { id: 's1', organization_id: org.id, full_name: 'Child', email: null, payer_email: 'payer@example.test',
    invite_code: 'code', linked_user_id: null, parent_user_id: 'parent' };
  const state = { student_id: student.id, full_name: student.full_name, registration_pending: true,
    pending_since: new Date(Date.now() - 25 * 3600_000).toISOString(), next_session_at: new Date(Date.now() + 3600_000).toISOString() };
  const users: Record<string, any> = { parent: { id: 'parent', email: 'parent@example.test', app_metadata: { provisioned_by_organization: org.id }, user_metadata: {} } };
  const tables: Record<string, any[]> = { organizations: [org], students: [student], student_registration_reminders: [] };
  const states = [state];
  let freshPending = true;
  const db: any = {
    auth: { admin: { getUserById: vi.fn(async (id) => ({ data: { user: users[id] }, error: null })) } },
    from: (table: string) => {
      const filters: Array<(row: any) => boolean> = [];
      const b: any = {
        select: () => b, order: () => b,
        eq: (key: string, value: unknown) => { filters.push((row) => row[key] === value); return b; },
        range: async (start: number, end: number) => ({ data: tables[table].slice(start, end + 1), error: null }),
        maybeSingle: async () => ({ data: tables[table].find((row) => filters.every((f) => f(row))) || null, error: null }),
        upsert: async (row: any) => { if (!tables[table].some((existing) => existing.delivery_key === row.delivery_key)) tables[table].push(row); return { error: null }; },
      }; return b;
    },
    rpc: (_name: string, params: { p_organization_id: string }) => {
      let studentId = '';
      const b: any = {
        range: async () => ({ data: params.p_organization_id === org.id ? states : [], error: null }),
        eq: (_key: string, id: string) => { studentId = id; return b; },
        maybeSingle: async () => ({ data: { ...states.find((row) => row.student_id === studentId), registration_pending: freshPending }, error: null }),
      }; return b;
    },
  };
  return { db, org, student, state, states, tables, users, activateBeforeSend: () => { freshPending = false; } };
}
beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv('RESEND_API_KEY', 'test'); vi.stubEnv('JOIN_LINK_SECRET', 'test-activation-secret'); vi.stubEnv('TUTLIO_DEV_SUPPRESS_EMAIL', '0');
  mocks.send.mockResolvedValue({ data: { id: 'email-id' }, error: null });
});

describe('automatic registration reminders', () => {
  it('sends once to the bound parent account and remembers confirmed delivery across cron runs', async () => {
    const f = fixture();
    expect((await runStudentRegistrationReminders(f.db, 'https://tutlio.lt')).sent).toBe(1);
    expect((await runStudentRegistrationReminders(f.db, 'https://tutlio.lt')).sent).toBe(0);
    expect(mocks.send).toHaveBeenCalledTimes(1);
    const [email, options] = mocks.send.mock.calls[0];
    expect(email.to).toEqual(['parent@example.test']); // Never redirect an existing account token to an edited payer email.
    expect(options.idempotencyKey).toBe(f.tables.student_registration_reminders[0].delivery_key);
    const encodedToken = email.html.match(/account-activate\?t=([^"&]+)/)[1];
    const token = verifyMvAccountActivationToken(decodeURIComponent(encodedToken));
    expect(token.ok && token.payload).toMatchObject({ studentId: 's1', role: 'parent', email: 'parent@example.test' });
  });
  it('deduplicates the same parent across siblings and tutor assignments', async () => {
    const f = fixture();
    f.tables.students.push({ ...f.student, id: 's2', full_name: 'Sibling' }); f.states.push({ ...f.state, student_id: 's2' });
    await runStudentRegistrationReminders(f.db, 'https://tutlio.lt'); expect(mocks.send).toHaveBeenCalledTimes(1);
  });
  it('retries provider failures with the same idempotency key and does not stamp unsuccessful delivery', async () => {
    const f = fixture(); mocks.send.mockResolvedValueOnce({ data: null, error: { message: 'Temporary failure' } });
    expect((await runStudentRegistrationReminders(f.db, 'https://tutlio.lt')).failed).toBe(1);
    expect(f.tables.student_registration_reminders).toHaveLength(0);
    expect((await runStudentRegistrationReminders(f.db, 'https://tutlio.lt')).sent).toBe(1);
    expect(mocks.send.mock.calls[0][1]).toEqual(mocks.send.mock.calls[1][1]);
  });
  it('does not count an empty provider response as delivery', async () => {
    const f = fixture(); mocks.send.mockResolvedValue({ data: null, error: null });
    await runStudentRegistrationReminders(f.db, 'https://tutlio.lt'); expect(f.tables.student_registration_reminders).toHaveLength(0);
  });
  it('skips registrations under 24 hours, registered accounts and clients without a future lesson', async () => {
    for (const patch of [{ pending_since: new Date().toISOString() }, { registration_pending: false }, { next_session_at: null }]) {
      const f = fixture(); Object.assign(f.state, patch); await runStudentRegistrationReminders(f.db, 'https://tutlio.lt');
    }
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it('rechecks family activation immediately before sending', async () => {
    const f = fixture(); f.activateBeforeSend(); await runStudentRegistrationReminders(f.db, 'https://tutlio.lt');
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it('uses an ordinary registration link when no account has been created', async () => {
    const f = fixture(); f.student.parent_user_id = null as any;
    await runStudentRegistrationReminders(f.db, 'https://tutlio.lt');
    expect(mocks.send.mock.calls[0][0].html).toContain('/book/code');
    expect(mocks.send.mock.calls[0][0].to).toEqual(['payer@example.test']);
  });
  it('keeps other organizations disabled and respects explicit rollback', async () => {
    for (const disabled of [{ id: 'other', features: {} }, { id: PRO_KLASE_ORG_ID, features: { pending_registration_lessons: false } }]) {
      const f = fixture(); Object.assign(f.org, disabled); await runStudentRegistrationReminders(f.db, 'https://tutlio.lt');
    }
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it('uses the target organization brand and safely renders client names', () => {
    const email = buildStudentRegistrationReminderEmail({ id: 'other', name: 'Other Academy', preferred_locale: 'en',
      brand_color: '#123456', features: { pending_registration_lessons: true, public_name: 'Target Academy' } }, '<script>Child</script>', 'https://example.test/activate');
    expect(email.subject).toContain('Target Academy'); expect(email.html).toContain('&lt;script&gt;Child&lt;/script&gt;');
    expect(email.html).not.toContain('Pro Klasė'); expect(email.html).not.toContain('Mokslo vaisiai');
    expect(email.html).toContain('#123456');
  });
});

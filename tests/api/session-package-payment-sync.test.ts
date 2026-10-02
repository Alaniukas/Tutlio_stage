// @vitest-environment node
import { Buffer } from 'node:buffer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  rpc: vi.fn(async (_name: string, _params: unknown) => ({ data: 'sales-invoice-1', error: null })),
  checkoutRetrieve: vi.fn(),
  constructEvent: vi.fn(),
  syncCalendar: vi.fn(async (_sessionId: string, _tutorId: string) => {}),
  recordFee: vi.fn(async (_supabase: unknown, _params: unknown) => {}),
  issueInvoice: vi.fn(async () => {}),
  markPackageInvoicesPaid: vi.fn(async () => {}),
  confirmTrialReservations: vi.fn(async () => {}),
  applyMonthlyExpiry: vi.fn(async () => {}),
  fetch: vi.fn(async (_input: unknown, _init?: unknown) => ({ ok: true })),
}));

vi.mock('stripe', () => ({
  default: class StripeMock {
    webhooks = { constructEvent: mocks.constructEvent };
  },
}));
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ from: mocks.from, rpc: mocks.rpc }),
}));
vi.mock('../../api/_lib/stripeDirectCharge.js', () => ({
  retrieveConnectCheckoutSession: mocks.checkoutRetrieve,
  resolveTutorStripeAccount: vi.fn(async () => 'acct_org'),
}));
vi.mock('../../api/_lib/google-calendar.js', () => ({
  syncSessionToGoogle: mocks.syncCalendar,
}));
vi.mock('../../api/_lib/platformFeeLedger.js', () => ({
  recordStripePlatformFee: mocks.recordFee,
  metadataBaseEur: () => null,
}));
vi.mock('../../api/_lib/issuePackageSalesInvoice.js', () => ({
  tryIssueSalesInvoiceForStripePackage: mocks.issueInvoice,
}));
vi.mock('../../api/_lib/markPackageInvoicePaid.js', () => ({
  markInvoicesPaidForPackage: mocks.markPackageInvoicesPaid,
}));
vi.mock('../../api/_lib/enterpriseLicenseWebhook.js', () => ({
  handleEnterpriseCheckoutCompleted: vi.fn(),
  handleEnterpriseLicenseSubscriptionDeleted: vi.fn(),
  syncEnterpriseLicenseSubscription: vi.fn(),
}));
vi.mock('../../api/_lib/stripe-subscription-env.js', () => ({
  isSubscriptionOnlyPriceId: () => false,
}));
vi.mock('../../api/_lib/stripeAccountOnboarding.js', () => ({
  summarizeStripeOnboarding: vi.fn(),
}));
vi.mock('../../api/_lib/trialReservation.js', () => ({
  sendTrialReservationConfirmedNotifications: mocks.confirmTrialReservations,
}));
vi.mock('../../api/_lib/packageMonth.js', () => ({
  applyMonthlyPackageExpiry: mocks.applyMonthlyExpiry,
}));
vi.mock('../../api/_lib/schoolMonthlyInvoiceEmail.js', () => ({
  markSchoolMonthlyInvoicePaid: vi.fn(),
}));

type Row = Record<string, any>;
type Filter = { op: 'eq' | 'neq' | 'is'; column: string; value: unknown };
type QueryResult = { data: Row | Row[] | null; error: { message: string; code?: string } | null };

/** Resolve filters against current rows when awaited, like an atomic Postgres UPDATE. */
class PaymentDatabase {
  tables: Record<string, Row[]>;
  operations: Array<{ table: string; update: Row | null; filters: Filter[]; affected: number }> = [];
  private failingUpdates: string[] = [];

  constructor() {
    const student = {
      id: 'student-1',
      full_name: 'Trial Student',
      email: 'student@example.test',
      payment_payer: 'parent',
      payer_email: 'parent@example.test',
      payer_name: 'Trial Parent',
      credit_balance: 0,
    };
    const tutor = {
      id: 'tutor-1',
      full_name: 'Trial Tutor',
      email: 'tutor@example.test',
      organization_id: 'org-1',
      stripe_account_id: null,
      cancellation_hours: 24,
      cancellation_fee_percent: 0,
    };
    this.tables = {
      sessions: [{
        id: 'session-1',
        student_id: student.id,
        tutor_id: tutor.id,
        lesson_package_id: 'package-1',
        paid: false,
        payment_status: 'pending',
        stripe_checkout_session_id: 'cs_old_session',
        cancellation_penalty_stripe_paid_at: null,
        price: 10,
        topic: 'Mathematics',
        start_time: '2026-10-01T10:00:00.000Z',
        end_time: '2026-10-01T11:00:00.000Z',
        meeting_link: 'https://meet.example.test/trial',
        credit_applied_amount: 0,
        students: student,
        profiles: tutor,
      }],
      lesson_packages: [{
        id: 'package-1',
        student_id: student.id,
        tutor_id: tutor.id,
        paid: false,
        payment_status: 'pending',
        paid_at: null,
        active: false,
        stripe_checkout_session_id: 'cs_old_package',
        total_lessons: 1,
        available_lessons: 1,
        total_price: 10,
        payment_method: 'stripe',
        manual_sales_invoice_id: null,
        pool_organization_id: 'org-1',
        students: student,
        subject: { name: 'Mathematics' },
        lesson_package_items: [],
      }],
      profiles: [tutor],
      students: [student],
      organizations: [{ id: 'org-1', name: 'Trial Organization', stripe_account_id: 'acct_org' }],
    };
  }

  get session() { return this.tables.sessions[0]; }
  get package() { return this.tables.lesson_packages[0]; }

  failNextUpdate(table: string) {
    this.failingUpdates.push(table);
  }

  updatedRows(table: string) {
    return this.operations
      .filter(operation => operation.table === table && operation.update)
      .reduce((count, operation) => count + operation.affected, 0);
  }

  from(table: string) {
    const filters: Filter[] = [];
    let payload: Row | null = null;
    let returningRows = false;
    let result: Promise<QueryResult> | null = null;
    const execute = (single: boolean): Promise<QueryResult> => {
      if (result) return result;
      const operation = { table, update: payload, filters: [...filters], affected: 0 };
      this.operations.push(operation);
      if (payload && this.failingUpdates[0] === table) {
        this.failingUpdates.shift();
        return result = Promise.resolve({ data: null, error: { message: 'Temporary database failure' } });
      }
      const rows = (this.tables[table] || []).filter(row => filters.every(filter => {
        if (filter.op === 'neq') return row[filter.column] != null && row[filter.column] !== filter.value;
        if (filter.op === 'is') return (row[filter.column] ?? null) === filter.value;
        return row[filter.column] === filter.value;
      }));
      if (payload) {
        rows.forEach(row => Object.assign(row, payload));
        operation.affected = rows.length;
      }
      const data = payload && !returningRows ? null : structuredClone(single ? rows[0] || null : rows);
      return result = Promise.resolve({ data, error: null });
    };
    const query = {
      select(_columns: string) { returningRows = true; return query; },
      update(update: Row) { payload = update; return query; },
      eq(column: string, value: unknown) { filters.push({ op: 'eq', column, value }); return query; },
      neq(column: string, value: unknown) { filters.push({ op: 'neq', column, value }); return query; },
      is(column: string, value: unknown) { filters.push({ op: 'is', column, value }); return query; },
      single() { return execute(true); },
      maybeSingle() { return execute(true); },
      then(resolve: (value: QueryResult) => unknown, reject?: (reason: unknown) => unknown) {
        return execute(false).then(resolve, reject);
      },
    };
    return query;
  }
}

function response() {
  const result = { status: 200, body: null as any };
  const res = {
    status(status: number) { result.status = status; return res; },
    json(body: unknown) { result.body = body; return res; },
    send(body: unknown) { result.body = body; return res; },
  };
  return { res, result };
}

type Endpoint = 'confirm' | 'webhook' | 'package-confirm';
const endpoints: Endpoint[] = ['confirm', 'webhook'];
let db: PaymentDatabase;
let checkout: Row;
let eventType: string;

async function callEndpoint(endpoint: Endpoint) {
  const { res, result } = response();
  if (endpoint === 'confirm') {
    const handler = (await import('../../api/confirm-stripe-payment')).default;
    await handler({
      method: 'POST',
      body: { sessionId: 'session-1', checkoutSessionId: checkout.id },
    } as any, res as any);
  } else if (endpoint === 'package-confirm') {
    const handler = (await import('../../api/confirm-package-payment')).default;
    await handler({ method: 'POST', body: { sessionId: checkout.id }, headers: {} } as any, res as any);
  } else {
    const handler = (await import('../../api/stripe-webhook')).default;
    const req = {
      method: 'POST',
      headers: { 'stripe-signature': 'test-signature' },
      async *[Symbol.asyncIterator]() { yield Buffer.from('{}'); },
    };
    await handler(req as any, res as any);
  }
  return result;
}

function emails() {
  return mocks.fetch.mock.calls.map(call => JSON.parse((call[1] as { body: string }).body));
}

function expectPaidTrial() {
  expect(db.session).toMatchObject({ paid: true, payment_status: 'paid' });
  expect(db.package).toMatchObject({
    paid: true,
    payment_status: 'paid',
    active: true,
    stripe_checkout_session_id: checkout.id,
    total_lessons: 1,
    available_lessons: 1,
  });
  expect(new Date(db.package.paid_at).getTime()).toBeGreaterThan(0);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_placeholder');
  vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'whsec_test_placeholder');
  vi.stubEnv('SUPABASE_URL', 'https://example.supabase.co');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-service-role');
  vi.stubEnv('APP_URL', 'https://tutlio.example.test');
  vi.stubGlobal('fetch', mocks.fetch);
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  db = new PaymentDatabase();
  checkout = {
    id: 'cs_successful_session',
    mode: 'payment',
    payment_status: 'paid',
    amount_total: 1000,
    metadata: { tutlio_session_id: 'session-1' },
  };
  eventType = 'checkout.session.completed';
  mocks.from.mockImplementation(table => db.from(table));
  mocks.checkoutRetrieve.mockImplementation(async () => structuredClone(checkout));
  mocks.constructEvent.mockImplementation(() => ({ type: eventType, data: { object: structuredClone(checkout) } }));
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('session Stripe payment synchronizes its trial package', () => {
  it.each(endpoints)('%s retries Pro Klasė sales invoicing on first payment and already-paid callbacks', async endpoint => {
    const orgId = '3422031d-6e21-424d-980b-35a9c6d7b8f1';
    db.tables.profiles[0].organization_id = orgId;
    db.tables.organizations[0].id = orgId;
    db.package.pool_organization_id = orgId;

    expect((await callEndpoint(endpoint)).status).toBe(200);
    expect((await callEndpoint(endpoint)).status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledTimes(2);
    expect(mocks.rpc).toHaveBeenCalledWith('issue_proklase_paid_source_invoice', {
      p_source_type: 'session', p_source_id: 'session-1', p_checkout_id: checkout.id, p_base_amount: 10,
    });
    expect(emails()).toHaveLength(2);
  });

  it('issues a Pro Klasė package invoice when the success page confirms first and retries on webhook replay', async () => {
    const orgId = '3422031d-6e21-424d-980b-35a9c6d7b8f1';
    db.tables.profiles[0].organization_id = orgId;
    db.tables.organizations[0].id = orgId;
    db.package.pool_organization_id = orgId;
    db.package.stripe_checkout_session_id = checkout.id;
    checkout.metadata = { tutlio_package_id: 'package-1' };

    expect((await callEndpoint('package-confirm')).status).toBe(200);
    expect((await callEndpoint('webhook')).status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledTimes(2);
    expect(mocks.rpc).toHaveBeenCalledWith('issue_proklase_paid_source_invoice', {
      p_source_type: 'package', p_source_id: 'package-1', p_checkout_id: checkout.id, p_base_amount: 10,
    });
    expect(mocks.issueInvoice).not.toHaveBeenCalled();
  });

  it.each(endpoints)('%s marks the linked trial package paid and active with the successful checkout', async endpoint => {
    const result = await callEndpoint(endpoint);

    expect(result.status).toBe(200);
    expectPaidTrial();
    expect(db.session.stripe_checkout_session_id).toBe(checkout.id);
    expect(emails().map(email => [email.type, email.to])).toEqual([
      ['payment_success', 'student@example.test'],
      ['payment_success', 'parent@example.test'],
    ]);
    expect(mocks.recordFee).toHaveBeenCalledTimes(1);
    expect(mocks.recordFee.mock.calls[0][1]).toMatchObject({ sourceType: 'session', sourceId: 'session-1' });
    expect(mocks.issueInvoice).not.toHaveBeenCalled();
  });

  it('also synchronizes an asynchronous successful checkout webhook', async () => {
    eventType = 'checkout.session.async_payment_succeeded';

    expect((await callEndpoint('webhook')).status).toBe(200);
    expectPaidTrial();
  });

  it('handles the confirm/webhook race and replays without repeated receipts or package emails', async () => {
    const results = await Promise.all(endpoints.map(callEndpoint));

    expect(results.map(result => result.status)).toEqual([200, 200]);
    expectPaidTrial();
    expect(db.updatedRows('sessions')).toBe(1);
    expect(db.updatedRows('lesson_packages')).toBe(1);
    expect(mocks.recordFee).toHaveBeenCalledTimes(1);
    expect(emails()).toHaveLength(2);
    expect(emails().every(email => email.type === 'payment_success')).toBe(true);
    const paidAt = db.package.paid_at;

    await callEndpoint('confirm');
    await callEndpoint('webhook');

    expect(db.package.paid_at).toBe(paidAt);
    expect(db.updatedRows('lesson_packages')).toBe(1);
    expect(mocks.recordFee).toHaveBeenCalledTimes(1);
    expect(emails()).toHaveLength(2);
  });

  it.each(endpoints)('%s repairs an already-paid lesson whose linked package is still pending', async endpoint => {
    Object.assign(db.session, { paid: true, payment_status: 'paid', stripe_checkout_session_id: checkout.id });

    const result = await callEndpoint(endpoint);

    expect(result.status).toBe(200);
    expectPaidTrial();
    expect(db.updatedRows('sessions')).toBe(0);
    expect(db.updatedRows('lesson_packages')).toBe(1);
    expect(emails()).toHaveLength(0);
    expect(mocks.recordFee).not.toHaveBeenCalled();
    if (endpoint === 'confirm') expect(result.body).toMatchObject({ already_paid: true });
  });

  it.each(endpoints)('%s preserves a package that was already paid through its own checkout', async endpoint => {
    Object.assign(db.package, {
      paid: true,
      payment_status: 'paid',
      active: false,
      paid_at: '2026-09-27T10:00:00.000Z',
      stripe_checkout_session_id: 'cs_successful_package',
    });
    const existingPackage = structuredClone(db.package);

    expect((await callEndpoint(endpoint)).status).toBe(200);

    expect(db.session.paid).toBe(true);
    expect(db.package).toEqual(existingPackage);
    expect(db.updatedRows('lesson_packages')).toBe(0);
    expect(emails()).toHaveLength(2);
    expect(emails().some(email => email.type === 'prepaid_package_success')).toBe(false);
  });

  it.each(endpoints)('%s preserves normal session-only payments without a linked package', async endpoint => {
    db.session.lesson_package_id = null;
    const unrelatedPackage = structuredClone(db.package);

    expect((await callEndpoint(endpoint)).status).toBe(200);

    expect(db.session.paid).toBe(true);
    expect(db.package).toEqual(unrelatedPackage);
    expect(db.operations.some(operation => operation.table === 'lesson_packages')).toBe(false);
    expect(emails()).toHaveLength(2);
  });

  it.each(endpoints)('%s does not pay the lesson or package for a cancellation penalty checkout', async endpoint => {
    checkout.metadata.is_penalty_payment = 'true';
    const pendingPackage = structuredClone(db.package);

    expect((await callEndpoint(endpoint)).status).toBe(200);

    expect(db.session.paid).toBe(false);
    expect(db.session.cancellation_penalty_stripe_paid_at).toBeTruthy();
    expect(db.package).toEqual(pendingPackage);
    expect(db.operations.some(operation => operation.table === 'lesson_packages')).toBe(false);
    expect(emails().every(email => email.type.startsWith('penalty_payment_'))).toBe(true);
  });

  it.each(endpoints)('%s does not pay either row until Stripe reports payment_status=paid', async endpoint => {
    checkout.payment_status = 'unpaid';
    const pendingSession = structuredClone(db.session);
    const pendingPackage = structuredClone(db.package);

    const result = await callEndpoint(endpoint);

    expect(result.status).toBe(endpoint === 'confirm' ? 400 : 200);
    expect(db.session).toEqual(pendingSession);
    expect(db.package).toEqual(pendingPackage);
    expect(emails()).toHaveLength(0);
    expect(mocks.recordFee).not.toHaveBeenCalled();
  });

  it.each(endpoints)('%s does not reactivate a cancelled package', async endpoint => {
    db.package.payment_status = 'cancelled';
    const cancelledPackage = structuredClone(db.package);

    expect((await callEndpoint(endpoint)).status).toBe(200);

    expect(db.session.paid).toBe(true);
    expect(db.package).toEqual(cancelledPackage);
    expect(db.updatedRows('lesson_packages')).toBe(0);
  });

  it.each(endpoints)('%s does not pay a linked package belonging to another student', async endpoint => {
    db.package.student_id = 'other-student';
    const otherStudentPackage = structuredClone(db.package);

    expect((await callEndpoint(endpoint)).status).toBe(200);

    expect(db.session.paid).toBe(true);
    expect(db.package).toEqual(otherStudentPackage);
    expect(db.updatedRows('lesson_packages')).toBe(0);
  });

  it.each(endpoints)('%s leaves a multi-lesson package unpaid when only one session is paid', async endpoint => {
    Object.assign(db.package, { total_lessons: 5, available_lessons: 5, total_price: 50 });
    const largerPackage = structuredClone(db.package);

    expect((await callEndpoint(endpoint)).status).toBe(200);

    expect(db.session.paid).toBe(true);
    expect(db.package).toEqual(largerPackage);
    expect(db.updatedRows('lesson_packages')).toBe(0);
    expect(emails()).toHaveLength(2);
  });

  it.each(endpoints)('%s retries a failed package sync after lesson receipts were already sent', async endpoint => {
    db.failNextUpdate('lesson_packages');

    const failedResult = await callEndpoint(endpoint);

    expect(failedResult.status).toBe(500);
    expect(db.session.paid).toBe(true);
    expect(db.package.paid).toBe(false);
    expect(emails()).toHaveLength(2);
    expect(mocks.recordFee).toHaveBeenCalledTimes(1);

    expect((await callEndpoint(endpoint)).status).toBe(200);
    expectPaidTrial();
    expect(db.updatedRows('lesson_packages')).toBe(1);
    expect(emails()).toHaveLength(2);
    expect(mocks.recordFee).toHaveBeenCalledTimes(1);
  });

  it('preserves package-metadata payments, their package receipts and linked-session confirmation', async () => {
    checkout.metadata = { tutlio_package_id: 'package-1' };

    expect((await callEndpoint('webhook')).status).toBe(200);

    expect(db.package).toMatchObject({ paid: true, payment_status: 'paid', active: true });
    expect(db.session).toMatchObject({ paid: true, payment_status: 'paid' });
    expect(emails().map(email => [email.type, email.to])).toEqual([
      ['prepaid_package_success', 'parent@example.test'],
      ['prepaid_package_success', 'student@example.test'],
    ]);
    expect(mocks.recordFee.mock.calls[0][1]).toMatchObject({ sourceType: 'package', sourceId: 'package-1' });
    expect(mocks.issueInvoice).toHaveBeenCalledTimes(1);
    expect(mocks.markPackageInvoicesPaid).toHaveBeenCalledTimes(1);
    expect(mocks.syncCalendar).toHaveBeenCalledWith('session-1', 'tutor-1');

    await callEndpoint('webhook');

    expect(emails()).toHaveLength(2);
    expect(mocks.recordFee).toHaveBeenCalledTimes(1);
    expect(mocks.issueInvoice).toHaveBeenCalledTimes(1);
  });
});

describe('linked-package helper validates checkout scope', () => {
  it.each([
    ['no session metadata', {}],
    ['another session', { tutlio_session_id: 'other-session' }],
    ['penalty payment', { tutlio_session_id: 'session-1', is_penalty_payment: 'true' }],
  ])('ignores a paid checkout with %s', async (_label, metadata) => {
    db.session.paid = true;
    checkout.metadata = metadata;
    const pendingPackage = structuredClone(db.package);
    const { markLinkedPackagePaidForSession } = await import('../../api/_lib/sessionPackagePayment');

    const changed = await markLinkedPackagePaidForSession({ from: mocks.from } as any, 'session-1', checkout as any);

    expect(changed).toBe(false);
    expect(db.package).toEqual(pendingPackage);
    expect(db.operations).toHaveLength(0);
    expect(emails()).toHaveLength(0);
  });

  it('does not activate a pending package before the linked session is marked paid', async () => {
    const pendingPackage = structuredClone(db.package);
    const { markLinkedPackagePaidForSession } = await import('../../api/_lib/sessionPackagePayment');

    expect(await markLinkedPackagePaidForSession({ from: mocks.from } as any, 'session-1', checkout as any)).toBe(false);

    expect(db.package).toEqual(pendingPackage);
    expect(db.operations.some(operation => operation.table === 'lesson_packages')).toBe(false);
  });
});

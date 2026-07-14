/**
 * Full safe signing lifecycle with real orchestration and in-memory external
 * boundaries: server reconciliation of the school GoSign result -> parent
 * invite -> server reconciliation of the parent result -> final PDF -> admin +
 * parent notifications -> first payment email. No browser return click is used.
 */
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeSupabase } from '../helpers/fakeSupabase';

const { pollMock } = vi.hoisted(() => ({ pollMock: vi.fn() }));

vi.mock('../../api/_lib/gosignClient', () => ({
  initOneSign: vi.fn(),
  pollSigningResult: pollMock,
}));

import { reconcileInProgressContractSignatures } from '../../api/_lib/schoolContractSigningReconcile';

function attachStorage(fake: FakeSupabase) {
  const objects = new Map<string, Buffer>();
  (fake as any).storage = {
    from: () => ({
      async upload(path: string, body: Blob) {
        objects.set(path, Buffer.from(await body.arrayBuffer()));
        return { data: { path }, error: null };
      },
      async download(path: string) {
        const bytes = objects.get(path);
        return bytes
          ? { data: new Blob([bytes], { type: 'application/pdf' }), error: null }
          : { data: null, error: { message: 'not found' } };
      },
      async createSignedUrl(path: string) {
        return { data: { signedUrl: `https://signed.test/${encodeURIComponent(path)}` }, error: null };
      },
    }),
  };
  return objects;
}

describe('school contract signing lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-test';
  });

  it('registers both signatures server-side without either signer returning from GoSign', async () => {
    const fake = new FakeSupabase();
    const objects = attachStorage(fake);
    const initialPdfPath = 'org-1/contracts/contract-1/Sutartis-SUT-001.pdf';
    objects.set(initialPdfPath, Buffer.from('%PDF-initial'));

    fake.db.school_contracts = [{
      id: 'contract-1',
      organization_id: 'org-1',
      student_id: 'student-1',
      signing_status: 'awaiting_school_signature',
      pdf_url: initialPdfPath,
      signed_contract_url: null,
      contract_number: 'SUT-001',
      require_second_parent: false,
      annual_fee: 300,
      additional_fee_amount: 25,
      additional_fee_purpose: 'Administravimas',
      organizations: {
        name: 'VšĮ Mokykla',
        email: 'info@school.lt',
        features: {
          school_contract_esign: true,
          school_contract_signing_email: 'sutartys@school.lt',
          school_contract_signature_reason: 'Ugdymo sutarties pasirašymas',
          school_contract_signature_location: 'Vilnius',
          school_contract_signature_contact: '+37060000000',
        },
      },
      student: {
        id: 'student-1',
        full_name: 'Jonukas Pet',
        payer_name: 'Irminta Mal',
        payer_email: 'parent@example.com',
        payer_personal_code: '39001010000',
        parent_secondary_name: null,
        parent_secondary_email: null,
        parent_secondary_personal_code: null,
      },
    }];
    fake.db.school_contract_signatures = [{
      id: 'sig-school',
      contract_id: 'contract-1',
      role: 'school',
      status: 'in_progress',
      token: 'school-token',
      token_expires_at: null,
      gosign_transaction_id: 'txn-school',
    }];
    fake.db.school_payment_installments = [{
      id: 'installment-1',
      contract_id: 'contract-1',
      installment_number: 1,
      amount: 325,
      due_date: '2026-09-01',
      payment_status: 'pending',
    }];

    pollMock.mockImplementation(async (transactionId: string) => ({
      status: 'Signed',
      signerCertificate: `certificate:${transactionId}`,
      signerCertificateTrusted: true,
      signedFileContent: Buffer.from(`%PDF-signed:${transactionId}`).toString('base64'),
      signedFileName: 'Sutartis-SUT-001.pdf',
    }));

    const emailCalls: any[] = [];
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
      emailCalls.push(JSON.parse(String(init?.body || '{}')));
      return { ok: true, status: 200, text: async () => '' } as Response;
    }));

    const schoolResult = await reconcileInProgressContractSignatures(fake as any, 'https://www.tutlio.lt');
    expect(schoolResult).toMatchObject({ scanned: 1, signed: 1, failed: 0 });
    expect(schoolResult.results).toEqual([
      expect.objectContaining({ id: 'sig-school', role: 'school', status: 'signed' }),
    ]);
    expect(fake.db.school_contracts[0].signing_status).toBe('signed_by_school');

    const parentRow = fake.db.school_contract_signatures.find((row) => row.role === 'parent_primary')!;
    expect(parentRow).toMatchObject({
      signer_email: 'parent@example.com',
      signer_personal_code: '39001010000',
      status: 'pending',
    });
    const invite = emailCalls.find((call) => call.type === 'school_contract_sign_request');
    expect(invite.to).toEqual(['parent@example.com']);
    expect(invite.data.signUrl).toBe(
      `https://www.tutlio.lt/pasirasymas/sutarties/per/go-sign/${parentRow.token}`,
    );
    expect(invite.data.pdfUrl).toContain('https://signed.test/');

    parentRow.status = 'in_progress';
    parentRow.gosign_transaction_id = 'txn-parent';
    const parentResult = await reconcileInProgressContractSignatures(fake as any, 'https://www.tutlio.lt');
    expect(parentResult).toMatchObject({ scanned: 1, signed: 1, failed: 0 });
    expect(parentResult.results).toEqual([
      expect.objectContaining({ role: 'parent_primary', status: 'signed', done: true }),
    ]);
    expect(fake.db.school_contracts[0]).toMatchObject({
      signing_status: 'signed',
      signed_contract_url: 'org-1/contracts/contract-1/signed/parent_primary.pdf',
    });

    expect(emailCalls.map((call) => call.type)).toEqual(expect.arrayContaining([
      'school_contract_sign_request',
      'school_contract_fully_signed',
      'school_contract_parent_signed_admin',
      'school_installment_request',
    ]));
    const adminNotice = emailCalls.find((call) => call.type === 'school_contract_parent_signed_admin');
    expect(adminNotice.to).toEqual(['sutartys@school.lt']);
    expect(adminNotice.data.contractsUrl).toBe('https://www.tutlio.lt/school/contracts');
    const payment = emailCalls.find((call) => call.type === 'school_installment_request');
    expect(payment.to).toEqual(['parent@example.com']);
    expect(payment.data).toMatchObject({ installmentId: 'installment-1', amount: '325.00' });
    expect(pollMock).toHaveBeenCalledWith('txn-school', { attempts: 1, delayMs: 0 });
    expect(pollMock).toHaveBeenCalledWith('txn-parent', { attempts: 1, delayMs: 0 });
  });

  it('isolates one failed transaction so another cron run can retry it', async () => {
    const fake = new FakeSupabase();
    fake.db.school_contract_signatures = [
      {
        id: 'sig-failing',
        token: 'token-failing',
        role: 'school',
        status: 'in_progress',
        gosign_transaction_id: 'txn-failing',
        updated_at: '2026-07-10T10:00:00.000Z',
      },
      {
        id: 'sig-without-transaction',
        token: 'token-pending',
        role: 'parent_primary',
        status: 'in_progress',
        gosign_transaction_id: null,
        updated_at: '2026-07-10T10:01:00.000Z',
      },
    ];
    const advance = vi.fn(async () => {
      throw new Error('temporary GoSign outage');
    });

    const result = await reconcileInProgressContractSignatures(fake as any, 'https://www.tutlio.lt', { advance });

    expect(result).toMatchObject({ scanned: 1, signed: 0, failed: 1 });
    expect(advance).toHaveBeenCalledTimes(1);
    expect(fake.db.school_contract_signatures[0].status).toBe('in_progress');
  });

  it('runs the protected server reconciliation every minute', () => {
    const config = JSON.parse(readFileSync('vercel.json', 'utf8'));
    expect(config.crons).toContainEqual({
      path: '/api/school-contract-sign-reconcile',
      schedule: '* * * * *',
    });
    expect(config.functions['api/school-contract-sign-reconcile.ts']).toMatchObject({ maxDuration: 60 });
  });
});

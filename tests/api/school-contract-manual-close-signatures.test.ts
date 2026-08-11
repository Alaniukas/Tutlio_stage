import { describe, expect, it, vi } from 'vitest';
import { FakeSupabase } from '../helpers/fakeSupabase';
import { closeOpenSignaturesAsManuallyMarked, pollAndAdvance } from '../../api/_lib/schoolContractSigning';

const { cancelMock, pollMock } = vi.hoisted(() => ({
  cancelMock: vi.fn(async () => undefined),
  pollMock: vi.fn(),
}));

vi.mock('../../api/_lib/gosignClient', () => ({
  initOneSign: vi.fn(),
  pollSigningResult: pollMock,
  cancelSigning: cancelMock,
  getSigningResult: vi.fn(),
}));

describe('closeOpenSignaturesAsManuallyMarked', () => {
  it('marks pending/in_progress rows signed, clears GoSign ids, and cancels transactions', async () => {
    const fake = new FakeSupabase();
    fake.db.school_contract_signatures = [
      {
        id: 'sig-open',
        contract_id: 'c1',
        role: 'parent_primary',
        status: 'in_progress',
        gosign_transaction_id: 'txn-99',
        signing_url: 'https://gosign.example/sign',
      },
      {
        id: 'sig-pending',
        contract_id: 'c1',
        role: 'parent_secondary',
        status: 'pending',
        gosign_transaction_id: null,
      },
      {
        id: 'sig-done',
        contract_id: 'c1',
        role: 'school',
        status: 'signed',
        gosign_transaction_id: 'txn-school',
      },
      {
        id: 'sig-other',
        contract_id: 'c2',
        role: 'parent_primary',
        status: 'in_progress',
        gosign_transaction_id: 'txn-other',
      },
    ];

    const cancelGoSign = vi.fn(async () => undefined);
    const result = await closeOpenSignaturesAsManuallyMarked(fake as any, {
      contractId: 'c1',
      adminUserId: 'admin-1',
      signedPdfPath: 'org/signed/c1.pdf',
      cancelGoSign,
    });

    expect(result).toEqual({ closed: 2, goSignCancelAttempts: 1 });
    expect(cancelGoSign).toHaveBeenCalledWith('txn-99');
    expect(fake.db.school_contract_signatures.find((r) => r.id === 'sig-open')).toMatchObject({
      status: 'signed',
      gosign_transaction_id: null,
      signing_url: null,
      manually_marked_by: 'admin-1',
      signed_pdf_path: 'org/signed/c1.pdf',
    });
    expect(fake.db.school_contract_signatures.find((r) => r.id === 'sig-pending')?.status).toBe('signed');
    expect(fake.db.school_contract_signatures.find((r) => r.id === 'sig-done')?.status).toBe('signed');
    expect(fake.db.school_contract_signatures.find((r) => r.id === 'sig-other')?.status).toBe('in_progress');
  });
});

describe('pollAndAdvance after admin manual finalize', () => {
  it('closes orphan in_progress rows without re-sending payment emails', async () => {
    const fake = new FakeSupabase();
    fake.db.school_contracts = [{
      id: 'contract-1',
      organization_id: 'org-1',
      student_id: 'student-1',
      signing_status: 'signed',
      signed_contract_url: 'org-1/signed/manual.pdf',
      pdf_url: 'org-1/contracts/contract-1.pdf',
      contract_number: 'SUT-1',
      organizations: { name: 'Mokykla', email: 'info@school.lt', features: { school_contract_esign: true } },
      student: {
        full_name: 'Vaikas',
        payer_name: 'Tevas',
        payer_email: 'parent@example.com',
      },
    }];
    fake.db.school_contract_signatures = [{
      id: 'sig-parent',
      contract_id: 'contract-1',
      role: 'parent_primary',
      status: 'in_progress',
      token: 'parent-token',
      gosign_transaction_id: 'txn-late',
      signing_url: 'https://gosign.example/x',
    }];
    fake.db.school_payment_installments = [{
      id: 'inst-1',
      contract_id: 'contract-1',
      installment_number: 1,
      amount: 240,
      payment_status: 'paid',
    }];

    const emailCalls: any[] = [];
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
      emailCalls.push(JSON.parse(String(init?.body || '{}')));
      return { ok: true, status: 200, text: async () => '' } as Response;
    }));

    const result = await pollAndAdvance(fake as any, 'parent-token', 'https://www.tutlio.lt');
    expect(result).toMatchObject({ status: 'signed', contractStatus: 'signed', done: true });
    expect(fake.db.school_contract_signatures[0]).toMatchObject({
      status: 'signed',
      gosign_transaction_id: null,
    });
    expect(pollMock).not.toHaveBeenCalled();
    expect(emailCalls.some((c) => c.type === 'school_installment_request')).toBe(false);
    expect(cancelMock).toHaveBeenCalledWith('txn-late');
  });
});

describe('parent signing link renewal and dead GoSign txs', () => {
  it('renewParentSignatureAccess extends an expired parent token in place', async () => {
    const { renewParentSignatureAccess, isSignatureTokenExpired } = await import('../../api/_lib/schoolContractSigning');
    const fake = new FakeSupabase();
    fake.db.school_contract_signatures = [{
      id: 'sig-1',
      role: 'parent_primary',
      status: 'pending',
      token_expires_at: '2020-01-01T00:00:00.000Z',
    }];

    expect(isSignatureTokenExpired(fake.db.school_contract_signatures[0])).toBe(true);
    const renewed = await renewParentSignatureAccess(fake as any, fake.db.school_contract_signatures[0]);
    expect(isSignatureTokenExpired(renewed)).toBe(false);
    expect(new Date(renewed.token_expires_at).getTime()).toBeGreaterThan(Date.now());
  });

  it('pollAndAdvance resets purged GoSign txs so the parent can restart', async () => {
    pollMock.mockRejectedValueOnce(new Error('GoSign SOAP fault: Transaction already purged.'));
    const fake = new FakeSupabase();
    fake.db.school_contracts = [{
      id: 'contract-1',
      organization_id: 'org-1',
      signing_status: 'signed_by_school',
      pdf_url: 'org/c.pdf',
      organizations: { name: 'School', email: 's@x.lt', features: { school_contract_esign: true } },
      student: { full_name: 'Kid', payer_name: 'Parent', payer_email: 'p@x.lt' },
    }];
    fake.db.school_contract_signatures = [{
      id: 'sig-purged',
      contract_id: 'contract-1',
      role: 'parent_primary',
      status: 'in_progress',
      token: 'parent-token',
      gosign_transaction_id: 'txn-dead',
      signing_url: 'https://gosign.example/dead',
      token_expires_at: new Date(Date.now() + 86400000).toISOString(),
    }];

    const result = await pollAndAdvance(fake as any, 'parent-token', 'https://www.tutlio.lt', {
      attempts: 1,
      delayMs: 0,
    });

    expect(result).toMatchObject({ status: 'pending', contractStatus: 'signed_by_school' });
    expect(fake.db.school_contract_signatures[0]).toMatchObject({
      status: 'pending',
      gosign_transaction_id: null,
      signing_url: null,
    });
    expect(String(fake.db.school_contract_signatures[0].error_message || '')).toMatch(/purged/i);
  });
});

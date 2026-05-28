/**
 * In-memory DB for school contract + payment API flow tests.
 */

export type FlowStudent = {
  id: string;
  organization_id: string;
  full_name: string;
  email: string;
  phone: string | null;
  payer_name: string | null;
  payer_email: string | null;
  payer_phone: string | null;
  payer_personal_code: string | null;
  parent_secondary_name: string | null;
  parent_secondary_email: string | null;
  parent_secondary_phone: string | null;
  parent_secondary_personal_code: string | null;
  parent_secondary_address: string | null;
  student_address: string | null;
  student_city: string | null;
  child_birth_date: string | null;
  media_publicity_consent: string | null;
  invite_code: string | null;
};

export type FlowContract = {
  id: string;
  organization_id: string;
  template_id: string | null;
  student_id: string;
  filled_body: string;
  annual_fee: number;
  contract_number: string | null;
  signing_status: 'draft' | 'sent' | 'signed';
  signed_at: string | null;
  sent_at: string | null;
  pdf_url: string | null;
  media_publicity_consent: string | null;
  additional_fee_amount: number | null;
  additional_fee_purpose: string | null;
};

export type FlowToken = {
  id: string;
  contract_id: string;
  token: string;
  expires_at: string;
  used_at: string | null;
};

export type FlowInstallment = {
  id: string;
  contract_id: string;
  installment_number: number;
  amount: number;
  due_date: string;
  payment_status: 'pending' | 'paid' | 'overdue' | 'failed';
  stripe_checkout_session_id: string | null;
  stripe_payment_intent_id: string | null;
  paid_at: string | null;
};

export class SchoolContractFlowDb {
  org = {
    id: 'org-school-1',
    name: 'Test Mokykla',
    email: 'school@test.lt',
    entity_type: 'school',
    stripe_account_id: 'acct_test_school',
    stripe_onboarding_complete: true,
  };

  adminUserId = 'admin-user-1';

  student: FlowStudent = {
    id: 'student-1',
    organization_id: 'org-school-1',
    full_name: 'Ona Testaitė',
    email: 'ona@test.lt',
    phone: null,
    payer_name: 'Tėvas Testas',
    payer_email: 'tevas@test.lt',
    payer_phone: '+37060000000',
    payer_personal_code: null,
    parent_secondary_name: null,
    parent_secondary_email: null,
    parent_secondary_phone: null,
    parent_secondary_personal_code: null,
    parent_secondary_address: null,
    student_address: null,
    student_city: null,
    child_birth_date: null,
    media_publicity_consent: null,
    invite_code: null,
  };

  template = {
    id: 'tpl-1',
    organization_id: 'org-school-1',
    pdf_url: 'org-school-1/templates/metine.docx',
  };

  contract: FlowContract = {
    id: 'contract-1',
    organization_id: 'org-school-1',
    template_id: 'tpl-1',
    student_id: 'student-1',
    filled_body: 'Sutartis {{student_name}} {{parent_name}}',
    annual_fee: 300,
    contract_number: 'SUT-001',
    signing_status: 'sent',
    signed_at: null,
    sent_at: new Date().toISOString(),
    pdf_url: 'org-school-1/contracts/contract-1/Sutartis-SUT-001.pdf',
    media_publicity_consent: null,
    additional_fee_amount: null,
    additional_fee_purpose: null,
  };

  tokens: FlowToken[] = [];
  installments: FlowInstallment[] = [
    {
      id: 'inst-1',
      contract_id: 'contract-1',
      installment_number: 1,
      amount: 300,
      due_date: '2026-06-01',
      payment_status: 'pending',
      stripe_checkout_session_id: null,
      stripe_payment_intent_id: null,
      paid_at: null,
    },
  ];

  storageFiles = new Map<string, Buffer>();

  constructor() {
    this.storageFiles.set(this.template.pdf_url, Buffer.from('fake-docx'));
    this.storageFiles.set(this.contract.pdf_url!, Buffer.from('%PDF-fake'));
  }

  findToken(token: string) {
    return this.tokens.find((t) => t.token === token) ?? null;
  }

  insertToken(contractId: string, token: string, expiresAt: string) {
    const row: FlowToken = {
      id: `tok-${this.tokens.length + 1}`,
      contract_id: contractId,
      token,
      expires_at: expiresAt,
      used_at: null,
    };
    this.tokens.push(row);
    return row;
  }
}

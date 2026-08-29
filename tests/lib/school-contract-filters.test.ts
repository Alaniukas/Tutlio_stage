import { describe, expect, it } from 'vitest';
import {
  countContractsByFilter,
  currentContractPdfPath,
  getContractMissingFieldLabels,
  matchesContractFilter,
  schoolCanInitiateSignature,
  shouldPromptSchoolSignedOnScan,
} from '@/lib/schoolContractFilters';

const baseStudent = {
  full_name: 'Jonas Jonaitis',
  payer_name: 'Petras Petraitis',
  payer_email: 'p@example.com',
  payer_phone: '+37060000000',
  payer_personal_code: '39001010000',
  student_address: 'Gatvė 1',
  student_city: 'Vilnius',
  child_birth_date: '2015-01-01',
  media_publicity_consent: 'agree',
};

const schoolSigned = [{ role: 'school', status: 'signed', signed_pdf_path: 'org/signed/school.pdf' }];

const baseContract = {
  signing_status: 'sent' as const,
  media_publicity_consent: 'agree',
  completion_submitted_at: '2026-08-01T10:00:00.000Z',
  student: baseStudent,
};

describe('schoolContractFilters', () => {
  it('detects all missing fields for school view', () => {
    const missing = getContractMissingFieldLabels(
      {
        signing_status: 'sent',
        media_publicity_consent: null,
        student: {
          student_address: '',
          student_city: '',
          child_birth_date: '',
          payer_personal_code: '',
          payer_phone: '',
          media_publicity_consent: null,
        },
      },
      true,
    );
    expect(missing).toEqual([
      'Gyvenamoji vieta',
      'Vaiko gimimo data',
      'Tėvų asmens kodas',
      'Tėvų tel. nr.',
      'Vaiko atvaizdo naudojimo sutikimas',
    ]);
  });

  it('does not require media consent outside school view', () => {
    const missing = getContractMissingFieldLabels(
      {
        signing_status: 'sent',
        media_publicity_consent: null,
        student: { ...baseStudent, media_publicity_consent: null },
      },
      false,
    );
    expect(missing).toEqual([]);
  });

  it('does not treat leftover student consent as this contract being filled', () => {
    const missing = getContractMissingFieldLabels(
      {
        signing_status: 'sent',
        media_publicity_consent: null,
        student: { ...baseStudent, media_publicity_consent: 'disagree' },
      },
      true,
    );
    expect(missing).toContain('Vaiko atvaizdo naudojimo sutikimas');
  });

  it('matches granular filters', () => {
    expect(matchesContractFilter('signed', { ...baseContract, signing_status: 'signed' }, true)).toBe(true);
    expect(matchesContractFilter('draft', { ...baseContract, signing_status: 'draft' }, true)).toBe(true);
    expect(matchesContractFilter('sent', { ...baseContract, signing_status: 'sent' }, true)).toBe(true);
    expect(matchesContractFilter('awaiting_school', { ...baseContract, signing_status: 'awaiting_school_signature' }, true)).toBe(true);
    expect(matchesContractFilter('awaiting_parents', {
      ...baseContract,
      signing_status: 'signed_by_school',
      signatures: schoolSigned,
    }, true)).toBe(true);
    expect(matchesContractFilter('incomplete_data', {
      signing_status: 'sent',
      media_publicity_consent: null,
      student: { ...baseStudent, payer_phone: '' },
    }, true)).toBe(true);
    expect(matchesContractFilter('incomplete_data', { ...baseContract, signing_status: 'signed' }, true)).toBe(false);
  });

  it('puts parent-uploaded copies without a school signature into awaiting_school', () => {
    const parentCopy = {
      ...baseContract,
      signing_status: 'signed_by_school' as const,
      completion_submitted_at: '2026-08-01T00:00:00Z',
      signatures: [{ role: 'parent_primary', status: 'signed' }, { role: 'school', status: 'pending' }],
    };
    expect(matchesContractFilter('awaiting_school', parentCopy, true)).toBe(true);
    expect(matchesContractFilter('awaiting_parents', parentCopy, true)).toBe(false);
    expect(schoolCanInitiateSignature(parentCopy)).toBe(true);
  });

  it('keeps a fully signed manual upload out of awaiting_school even without GoSign rows', () => {
    const bothPartiesScan = {
      ...baseContract,
      signing_status: 'signed' as const,
      signed_contract_url: 'org/signed/butkus.pdf',
      signatures: [{ role: 'parent_primary', status: 'pending' }, { role: 'school', status: 'pending' }],
    };
    expect(matchesContractFilter('signed', bothPartiesScan, true)).toBe(true);
    expect(matchesContractFilter('awaiting_school', bothPartiesScan, true)).toBe(false);
    expect(matchesContractFilter('awaiting_parents', bothPartiesScan, true)).toBe(false);
    expect(schoolCanInitiateSignature(bothPartiesScan)).toBe(false);
  });

  it('asks where to file a parent scan only when e-sign is on and school has not signed', () => {
    const waiting = {
      ...baseContract,
      signing_status: 'awaiting_school_signature' as const,
      signatures: [{ role: 'school', status: 'pending' }],
    };
    expect(shouldPromptSchoolSignedOnScan(waiting, true)).toBe(true);
    expect(shouldPromptSchoolSignedOnScan(waiting, false)).toBe(false);
    expect(shouldPromptSchoolSignedOnScan({ ...waiting, signing_status: 'signed' }, true)).toBe(false);
    expect(shouldPromptSchoolSignedOnScan({
      ...waiting,
      signatures: [{ role: 'school', status: 'signed' }],
    }, true)).toBe(false);
    expect(schoolCanInitiateSignature({
      signing_status: 'awaiting_school_signature',
      signatures: [{ role: 'school', status: 'pending' }],
    })).toBe(true);
  });

  it('counts contracts per filter', () => {
    const contracts = [
      { ...baseContract, signing_status: 'signed' as const },
      { ...baseContract, signing_status: 'awaiting_school_signature' as const },
      { ...baseContract, signing_status: 'signed_by_school' as const, signatures: schoolSigned },
      {
        ...baseContract,
        signing_status: 'sent' as const,
        student: { ...baseStudent, payer_phone: '' },
      },
    ];
    const counts = countContractsByFilter(contracts, true);
    expect(counts.all).toBe(4);
    expect(counts.signed).toBe(1);
    expect(counts.awaiting_school).toBe(1);
    expect(counts.awaiting_parents).toBe(1);
    expect(counts.sent).toBe(1);
    expect(counts.draft).toBe(0);
    expect(counts.incomplete_data).toBe(1);
  });

  it('complete draft/sent appear only under their status filters (not incomplete)', () => {
    const contracts = [
      { ...baseContract, signing_status: 'draft' as const },
      { ...baseContract, signing_status: 'sent' as const },
      { ...baseContract, signing_status: 'awaiting_school_signature' as const },
      { ...baseContract, signing_status: 'signed_by_school' as const, signatures: schoolSigned },
      { ...baseContract, signing_status: 'signed' as const },
    ];
    const counts = countContractsByFilter(contracts, true);
    expect(counts.all).toBe(5);
    expect(counts.draft).toBe(1);
    expect(counts.sent).toBe(1);
    expect(counts.awaiting_school).toBe(1);
    expect(counts.awaiting_parents).toBe(1);
    expect(counts.signed).toBe(1);
    expect(counts.incomplete_data).toBe(0);
    // Status filters partition Visos (incomplete_data is orthogonal)
    expect(
      counts.draft + counts.sent + counts.awaiting_school + counts.awaiting_parents + counts.signed,
    ).toBe(counts.all);
  });

  it('incomplete_data can overlap with awaiting statuses', () => {
    const contracts = [
      {
        ...baseContract,
        signing_status: 'awaiting_school_signature' as const,
        student: { ...baseStudent, payer_phone: '' },
      },
      { ...baseContract, signing_status: 'sent' as const },
    ];
    const counts = countContractsByFilter(contracts, true);
    expect(counts.awaiting_school).toBe(1);
    expect(counts.incomplete_data).toBe(1);
    expect(counts.sent).toBe(1);
    expect(counts.all).toBe(2);
  });

  it('treats e-sign contracts waiting for parent confirmation as incomplete data', () => {
    const waiting = {
      signing_status: 'sent' as const,
      media_publicity_consent: 'agree' as const,
      completion_submitted_at: null,
      student: baseStudent,
    };
    expect(matchesContractFilter('incomplete_data', waiting, true)).toBe(false);
    expect(matchesContractFilter('incomplete_data', waiting, true, { eSignEnabled: true })).toBe(true);
    expect(matchesContractFilter('incomplete_data', {
      ...waiting,
      media_publicity_consent: null,
    }, true)).toBe(true);
  });

  it('prefers the newest signed PDF over a parent scan stored as signed_contract_url', () => {
    expect(currentContractPdfPath({
      pdf_url: 'org/scan.pdf',
      signed_contract_url: 'org/scan.pdf',
      signatures: schoolSigned,
    })).toBe('org/signed/school.pdf');
  });
});

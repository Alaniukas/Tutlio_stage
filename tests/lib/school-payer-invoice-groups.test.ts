import { describe, expect, it } from 'vitest';
import { groupSchoolPayerInvoicePreviews, schoolStudentInvoiceSendable } from '../../src/lib/schoolPayerInvoiceGroups';

const kajus = {
  studentId: 'kajus',
  fullName: 'Adomaitis Kajus',
  totalEur: 6,
  lessonCount: 1,
  reviewSessionIds: [],
  alreadyIssued: false,
  payerEmail: 'akvile@example.com',
  payerName: 'Akvilė Adomaitytė',
  previewToken: 't-kajus',
};
const etme = { ...kajus, studentId: 'etme', fullName: 'Vitkutė Etmė', totalEur: 12, lessonCount: 2, previewToken: 't-etme' };
const palaima = {
  studentId: 'palaima',
  fullName: 'Palaima Jokūbas',
  totalEur: 6,
  lessonCount: 1,
  reviewSessionIds: [],
  alreadyIssued: false,
  payerEmail: 'raimonda@example.com',
  payerName: 'Raimonda Širvytė',
  previewToken: 't-palaima',
};

describe('school payer invoice groups', () => {
  it('keeps siblings together and never mixes another family into that invoice', () => {
    const groups = groupSchoolPayerInvoicePreviews([palaima, etme, kajus]);
    expect(groups.map((group) => group.payerEmail)).toEqual(['akvile@example.com', 'raimonda@example.com']);
    expect(groups[0].students.map((row) => row.fullName)).toEqual(['Adomaitis Kajus', 'Vitkutė Etmė']);
    expect(groups[0].totalEur).toBe(18);
    expect(groups[0].sendableStudentIds).toEqual(['kajus', 'etme']);
    expect(groups[1].students.map((row) => row.fullName)).toEqual(['Palaima Jokūbas']);
  });

  it('merges duplicate student.id preview rows for the same payer and child name', () => {
    const domasA = { ...kajus, studentId: 'domas-a', fullName: 'Sakalauskas Domas', payerEmail: 'sakalevaida@gmail.com', payerName: 'Vaida Sakalauskienė', totalEur: 40, lessonCount: 2, previewToken: 't-a' };
    const domasB = { ...kajus, studentId: 'domas-b', fullName: 'Sakalauskas Domas', payerEmail: 'sakalevaida@gmail.com', payerName: 'Vaida Sakalauskienė', totalEur: 20, lessonCount: 1, previewToken: 't-b' };
    const groups = groupSchoolPayerInvoicePreviews([domasA, domasB, palaima]);
    expect(groups).toHaveLength(2);
    const domasGroup = groups.find((group) => group.payerEmail === 'sakalevaida@gmail.com');
    expect(domasGroup?.students).toHaveLength(2);
    expect(domasGroup?.students.map((row) => row.studentId)).toEqual(['domas-a', 'domas-b']);
    expect(domasGroup?.totalEur).toBe(60);
    expect(domasGroup?.sendableStudentIds).toEqual(['domas-a', 'domas-b']);
  });

  it('does not mark a child sendable until lessons, payer email and attendance are ready', () => {
    expect(schoolStudentInvoiceSendable(kajus)).toBe(true);
    expect(schoolStudentInvoiceSendable({ ...kajus, payerEmail: '' })).toBe(false);
    expect(schoolStudentInvoiceSendable({ ...kajus, reviewSessionIds: ['s1'] })).toBe(false);
    expect(schoolStudentInvoiceSendable({ ...kajus, alreadyIssued: true })).toBe(false);
    expect(schoolStudentInvoiceSendable({ ...kajus, lessonCount: 0 })).toBe(false);
  });
});

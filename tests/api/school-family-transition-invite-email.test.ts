import { describe, expect, it } from 'vitest';
import {
  schoolFamilyTransitionInviteHtml,
  schoolFamilyTransitionInviteSubject,
  schoolFamilyTransitionInviteText,
  schoolFamilyUnsignedAnnualAdminHtml,
  schoolFamilyUnsignedAnnualAdminSubject,
} from '../../api/_lib/schoolFamilyTransitionInviteEmail';
import { groupSchoolFamilyTransitionFamilies } from '../../api/_lib/schoolFamilyTransitionBulk';

describe('school family transition invite email', () => {
  it('keeps a warm Lithuanian explanation and real HTML bold for October 31', () => {
    const html = schoolFamilyTransitionInviteHtml({
      orgName: 'Mokykla be sienų „Laisvi vaikai“',
      studentNames: ['Austėja', 'Motiejus'],
      login: 'tevas@example.test',
      invitationUrl: 'https://tutlio.lt/account-activate?t=token',
      isReady: false,
      contactEmail: 'info@laisvivaikai.lt',
    });
    expect(schoolFamilyTransitionInviteSubject(['Austėja', 'Motiejus'])).toBe('Šeimos paskyra – Austėja ir Motiejus');
    expect(html).toContain('<strong>2026 m. lapkričio 1 d.</strong>');
    expect(html).toContain('<strong>spalio 31 d.</strong>');
    expect(html).toContain('<strong>Austėja ir Motiejus</strong>');
    expect(html).not.toContain('&lt;strong&gt;');
    expect(html).toContain('Aktyvuoti paskyrą');
    expect(html).not.toContain('pamok');
    expect(schoolFamilyTransitionInviteText({
      orgName: 'Mokykla be sienų „Laisvi vaikai“',
      studentNames: ['Motiejus'],
      login: 'tevas@example.test',
      invitationUrl: 'https://tutlio.lt/account-activate?t=token',
      isReady: true,
    })).toContain('Iki spalio 31 d.');
  });

  it('groups siblings into one parent invitation and lists unsigned annual families for the admin', () => {
    expect(groupSchoolFamilyTransitionFamilies([
      { studentId: '1', studentName: 'Aja', guardianEmail: 'sjakunskaite@gmail.com', guardianName: 'Staselė' },
      { studentId: '2', studentName: 'Una', guardianEmail: 'Sjakunskaite@gmail.com', guardianName: 'Staselė' },
    ])).toEqual([{
      guardianEmail: 'sjakunskaite@gmail.com', guardianName: 'Staselė',
      studentIds: ['1', '2'], studentNames: ['Aja', 'Una'],
    }]);
    const html = schoolFamilyUnsignedAnnualAdminHtml({
      orgName: 'Mokykla be sienų „Laisvi vaikai“',
      rows: [{ studentName: 'Aja Kepežinskaitė', payerName: 'Staselė Jakunskaitė', payerEmail: 'sjakunskaite@gmail.com', reason: 'annual_contract_required' }],
    });
    expect(schoolFamilyUnsignedAnnualAdminSubject()).toContain('nėra metinės sutarties');
    expect(html).toContain('Aja Kepežinskaitė');
    expect(html).toContain('Nėra pasirašytos metinės sutarties');
    expect(html).not.toContain('pamok');
  });
});

import { describe, expect, it } from 'vitest';
import {
  buildSchoolStudentExportRows,
  matchesMediaConsentFilter,
  mediaConsentLabel,
} from '@/lib/schoolStudentsExport';

const t = (key: string) => key;

describe('schoolStudentsExport', () => {
  it('labels media consent values', () => {
    expect(mediaConsentLabel('agree', t)).toBe('compStu.mediaConsentAgree');
    expect(mediaConsentLabel('disagree', t)).toBe('compStu.mediaConsentDisagree');
    expect(mediaConsentLabel(null, t)).toBe('compStu.mediaConsentUnknown');
  });

  it('filters by media consent', () => {
    expect(matchesMediaConsentFilter('agree', 'agree')).toBe(true);
    expect(matchesMediaConsentFilter('disagree', 'agree')).toBe(false);
    expect(matchesMediaConsentFilter(null, 'unknown')).toBe(true);
    expect(matchesMediaConsentFilter('agree', 'all')).toBe(true);
  });

  it('builds export rows sorted by grade then name', () => {
    const rows = buildSchoolStudentExportRows([
      {
        student: {
          id: 's2',
          full_name: 'Zofija',
          grade: '10 klasė',
          media_publicity_consent: 'disagree',
          payer_name: 'Mama',
        },
        contract: { signing_status: 'signed' },
      },
      {
        student: {
          id: 's1',
          full_name: 'Antanas',
          grade: '5 klasė',
          media_publicity_consent: 'agree',
        },
        contract: null,
      },
    ], t);

    expect(rows.map((r) => r.studentName)).toEqual(['Antanas', 'Zofija']);
    expect(rows[0].grade).toBe('5 klasė');
    expect(rows[0].mediaConsent).toBe('compStu.mediaConsentAgree');
    expect(rows[1].contractStatus).toBe('compStu.contractSigned');
  });
});

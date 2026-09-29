import { describe, expect, it } from 'vitest';
import { mergeEditedTutorSubjectPay } from '@/pages/company/CompanyTutors';

describe('company tutor subject pay edits', () => {
  it('retains hidden and concurrently added rates when one visible rate changes', () => {
    expect(mergeEditedTutorSubjectPay(
      { visible: 18, hidden: 24, addedByAnotherAdmin: 30 },
      { visible: '20', hidden: '24' },
      new Set(['visible']),
    )).toEqual({ visible: 20, hidden: 24, addedByAnotherAdmin: 30 });
  });

  it('removes only an override the admin deliberately cleared', () => {
    expect(mergeEditedTutorSubjectPay(
      { visible: 18, hidden: 24 },
      { visible: '', hidden: '24' },
      new Set(['visible']),
    )).toEqual({ hidden: 24 });
  });
});

import { describe, expect, it } from 'vitest';
import {
  buildPublicLinkToken,
  buildSchoolHomeworkUrl,
  buildSchoolMonthlyInvoicePayUrl,
  verifyPublicLinkToken,
} from '../../api/_lib/publicLinkToken';

const SECRET = 'test-secret';

describe('publicLinkToken', () => {
  it('is deterministic per (scope, id) and rejects other ids, scopes and tampering', () => {
    const token = buildPublicLinkToken('homework', 'student-1', SECRET);
    expect(token).toHaveLength(40);
    expect(buildPublicLinkToken('homework', 'student-1', SECRET)).toBe(token);
    expect(verifyPublicLinkToken('homework', 'student-1', token, SECRET)).toBe(true);
    expect(verifyPublicLinkToken('homework', 'student-2', token, SECRET)).toBe(false);
    expect(verifyPublicLinkToken('monthly-invoice', 'student-1', token, SECRET)).toBe(false);
    expect(verifyPublicLinkToken('homework', 'student-1', `${token.slice(0, -1)}x`, SECRET)).toBe(false);
    expect(verifyPublicLinkToken('homework', 'student-1', '', SECRET)).toBe(false);
    expect(verifyPublicLinkToken('homework', 'student-1', token, '')).toBe(false);
  });

  it('builds the public homework and pay URLs with their tokens', () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = SECRET;
    const homework = buildSchoolHomeworkUrl('https://tutlio.lt/', 'student-1');
    expect(homework).toBe(`https://tutlio.lt/school-homework?student=student-1&t=${buildPublicLinkToken('homework', 'student-1', SECRET)}`);
    const pay = buildSchoolMonthlyInvoicePayUrl('https://tutlio.lt', 'inv-1');
    expect(pay).toBe(`https://tutlio.lt/api/pay-school-monthly-invoice?invoice=inv-1&t=${buildPublicLinkToken('monthly-invoice', 'inv-1', SECRET)}`);
  });
});

import { describe, expect, it } from 'vitest';
import {
  mvPayerFeeNoticeFooterHtml,
  mvPayerFeeNoticeSentSet,
  normalizeMvPayerEmail,
  shouldAppendMvPayerFirstFeeNotice,
} from '../../api/_lib/mvPayerFeeNotice';
import { MOKSLO_VAISIAI_ORG_ID } from '@/lib/marketMoney';

describe('mvPayerFeeNotice', () => {
  it('normalizes payer emails', () => {
    expect(normalizeMvPayerEmail(' Parent@Example.com ')).toBe('parent@example.com');
  });

  it('reads sent payer emails from org features', () => {
    const sent = mvPayerFeeNoticeSentSet({
      mv_payer_fee_notice_emails: ['a@b.lt', 'B@C.LT'],
    });
    expect(sent.has('a@b.lt')).toBe(true);
    expect(sent.has('b@c.lt')).toBe(true);
  });

  it('renders a structured payment info block in Lithuanian', () => {
    const html = mvPayerFeeNoticeFooterHtml('lt');
    expect(html).toContain('Mokėjimai ir dokumentai vienoje vietoje');
    expect(html).toContain('sąskaitas faktūras');
    expect(html).not.toContain('pridedamas mažas');
  });

  it('returns false when payer already received the notice', async () => {
    const supabase = {
      from(table: string) {
        if (table === 'students') {
          return {
            select: () => ({
              eq: () => ({
                ilike: async () => ({ count: 1, error: null }),
              }),
            }),
          };
        }
        if (table === 'organizations') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: { features: { mv_payer_fee_notice_emails: ['parent@example.com'] } },
                }),
              }),
            }),
          };
        }
        throw new Error(`unexpected table ${table}`);
      },
    };

    const include = await shouldAppendMvPayerFirstFeeNotice(
      supabase as never,
      MOKSLO_VAISIAI_ORG_ID,
      'parent@example.com',
    );
    expect(include).toBe(false);
  });
});

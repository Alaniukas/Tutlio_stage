import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MANO_KOREPETITORIUS_ORG_ID } from '../../src/lib/marketMoney';

const mocks = vi.hoisted(() => ({
  enabled: true,
  from: vi.fn(),
  update: vi.fn(),
  selectedOrgIds: [] as string[],
  updatedOrgIds: [] as string[],
  features: {
    org_payer_fee_split: true,
    monthly_billing: true,
    payer_fee_split: { platform_share: 100, stripe_percent_share: 50, stripe_fixed_share: 0 },
  } as Record<string, unknown>,
}));

vi.mock('../../src/lib/supabase', () => ({ supabase: { from: mocks.from } }));
vi.mock('../../src/lib/i18n', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('../../src/hooks/useOrgFeatures', () => ({
  useOrgFeatures: () => ({ hasFeature: () => mocks.enabled, loading: false }),
}));

import OrgPayerFeeSplitSettings from '../../src/components/company/OrgPayerFeeSplitSettings';

describe('organization payer fee split settings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.enabled = true;
    mocks.selectedOrgIds.length = 0;
    mocks.updatedOrgIds.length = 0;
    mocks.from.mockImplementation(() => ({
      select: () => ({
        eq: (_column: string, orgId: string) => {
          mocks.selectedOrgIds.push(orgId);
          return { maybeSingle: async () => ({ data: { features: mocks.features }, error: null }) };
        },
      }),
      update: (payload: unknown) => {
        mocks.update(payload);
        return {
          eq: async (_column: string, orgId: string) => {
            mocks.updatedOrgIds.push(orgId);
            return { error: null };
          },
        };
      },
    }));
  });

  it('allows Mano Korepetitorius to edit fee shares and preserves its other features', async () => {
    render(<OrgPayerFeeSplitSettings orgId={MANO_KOREPETITORIUS_ORG_ID} />);

    const sliders = await screen.findAllByRole('slider');
    expect(sliders.map((slider) => (slider as HTMLInputElement).value)).toEqual(['100', '50', '0']);
    fireEvent.change(sliders[1], { target: { value: '25' } });
    fireEvent.click(screen.getByRole('button', { name: 'companyFinance.payerFeeSplitSave' }));

    await waitFor(() => expect(mocks.update).toHaveBeenCalledWith({
      features: {
        ...mocks.features,
        payer_fee_split: { platform_share: 100, stripe_percent_share: 25, stripe_fixed_share: 0 },
      },
    }));
    expect(mocks.selectedOrgIds).toEqual([MANO_KOREPETITORIUS_ORG_ID, MANO_KOREPETITORIUS_ORG_ID]);
    expect(mocks.updatedOrgIds).toEqual([MANO_KOREPETITORIUS_ORG_ID]);
    await screen.findByText('companyFinance.payerFeeSplitSaved');
  });

  it('keeps the settings unavailable when the feature flag is disabled', () => {
    mocks.enabled = false;
    render(<OrgPayerFeeSplitSettings orgId={MANO_KOREPETITORIUS_ORG_ID} />);

    expect(screen.queryByRole('slider')).toBeNull();
    expect(mocks.from).not.toHaveBeenCalled();
  });
});

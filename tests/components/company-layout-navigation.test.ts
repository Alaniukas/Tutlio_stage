import { describe, expect, it } from 'vitest';
import { buildCompanyNavItems } from '@/components/CompanyLayout';

const translate = (key: string) => key;

describe('organization sidebar navigation', () => {
  it('hides dynamic pricing for schools and keeps instructions last', () => {
    const paths = buildCompanyNavItems(true, '/school', translate).map((item) => item.href);

    expect(paths).not.toContain('/school/dynamic-pricing');
    expect(paths.at(-1)).toBe('/school/instructions');
  });

  it('can hide instructions for Pro Klasė-style orgs', () => {
    const paths = buildCompanyNavItems(false, '/company', translate, true, false, false).map(
      (item) => item.href,
    );
    expect(paths).not.toContain('/company/instructions');
    expect(paths.at(-1)).toBe('/company/dynamic-pricing');
  });
});

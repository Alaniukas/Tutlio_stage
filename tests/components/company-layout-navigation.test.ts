import { describe, expect, it } from 'vitest';
import { buildCompanyNavItems } from '@/components/CompanyLayout';

const translate = (key: string) => key;

describe('organization sidebar navigation', () => {
  it('hides dynamic pricing for schools and keeps instructions last', () => {
    const paths = buildCompanyNavItems(true, '/school', translate).map((item) => item.href);

    expect(paths).not.toContain('/school/dynamic-pricing');
    expect(paths.at(-1)).toBe('/school/instructions');
  });

  it('keeps dynamic pricing for tutor organizations and instructions last', () => {
    const paths = buildCompanyNavItems(false, '/company', translate, true).map((item) => item.href);

    expect(paths).toContain('/company/dynamic-pricing');
    expect(paths.at(-2)).toBe('/company/dynamic-pricing');
    expect(paths.at(-1)).toBe('/company/instructions');
  });
});

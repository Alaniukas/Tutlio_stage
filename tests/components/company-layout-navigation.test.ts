import { describe, expect, it } from 'vitest';
import { buildCompanyNavItems } from '@/components/CompanyLayout';

const translate = (key: string) => key;

describe('organization sidebar navigation', () => {
  it('lets restricted admin seats reach their personal settings without organization settings access', () => {
    const items = buildCompanyNavItems(false, '/company', translate, false, false, true, false, false, false, false, true);
    expect(items.find(item => item.href === '/company/notification-settings')).toMatchObject({ permission: null });
    expect(items.at(-1)?.href).toBe('/company/instructions');
    expect(buildCompanyNavItems(false, '/company', translate, false).some(item => item.href === '/company/notification-settings')).toBe(false);
  });
  it('hides dynamic pricing for schools and keeps instructions last', () => {
    const paths = buildCompanyNavItems(true, '/school', translate).map((item) => item.href);

    expect(paths).not.toContain('/school/dynamic-pricing');
    expect(paths).not.toContain('/school/recordings');
    expect(paths.at(-1)).toBe('/school/instructions');
  });

  it('shows staff documents for Demo Mokykla when the feature is enabled', () => {
    const paths = buildCompanyNavItems(true, '/school', translate, false, false, true, true, false, true)
      .map((item) => item.href);

    expect(paths).toContain('/school/staff-documents');
  });

  it('shows recordings only when the Drive feature is ready for the school', () => {
    const paths = buildCompanyNavItems(true, '/school', translate, false, false, true, true, true)
      .map((item) => item.href);

    expect(paths).toContain('/school/recordings');
  });

  it('can hide instructions for Pro Klasė-style orgs', () => {
    const paths = buildCompanyNavItems(false, '/company', translate, true, false, false).map(
      (item) => item.href,
    );
    expect(paths).not.toContain('/company/instructions');
    expect(paths.at(-1)).toBe('/company/team');
  });
});

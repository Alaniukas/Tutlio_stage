import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = (path: string) => readFileSync(path, 'utf8').replace(/\r\n/g, '\n');

describe('dashboard mobile layout safeguards', () => {
  it('keeps the PWA prompt away from the mobile header and exposes touch-sized actions', () => {
    const prompt = source('src/components/PwaInstallPrompt.tsx');

    expect(prompt).toContain("bottom-[max(1rem,env(safe-area-inset-bottom))]");
    expect(prompt).toContain("bottom-[calc(5.75rem+env(safe-area-inset-bottom))]");
    expect(prompt.match(/min-h-\[44px\]/g)?.length).toBeGreaterThanOrEqual(3);
    expect(prompt).toContain('min-w-[44px]');
  });

  it('stacks dense tutor status actions into a two-column mobile grid', () => {
    const dashboard = source('src/pages/Dashboard.tsx');

    expect(dashboard).toContain('grid w-full grid-cols-2 gap-2 sm:w-auto sm:flex sm:flex-wrap');
    expect(dashboard.match(/min-h-\[44px\] rounded-xl/g)?.length).toBeGreaterThanOrEqual(4);
  });

  it('separates company and school attention actions from the row summary', () => {
    const company = source('src/pages/company/CompanyDashboard.tsx');
    const school = source('src/pages/company/SchoolDashboard.tsx');

    expect(company).toContain('mt-2 flex gap-2');
    expect(company).toContain('min-h-[44px] flex-1 touch-manipulation');
    expect(company).toContain('min-h-[44px] min-w-[44px]');
    expect(school).toContain('mt-2 flex min-h-[44px] w-full touch-manipulation');
    expect(school).toContain('min-h-[44px] min-w-[44px]');
  });
});

import { describe, expect, it } from 'vitest';
import { orgIdentityPricingFrequency, fetchOrgStudentDynamicPrice, type PricingIdentityStudent } from '../../src/lib/orgStudentPricing';
import { findOrganizationDynamicPrice } from '../../src/lib/organizationDynamicPricing';

const child: PricingIdentityStudent = { id: 'a', organization_id: '3422031d-6e21-424d-980b-35a9c6d7b8f1', linked_user_id: 'login', full_name: 'Child', grade: '5 klasė', pricing_lessons_per_week: 1 };
const otherTutor = { ...child, id: 'b' };
const templates = [{ id: 'r1', student_id: 'a', active: true }, { id: 'r2', student_id: 'b', active: true }];
const rules = [{ grade_min: 1, grade_max: 8, lessons_per_week: 1, price: 29 }, { grade_min: 1, grade_max: 8, lessons_per_week: 2, price: 27 }];

describe('organization identity pricing', () => {
  it('counts two tutors together and selects 27 instead of stale 29', () => {
    const frequency = orgIdentityPricingFrequency(child, [child, otherTutor], templates);
    expect(frequency).toBe(2);
    expect(findOrganizationDynamicPrice(rules, child, frequency)).toBe(27);
  });
  it('excludes other organizations, siblings, inactive templates and detached rows', () => {
    const rows = [child, { ...child, id: 'b', organization_id: 'elsewhere' }, { ...child, id: 'c', full_name: 'Sibling' }, { ...child, id: 'd', detached_at: '2026-09-01' }];
    const recurring = ['a', 'b', 'c', 'd'].map(student_id => ({ id: student_id, student_id, active: true }));
    expect(orgIdentityPricingFrequency(child, rows, [...recurring, { id: 'inactive', student_id: 'a', active: false }])).toBe(1);
  });
  it('honors manual contracted frequency without summing it across tutor rows', () => {
    const manual = { ...otherTutor, pricing_lessons_per_week: 2, pricing_lessons_per_week_is_manual: true };
    expect(orgIdentityPricingFrequency(child, [child, manual], [])).toBe(2);
  });
  it('rejects conflicting manual contracts instead of assigning different rates', () => {
    expect(() => orgIdentityPricingFrequency(child, [
      { ...child, pricing_lessons_per_week_is_manual: true },
      { ...otherTutor, pricing_lessons_per_week: 2, pricing_lessons_per_week_is_manual: true },
    ], templates)).toThrow('Conflicting');
  });
  it('deduplicates template ids but counts two lessons on the same weekday', () => {
    expect(orgIdentityPricingFrequency(child, [child, otherTutor], [...templates, templates[0]])).toBe(2);
  });
  it('excludes expired active templates and retains existing biweekly contract semantics', () => {
    expect(orgIdentityPricingFrequency(child, [child, otherTutor], [
      { ...templates[0], end_date: '2026-09-07' },
      { ...templates[1], frequency: 'biweekly', end_date: '2026-09-08' },
    ], '2026-09-08')).toBe(1);
  });
  it('keeps other organizations scoped to their individual student row', () => {
    const other = { ...child, organization_id: 'other' };
    expect(orgIdentityPricingFrequency(other, [other, { ...otherTutor, organization_id: 'other' }], templates)).toBe(1);
  });
  it('refreshes price from current database rows on every creation call', async () => {
    let active = templates.slice(0, 1);
    const db = { from(table: string) {
      const query: any = {
        select: () => query, eq: () => query, is: () => query, in: () => query,
        single: async () => ({ data: child, error: null }),
        then(resolve: any) { return Promise.resolve({ data: table === 'students' ? [child, otherTutor] : table === 'organization_dynamic_pricing' ? rules : active, error: null }).then(resolve); },
      };
      return query;
    } };
    expect((await fetchOrgStudentDynamicPrice(db as any, child.id)).price).toBe(29);
    active = templates;
    const refreshed = await fetchOrgStudentDynamicPrice(db as any, child.id);
    expect(refreshed).toEqual({ price: 27, lessonsPerWeek: 2, studentIds: ['a', 'b'] });
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadOrgScheduleMetadata } from '@/lib/orgScheduleData';

const state = vi.hoisted(() => ({ tutors: vi.fn() }));
vi.mock('@/lib/orgVisibleTutors', () => ({ getOrgVisibleTutors: state.tutors }));

type Row = Record<string, unknown>;
type Request = { table: string; byTutor: boolean; signal?: AbortSignal };
const data: Record<string, Row[]> = {
  subjects: [{ id: 'subject', tutor_id: 'tutor', name: 'Maths' }],
  students: [{ id: 'child', tutor_id: 'tutor' }, { id: 'unassigned', tutor_id: null }],
  student_individual_pricing: [{ student_id: 'child', subject_id: 'subject', price: 24 }],
  tutor_subject_prices: [],
  organization_dynamic_pricing: [{ id: 'rule', organization_id: 'org', grade_min: '1', grade_max: '4', lessons_per_week: '1', price: '29' }],
  organizations: [{ org_subject_templates: [{ id: 'template', name: ' Maths ' }], tutor_license_count: 3 }],
};

function clientFor(result?: (request: Request) => unknown) {
  const requests: Request[] = [];
  return {
    requests,
    client: { from: (table: string) => {
      const request: Request = { table, byTutor: false };
      let single = false;
      const query: any = {
        select: () => query, eq: () => query, is: () => query,
        in: () => { request.byTutor = true; return query; },
        abortSignal: (signal: AbortSignal) => { request.signal = signal; return query; },
        maybeSingle: () => { single = true; return query; },
        then: (resolve: any, reject: any) => {
          requests.push(request);
          return Promise.resolve().then(() => result?.(request) ?? {
            data: single ? data[table]?.[0] : data[table] || [], error: null,
          }).then(resolve, reject);
        },
      };
      return query;
    } } as any,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  state.tutors.mockResolvedValue([{ id: 'tutor', full_name: 'Tutor' }]);
});
afterEach(() => vi.useRealTimers());

describe('Organization calendar metadata', () => {
  it('loads one consistent roster and pricing snapshot without reading availability', async () => {
    const { client, requests } = clientFor();
    const result = await loadOrgScheduleMetadata<Row, Row & { id: string }>(client, 'org', true);
    expect(result.students.map(row => row.id)).toEqual(['child', 'unassigned']);
    expect(result.orgUsesLicenses).toBe(true);
    expect(result.orgSubjectTemplates).toEqual([{ id: 'template', name: 'Maths' }]);
    expect(result.dynamicPricingRules[0]).toMatchObject({ grade_min: 1, grade_max: 4, lessons_per_week: 1, price: 29 });
    expect(requests.some(request => request.table === 'availability')).toBe(false);
    expect(requests.every(request => request.signal && !request.signal.aborted)).toBe(true);
    expect(state.tutors.mock.calls[0][3]).toMatchObject({ strict: true });
  });

  it('rejects a failed organization roster even if the tutor roster succeeded', async () => {
    const { client, requests } = clientFor(request => request.table === 'students' && !request.byTutor
      ? { data: null, error: { message: '522' } } : undefined);
    await expect(loadOrgScheduleMetadata(client, 'org', false)).rejects.toThrow('522');
    expect(requests.every(request => request.signal?.aborted)).toBe(true);
  });

  it('propagates tutor authorization/transport failures before caching any metadata', async () => {
    state.tutors.mockRejectedValue(new Error('tutor read failed'));
    const { client, requests } = clientFor();
    await expect(loadOrgScheduleMetadata(client, 'org', false)).rejects.toThrow('tutor read failed');
    expect(requests).toHaveLength(0);
    expect(state.tutors.mock.calls[0][3].signal.aborted).toBe(true);
  });

  it('bounds hung metadata reads and cancels all outstanding requests', async () => {
    vi.useFakeTimers();
    const { client, requests } = clientFor(request => request.table === 'organizations' ? new Promise(() => {}) : undefined);
    const pending = expect(loadOrgScheduleMetadata(client, 'org', false)).rejects.toThrow('request_deadline_exceeded');
    await vi.advanceTimersByTimeAsync(15_000);
    await pending;
    expect(requests.every(request => request.signal?.aborted)).toBe(true);
  });

  it('keeps unassigned students when the organization has no tutors', async () => {
    state.tutors.mockResolvedValue([]);
    const { client, requests } = clientFor();
    const result = await loadOrgScheduleMetadata(client, 'org', false);
    expect(result.orgTutors).toEqual([]);
    expect(result.students).toHaveLength(2);
    expect(requests.some(request => request.byTutor)).toBe(false);
    expect(requests.some(request => request.table === 'organization_dynamic_pricing')).toBe(false);
  });
});

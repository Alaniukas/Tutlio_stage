import { describe, expect, it } from 'vitest';
import {
  CONTRACTS_PAGE_SIZE,
  filterContractSummaries,
  paginateIds,
} from '@/lib/schoolContractsPagination';

describe('schoolContractsPagination', () => {
  const rows = Array.from({ length: 45 }, (_, i) => ({
    id: `c${i}`,
    signing_status: 'sent' as const,
    kind: i % 2 === 0 ? 'extra_lessons' : 'annual',
    student: { full_name: `Student ${i}` },
  }));

  it('paginates 20 rows per page', () => {
    const page0 = paginateIds(rows, 0);
    expect(page0.pageRows).toHaveLength(CONTRACTS_PAGE_SIZE);
    expect(page0.total).toBe(45);
    expect(page0.pageCount).toBe(3);
    const page2 = paginateIds(rows, 2);
    expect(page2.pageRows).toHaveLength(5);
  });

  it('filters by kind before pagination', () => {
    const extra = filterContractSummaries(rows, {
      isSchoolView: true,
      contractFilter: 'all',
      contractKindFilter: 'extra_lessons',
      contractSearch: '',
    });
    expect(extra.length).toBe(23);
    expect(paginateIds(extra, 0).pageRows).toHaveLength(20);
  });
});

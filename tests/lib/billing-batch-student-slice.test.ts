import { describe, expect, it } from 'vitest';
import {
  computeInvoiceDisplayForChild,
  computeSliceFromBatchSessions,
} from '../../src/lib/billingBatchStudentSlice';

describe('computeSliceFromBatchSessions', () => {
  const entries = [
    { session_id: 's1', session_price: 50, student_id: 'child-a' },
    { session_id: 's2', session_price: 40, student_id: 'child-a' },
    { session_id: 's3', session_price: 50, student_id: 'child-b' },
  ];
  const studentsInBatch = new Set(['child-a', 'child-b']);

  it('returns per-student amount and lesson count', () => {
    const slice = computeSliceFromBatchSessions('batch-1', 'child-a', 140, entries, studentsInBatch);
    expect(slice.lesson_count).toBe(2);
    expect(slice.student_amount).toBe(90);
    expect(slice.is_shared_batch).toBe(true);
  });

  it('marks single-student batch as not shared when amounts match', () => {
    const onlyA = entries.filter((e) => e.student_id === 'child-a');
    const slice = computeSliceFromBatchSessions('batch-2', 'child-a', 90, onlyA, new Set(['child-a']));
    expect(slice.is_shared_batch).toBe(false);
    expect(slice.student_amount).toBe(90);
  });
});

describe('computeInvoiceDisplayForChild', () => {
  const childSessions = new Set(['s1', 's2']);

  it('prorates line items by overlapping session_ids', () => {
    const display = computeInvoiceDisplayForChild(
      140,
      [
        { total_price: 90, quantity: 2, session_ids: ['s1', 's2'] },
        { total_price: 50, quantity: 1, session_ids: ['s3'] },
      ],
      childSessions,
    );
    expect(display.lesson_count).toBe(2);
    expect(display.display_amount).toBe(90);
    expect(display.is_shared).toBe(true);
  });

  it('falls back to invoice total when no overlapping lines', () => {
    const display = computeInvoiceDisplayForChild(99, [{ total_price: 99, session_ids: ['other'] }], childSessions);
    expect(display.display_amount).toBe(99);
    expect(display.lesson_count).toBe(0);
  });
});
